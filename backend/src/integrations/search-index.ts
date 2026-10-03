import { Client, errors, type estypes } from '@elastic/elasticsearch';
import { env } from '../config/env';
import type { Campaign, Email, EmailStatus } from '../db/schema';
import { logger } from '../lib/logger';
import { chunk } from '../lib/time';

// what we store in ES, denormalized so a list row doesn't need anything else
export interface EmailSearchDocument {
  id: string;
  userId: string;
  campaignId: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  recipient: string;
  subject: string;
  bodyText: string;
  status: EmailStatus;
  scheduledAt: string;
  originalScheduledAt: string;
  sentAt: string | null;
  failedAt: string | null;
  previewUrl: string | null;
  lastError: string | null;
  createdAt: string;
}

const INDEX = env.ELASTICSEARCH_INDEX;
// body is copied into every recipient's doc, so only keep the start of it
const BODY_TEXT_LIMIT = 2_000;
const BULK_BATCH_SIZE = 500;

const client = new Client({ node: env.ELASTICSEARCH_URL, requestTimeout: 5_000, maxRetries: 1 });

const settings: estypes.IndicesIndexSettings = {
  number_of_shards: 1,
  number_of_replicas: 0,
  analysis: {
    tokenizer: {
      // jane.doe@acme.io -> jane, doe, acme, io -> edge n-grams, so "acm" matches
      autocomplete_tokenizer: { type: 'edge_ngram', min_gram: 2, max_gram: 20, token_chars: ['letter', 'digit'] },
    },
    analyzer: {
      autocomplete: { type: 'custom', tokenizer: 'autocomplete_tokenizer', filter: ['lowercase'] },
      autocomplete_search: { type: 'custom', tokenizer: 'lowercase' },
    },
  },
};

const autocompleteText = { type: 'text', analyzer: 'autocomplete', search_analyzer: 'autocomplete_search' } as const;

const mappings: estypes.MappingTypeMapping = {
  dynamic: 'strict',
  properties: {
    id: { type: 'keyword' },
    userId: { type: 'keyword' },
    campaignId: { type: 'keyword' },
    senderId: { type: 'keyword' },
    senderName: { type: 'text' },
    senderEmail: { ...autocompleteText, fields: { keyword: { type: 'keyword' } } },
    recipient: { ...autocompleteText, fields: { keyword: { type: 'keyword' } } },
    subject: { type: 'text', fields: { prefix: autocompleteText, keyword: { type: 'keyword', ignore_above: 256 } } },
    bodyText: { type: 'text' },
    status: { type: 'keyword' },
    scheduledAt: { type: 'date' },
    originalScheduledAt: { type: 'date' },
    sentAt: { type: 'date' },
    failedAt: { type: 'date' },
    previewUrl: { type: 'keyword', index: false },
    lastError: { type: 'text', index: false },
    createdAt: { type: 'date' },
  },
};

let indexReady: Promise<void> | null = null;

// creates the index the first time, fine to call concurrently or from several processes
export function ensureSearchIndex(): Promise<void> {
  indexReady ??= (async () => {
    if (await client.indices.exists({ index: INDEX })) return;
    try {
      await client.indices.create({ index: INDEX, settings, mappings });
      logger.info({ index: INDEX }, 'Created Elasticsearch index');
    } catch (err) {
      if (err instanceof errors.ResponseError && err.body?.error?.type === 'resource_already_exists_exception') return;
      throw err;
    }
  })().catch((err) => {
    indexReady = null; // retry on the next call
    throw err;
  });
  return indexReady;
}

export async function recreateSearchIndex(): Promise<void> {
  await client.indices.delete({ index: INDEX, ignore_unavailable: true });
  indexReady = null;
  await ensureSearchIndex();
}

export function toSearchDocument(
  email: Email,
  campaign: Pick<Campaign, 'bodyText'>,
  sender: { name: string; email: string },
): EmailSearchDocument {
  return {
    id: email.id,
    userId: email.userId,
    campaignId: email.campaignId,
    senderId: email.senderId,
    senderName: sender.name,
    senderEmail: sender.email,
    recipient: email.recipient,
    subject: email.subject,
    bodyText: campaign.bodyText.slice(0, BODY_TEXT_LIMIT),
    status: email.status,
    scheduledAt: email.scheduledAt.toISOString(),
    originalScheduledAt: email.originalScheduledAt.toISOString(),
    sentAt: email.sentAt?.toISOString() ?? null,
    failedAt: email.failedAt?.toISOString() ?? null,
    previewUrl: email.previewUrl,
    lastError: email.lastError,
    createdAt: email.createdAt.toISOString(),
  };
}

// upsert by email id, returns how many docs failed
export async function indexEmailDocuments(documents: readonly EmailSearchDocument[]): Promise<number> {
  if (documents.length === 0) return 0;
  await ensureSearchIndex();
  let failedCount = 0;
  for (const batch of chunk(documents, BULK_BATCH_SIZE)) {
    const response = await client.bulk({
      operations: batch.flatMap((document) => [{ index: { _index: INDEX, _id: document.id } }, document]),
    });
    if (!response.errors) continue;
    const failed = response.items.filter((item) => item.index?.error);
    failedCount += failed.length;
    logger.warn({ failed: failed.length, sample: failed[0]?.index?.error }, 'Some emails failed to index');
  }
  return failedCount;
}

export interface SearchParams {
  userId: string;
  query: string;
  statuses: readonly EmailStatus[];
  from: number;
  size: number;
  sort: 'scheduled' | 'sent';
}

export async function searchEmailDocuments(params: SearchParams): Promise<{ total: number; documents: EmailSearchDocument[] }> {
  await ensureSearchIndex();
  const dateSort: estypes.SortCombinations[] =
    params.sort === 'scheduled'
      ? [{ scheduledAt: { order: 'asc' } }]
      : [{ sentAt: { order: 'desc', missing: '_last' } }, { failedAt: { order: 'desc' } }];

  const response = await client.search<EmailSearchDocument>({
    index: INDEX,
    from: params.from,
    size: params.size,
    track_total_hits: true,
    query: {
      bool: {
        filter: [{ term: { userId: params.userId } }, { terms: { status: [...params.statuses] } }],
        must: [
          {
            multi_match: {
              query: params.query,
              type: 'most_fields',
              operator: 'and',
              fields: ['recipient^3', 'subject^2', 'subject.prefix', 'senderEmail', 'senderName', 'bodyText'],
            },
          },
        ],
      },
    },
    sort: [{ _score: { order: 'desc' } }, ...dateSort],
  });

  const total = typeof response.hits.total === 'number' ? response.hits.total : (response.hits.total?.value ?? 0);
  const documents = response.hits.hits.flatMap((hit) => (hit._source ? [hit._source] : []));
  return { total, documents };
}

export async function pingSearch(): Promise<boolean> {
  try {
    return await client.ping();
  } catch {
    return false;
  }
}

export async function closeSearch(): Promise<void> {
  await client.close();
}
