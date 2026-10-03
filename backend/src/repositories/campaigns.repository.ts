import { and, eq, max, min } from 'drizzle-orm';
import { db } from '../db/client';
import { campaigns, emails, type Campaign, type Email } from '../db/schema';
import { chunk } from '../lib/time';

export interface NewCampaignInput {
  userId: string;
  senderId: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  startAt: Date;
  delayBetweenMs: number;
  hourlyLimit: number;
  idempotencyKey: string | null;
  recipients: { recipient: string; scheduledAt: Date }[];
}

const INSERT_BATCH_SIZE = 1000;

export const campaignsRepository = {
  // campaign + all its emails in one transaction
  async createWithEmails(input: NewCampaignInput): Promise<{ campaign: Campaign; emails: Email[] }> {
    return db.transaction(async (tx) => {
      const [campaign] = await tx
        .insert(campaigns)
        .values({
          userId: input.userId,
          senderId: input.senderId,
          subject: input.subject,
          bodyHtml: input.bodyHtml,
          bodyText: input.bodyText,
          startAt: input.startAt,
          delayBetweenMs: input.delayBetweenMs,
          hourlyLimit: input.hourlyLimit,
          totalRecipients: input.recipients.length,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();

      const inserted: Email[] = [];
      for (const batch of chunk(input.recipients, INSERT_BATCH_SIZE)) {
        const rows = await tx
          .insert(emails)
          .values(
            batch.map(({ recipient, scheduledAt }) => ({
              campaignId: campaign!.id,
              userId: input.userId,
              senderId: input.senderId,
              recipient,
              subject: input.subject,
              scheduledAt,
              originalScheduledAt: scheduledAt,
            })),
          )
          .returning();
        inserted.push(...rows);
      }
      return { campaign: campaign!, emails: inserted };
    });
  },

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<Campaign | undefined> {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.userId, userId), eq(campaigns.idempotencyKey, idempotencyKey)));
    return campaign;
  },

  async sendWindow(campaignId: string): Promise<{ firstSendAt: Date | null; lastSendAt: Date | null }> {
    const [row] = await db
      .select({ firstSendAt: min(emails.scheduledAt), lastSendAt: max(emails.scheduledAt) })
      .from(emails)
      .where(eq(emails.campaignId, campaignId));
    return { firstSendAt: row?.firstSendAt ?? null, lastSendAt: row?.lastSendAt ?? null };
  },

  async delete(campaignId: string): Promise<void> {
    await db.delete(campaigns).where(eq(campaigns.id, campaignId));
  },
};
