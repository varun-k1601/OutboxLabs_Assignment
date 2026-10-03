import { z } from 'zod';
import { env } from '../config/env';
import type { Campaign, Sender } from '../db/schema';
import { AppError, isUniqueViolation } from '../lib/errors';
import { logger } from '../lib/logger';
import { htmlToText, normalizeRecipients } from '../lib/recipients';
import { windowGuardMs } from '../lib/time';
import { enqueueEmails } from '../queue/email.queue';
import { campaignsRepository } from '../repositories/campaigns.repository';
import { sendersRepository } from '../repositories/senders.repository';
import { planSendTimes } from '../scheduling/schedule-planner';
import { syncEmailsToSearch } from './search-sync';

export const MAX_RECIPIENTS_PER_CAMPAIGN = 10_000;

export const ScheduleCampaignSchema = z.object({
  senderId: z.uuid('Choose a sender'),
  subject: z.string().trim().min(1, 'Subject is required').max(250, 'Subject is too long'),
  bodyHtml: z.string().trim().min(1, 'Email body is required').max(200_000, 'Email body is too long'),
  bodyText: z.string().max(200_000).optional(),
  recipients: z
    .array(z.string().max(320))
    .min(1, 'Add at least one recipient')
    .max(MAX_RECIPIENTS_PER_CAMPAIGN, `At most ${MAX_RECIPIENTS_PER_CAMPAIGN} recipients per campaign`),
  // missing or in the past = start now
  startAt: z.iso.datetime({ offset: true }).optional(),
  delayBetweenEmailsSeconds: z.number().min(0).max(24 * 3600).default(0),
  hourlyLimit: z.number().int().min(1, 'Hourly limit must be at least 1').max(100_000),
});

export type ScheduleCampaignInput = z.output<typeof ScheduleCampaignSchema>;

export interface ScheduledCampaignDto {
  campaign: {
    id: string;
    subject: string;
    totalRecipients: number;
    startAt: string;
    firstSendAt: string | null;
    lastSendAt: string | null;
    requested: { delayBetweenMs: number; hourlyLimit: number };
    // what actually gets used after the server's own minimums/caps
    effective: { delayBetweenMs: number; hourlyLimit: number };
  };
  skipped: { duplicates: number; invalid: string[] };
  // true if this Idempotency-Key was used before and we returned that campaign
  replayed: boolean;
}

function effectiveParameters(sender: Sender, requestedDelayMs: number, requestedHourlyLimit: number) {
  const senderLimit = sender.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER;
  return {
    delayBetweenMs: Math.max(requestedDelayMs, env.MIN_DELAY_BETWEEN_EMAILS_MS),
    hourlyLimit: Math.min(requestedHourlyLimit, senderLimit, env.MAX_EMAILS_PER_HOUR || Number.POSITIVE_INFINITY),
  };
}

async function describeExisting(campaign: Campaign): Promise<ScheduledCampaignDto> {
  const sender = await sendersRepository.findForUser(campaign.senderId, campaign.userId);
  const { firstSendAt, lastSendAt } = await campaignsRepository.sendWindow(campaign.id);
  return {
    campaign: {
      id: campaign.id,
      subject: campaign.subject,
      totalRecipients: campaign.totalRecipients,
      startAt: campaign.startAt.toISOString(),
      firstSendAt: firstSendAt?.toISOString() ?? null,
      lastSendAt: lastSendAt?.toISOString() ?? null,
      requested: { delayBetweenMs: campaign.delayBetweenMs, hourlyLimit: campaign.hourlyLimit },
      effective: sender
        ? effectiveParameters(sender, campaign.delayBetweenMs, campaign.hourlyLimit)
        : { delayBetweenMs: campaign.delayBetweenMs, hourlyLimit: campaign.hourlyLimit },
    },
    skipped: { duplicates: 0, invalid: [] },
    replayed: true,
  };
}

export const campaignService = {
  // Saves the campaign + one row per recipient, plans the send times and queues one delayed job
  // per email. If Redis is down the rows are deleted again so nothing is half scheduled.
  async schedule(userId: string, input: ScheduleCampaignInput, idempotencyKey: string | null): Promise<ScheduledCampaignDto> {
    if (idempotencyKey) {
      const existing = await campaignsRepository.findByIdempotencyKey(userId, idempotencyKey);
      if (existing) return describeExisting(existing);
    }

    const sender = await sendersRepository.findForUser(input.senderId, userId);
    if (!sender) throw AppError.badRequest('Unknown sender');

    const { valid, duplicates, invalid } = normalizeRecipients(input.recipients);
    if (valid.length === 0) throw AppError.badRequest('No valid recipient email addresses', { invalid: invalid.slice(0, 20) });

    const now = Date.now();
    const startAt = Math.max(input.startAt ? Date.parse(input.startAt) : now, now);
    const requestedDelayMs = Math.round(input.delayBetweenEmailsSeconds * 1000);
    const effective = effectiveParameters(sender, requestedDelayMs, input.hourlyLimit);
    const sendTimes = planSendTimes({
      startAt,
      count: valid.length,
      delayMs: effective.delayBetweenMs,
      hourlyLimit: effective.hourlyLimit,
      windowMs: env.rateLimitWindowMs,
      windowGuardMs: windowGuardMs(env.rateLimitWindowMs),
    });

    let created: Awaited<ReturnType<typeof campaignsRepository.createWithEmails>>;
    try {
      created = await campaignsRepository.createWithEmails({
        userId,
        senderId: sender.id,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        bodyText: input.bodyText?.trim() || htmlToText(input.bodyHtml),
        startAt: new Date(startAt),
        delayBetweenMs: requestedDelayMs,
        hourlyLimit: input.hourlyLimit,
        idempotencyKey,
        recipients: valid.map((recipient, index) => ({ recipient, scheduledAt: new Date(sendTimes[index]!) })),
      });
    } catch (err) {
      // two requests with the same key raced, return the one that won
      if (idempotencyKey && isUniqueViolation(err)) {
        const existing = await campaignsRepository.findByIdempotencyKey(userId, idempotencyKey);
        if (existing) return describeExisting(existing);
      }
      throw err;
    }

    try {
      await enqueueEmails(created.emails);
    } catch (err) {
      logger.error({ err, campaignId: created.campaign.id }, 'Could not enqueue campaign; rolling it back');
      await campaignsRepository.delete(created.campaign.id).catch((deleteErr) =>
        // if even the delete fails, the reconciler picks these rows up on the next start
        logger.error({ err: deleteErr, campaignId: created.campaign.id }, 'Rollback of unqueued campaign failed'),
      );
      throw AppError.serviceUnavailable('The scheduling queue is unavailable, so nothing was scheduled. Please try again.');
    }

    syncEmailsToSearch(created.emails, created.campaign, sender);
    logger.info(
      { campaignId: created.campaign.id, recipients: valid.length, sender: sender.email, ...effective },
      'Campaign scheduled',
    );

    return {
      campaign: {
        id: created.campaign.id,
        subject: created.campaign.subject,
        totalRecipients: valid.length,
        startAt: new Date(startAt).toISOString(),
        firstSendAt: new Date(sendTimes[0]!).toISOString(),
        lastSendAt: new Date(sendTimes[sendTimes.length - 1]!).toISOString(),
        requested: { delayBetweenMs: requestedDelayMs, hourlyLimit: input.hourlyLimit },
        effective,
      },
      skipped: { duplicates, invalid: invalid.slice(0, 50) },
      replayed: false,
    };
  },
};
