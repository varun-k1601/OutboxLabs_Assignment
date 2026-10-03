import type { Campaign, Email } from '../db/schema';
import { indexEmailDocuments, toSearchDocument } from '../integrations/search-index';
import { runInBackground } from '../lib/background-tasks';

type SenderLike = { name: string; email: string };

// ES is only a secondary index, Postgres is the source of truth. So indexing runs in the
// background and a failure never blocks scheduling or sending (npm run reindex fixes it up).
export function syncEmailsToSearch(emails: readonly Email[], campaign: Pick<Campaign, 'bodyText'>, sender: SenderLike): void {
  if (emails.length === 0) return;
  runInBackground('Elasticsearch indexing', () =>
    indexEmailDocuments(emails.map((email) => toSearchDocument(email, campaign, sender))),
  );
}

export function syncEmailToSearch(email: Email | undefined, campaign: Pick<Campaign, 'bodyText'>, sender: SenderLike): void {
  if (email) syncEmailsToSearch([email], campaign, sender);
}
