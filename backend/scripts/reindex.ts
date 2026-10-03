/**
 * Rebuilds the Elasticsearch index from Postgres.
 *   npm run reindex             # upsert every email
 *   npm run reindex -- --fresh  # drop and recreate the index first (after a mapping change)
 */
import { parseArgs } from 'node:util';
import { closeDatabase } from '../src/db/client';
import {
  closeSearch,
  ensureSearchIndex,
  indexEmailDocuments,
  recreateSearchIndex,
  toSearchDocument,
} from '../src/integrations/search-index';
import { emailsRepository } from '../src/repositories/emails.repository';

const { values } = parseArgs({ options: { fresh: { type: 'boolean', default: false } } });

async function main() {
  if (values.fresh) await recreateSearchIndex();
  else await ensureSearchIndex();

  let indexed = 0;
  let failed = 0;
  let afterId: string | null = null;
  for (;;) {
    const rows = await emailsRepository.listWithRelations(afterId, 1000);
    if (rows.length === 0) break;
    failed += await indexEmailDocuments(rows.map(({ email, campaign, sender }) => toSearchDocument(email, campaign, sender)));
    indexed += rows.length;
    afterId = rows[rows.length - 1]!.email.id;
  }
  console.log(`Indexed ${indexed - failed} emails (${failed} failed).`);
}

main()
  .then(() => Promise.allSettled([closeDatabase(), closeSearch()]))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
