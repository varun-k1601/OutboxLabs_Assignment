import { and, asc, count, desc, eq, gt, ilike, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  CLAIMABLE_STATUSES,
  EMAIL_STATUSES,
  FINISHED_STATUSES,
  PENDING_STATUSES,
  campaigns,
  emails,
  senders,
  type Campaign,
  type Email,
  type EmailStatus,
  type Sender,
} from '../db/schema';

export type EmailView = 'scheduled' | 'sent';

export const VIEW_STATUSES: Record<EmailView, readonly EmailStatus[]> = {
  scheduled: PENDING_STATUSES,
  sent: FINISHED_STATUSES,
};

export interface SenderSummary {
  id: string;
  name: string;
  email: string;
}

export interface EmailListRow {
  email: Email;
  bodyPreview: string;
  sender: SenderSummary;
}

export interface EmailSendContext {
  email: Email;
  sender: Sender;
  campaign: Campaign;
}

export interface EmailWithRelations {
  email: Email;
  campaign: Campaign;
  sender: SenderSummary;
}

const MAX_ERROR_LENGTH = 2000;
const senderSummary = { id: senders.id, name: senders.name, email: senders.email };
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export const emailsRepository = {
  async listForUser(params: {
    userId: string;
    view: EmailView;
    page: number;
    pageSize: number;
    search?: string;
  }): Promise<{ rows: EmailListRow[]; total: number }> {
    const { userId, view, page, pageSize, search } = params;
    const conditions = [eq(emails.userId, userId), inArray(emails.status, [...VIEW_STATUSES[view]])];
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      conditions.push(or(ilike(emails.recipient, pattern), ilike(emails.subject, pattern))!);
    }
    const where = and(...conditions);
    const orderBy =
      view === 'scheduled'
        ? [asc(emails.scheduledAt), asc(emails.id)]
        : [desc(sql`coalesce(${emails.sentAt}, ${emails.failedAt}, ${emails.updatedAt})`), asc(emails.id)];

    const [rows, totals] = await Promise.all([
      db
        .select({ email: emails, bodyPreview: sql<string>`left(${campaigns.bodyText}, 180)`, sender: senderSummary })
        .from(emails)
        .innerJoin(campaigns, eq(campaigns.id, emails.campaignId))
        .innerJoin(senders, eq(senders.id, emails.senderId))
        .where(where)
        .orderBy(...orderBy)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ value: count() }).from(emails).where(where),
    ]);
    return { rows, total: totals[0]?.value ?? 0 };
  },

  async countsByStatus(userId: string): Promise<Record<EmailStatus, number>> {
    const rows = await db
      .select({ status: emails.status, value: count() })
      .from(emails)
      .where(eq(emails.userId, userId))
      .groupBy(emails.status);
    const counts = Object.fromEntries(EMAIL_STATUSES.map((status) => [status, 0])) as Record<EmailStatus, number>;
    for (const row of rows) counts[row.status] = row.value;
    return counts;
  },

  async findForUser(id: string, userId: string): Promise<EmailWithRelations | undefined> {
    const [row] = await db
      .select({ email: emails, campaign: campaigns, sender: senderSummary })
      .from(emails)
      .innerJoin(campaigns, eq(campaigns.id, emails.campaignId))
      .innerJoin(senders, eq(senders.id, emails.senderId))
      .where(and(eq(emails.id, id), eq(emails.userId, userId)));
    return row;
  },

  async findSendContext(id: string): Promise<EmailSendContext | undefined> {
    const [row] = await db
      .select({ email: emails, sender: senders, campaign: campaigns })
      .from(emails)
      .innerJoin(senders, eq(senders.id, emails.senderId))
      .innerJoin(campaigns, eq(campaigns.id, emails.campaignId))
      .where(eq(emails.id, id));
    return row;
  },

  // This is the guard against double sends. It moves a pending email to "sending" in one UPDATE,
  // so only one caller can win. Duplicate jobs, retries, other workers etc. get undefined back.
  async claimForSending(id: string): Promise<Email | undefined> {
    const [row] = await db
      .update(emails)
      .set({ status: 'sending', attempts: sql`${emails.attempts} + 1` })
      .where(and(eq(emails.id, id), inArray(emails.status, [...CLAIMABLE_STATUSES])))
      .returning();
    return row;
  },

  async markSent(id: string, result: { messageId: string; previewUrl: string | null; sentAt: Date }) {
    const [row] = await db
      .update(emails)
      .set({
        status: 'sent',
        sentAt: result.sentAt,
        messageId: result.messageId,
        previewUrl: result.previewUrl,
        failedAt: null,
        lastError: null,
      })
      .where(and(eq(emails.id, id), ne(emails.status, 'sent')))
      .returning();
    return row;
  },

  async markFailed(id: string, error: string, fromStatuses: readonly EmailStatus[] = ['sending']) {
    const [row] = await db
      .update(emails)
      .set({ status: 'failed', failedAt: new Date(), lastError: error.slice(0, MAX_ERROR_LENGTH) })
      .where(and(eq(emails.id, id), inArray(emails.status, [...fromStatuses])))
      .returning();
    return row;
  },

  // temporary SMTP error, put it back for another attempt
  async releaseForRetry(id: string, error: string, retryAt: Date) {
    const [row] = await db
      .update(emails)
      .set({ status: 'scheduled', scheduledAt: retryAt, lastError: error.slice(0, MAX_ERROR_LENGTH) })
      .where(and(eq(emails.id, id), eq(emails.status, 'sending')))
      .returning();
    return row;
  },

  // new due time from the limiter, only if the email is still pending
  async reschedule(id: string, scheduledAt: Date, status: 'scheduled' | 'rate_limited') {
    const [row] = await db
      .update(emails)
      .set({ scheduledAt, status })
      .where(and(eq(emails.id, id), inArray(emails.status, [...CLAIMABLE_STATUSES])))
      .returning();
    return row;
  },

  // pending emails, keyset paginated (used by the reconciler on start-up)
  async listClaimable(afterId: string | null, limit: number) {
    return db
      .select({ id: emails.id, recipient: emails.recipient, subject: emails.subject, scheduledAt: emails.scheduledAt })
      .from(emails)
      .where(and(inArray(emails.status, [...CLAIMABLE_STATUSES]), afterId ? gt(emails.id, afterId) : undefined))
      .orderBy(asc(emails.id))
      .limit(limit);
  },

  async filterClaimableIds(ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await db
      .select({ id: emails.id })
      .from(emails)
      .where(and(inArray(emails.id, [...ids]), inArray(emails.status, [...CLAIMABLE_STATUSES])));
    return rows.map((row) => row.id);
  },

  async listStuckSending(updatedBefore: Date) {
    return db
      .select({ id: emails.id })
      .from(emails)
      .where(and(eq(emails.status, 'sending'), lt(emails.updatedAt, updatedBefore)));
  },

  async countPendingForCampaign(campaignId: string): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(emails)
      .where(and(eq(emails.campaignId, campaignId), inArray(emails.status, [...PENDING_STATUSES])));
    return row?.value ?? 0;
  },

  // for rebuilding the ES index
  async listWithRelations(afterId: string | null, limit: number) {
    return db
      .select({ email: emails, campaign: campaigns, sender: senderSummary })
      .from(emails)
      .innerJoin(campaigns, eq(campaigns.id, emails.campaignId))
      .innerJoin(senders, eq(senders.id, emails.senderId))
      .where(afterId ? gt(emails.id, afterId) : undefined)
      .orderBy(asc(emails.id))
      .limit(limit);
  },
};
