import { DelayedError, UnrecoverableError, type Job } from 'bullmq';
import { env } from '../config/env';
import type { Campaign, Sender } from '../db/schema';
import { deliverEmail, isTransientSmtpError, type DeliveryResult } from '../integrations/mailer';
import { logger } from '../lib/logger';
import { getRedis } from '../lib/redis';
import { sleep, windowGuardMs, windowOf, windowStart } from '../lib/time';
import { emailsRepository, type EmailSendContext } from '../repositories/emails.repository';
import { reportLimitEvent, type LimitEvent } from '../services/limit-notifier';
import { syncEmailToSearch } from '../services/search-sync';
import type { EmailJobData, EmailJobResult } from './email.queue';
import { SendRateLimiter, type LimitScope, type SlotRequest, type SlotReservation } from './rate-limiter';

type EmailJob = Job<EmailJobData, EmailJobResult>;

// BullMQ can promote a job a little early, that's fine within this margin
const EARLY_TOLERANCE_MS = 1_000;
// how late a parked job can wake up and still use the slot it reserved
const LATE_GRACE_MS = 5_000;

export const INTERRUPTED_DELIVERY_MESSAGE =
  'Delivery was interrupted (the worker stopped during the SMTP handshake). The outcome is unknown, so the ' +
  'email is not retried automatically to guarantee it is never sent twice.';

let limiter: SendRateLimiter | undefined;
const rateLimiter = () =>
  (limiter ??= new SendRateLimiter(getRedis(), env.rateLimitWindowMs, {
    windowGuardMs: windowGuardMs(env.rateLimitWindowMs),
  }));

// Handles one send-email job:
//  - check the email in Postgres (it might be gone or already handled)
//  - get a send slot from the Redis limiter. Short waits are slept here, longer ones park the job
//  - claim the row (scheduled -> sending), only one attempt can ever win this
//  - send it over SMTP and save the result
export async function processEmailJob(job: EmailJob, token?: string): Promise<EmailJobResult> {
  const context = await emailsRepository.findSendContext(job.data.emailId);
  // row is gone (deleted, or the schedule request was rolled back)
  if (!context) return skipped(job, 'email_not_found');
  const { email, sender, campaign } = context;

  if (email.status === 'sent' || email.status === 'failed') return skipped(job, `already_${email.status}`);
  if (email.status === 'sending') {
    // An earlier attempt crashed mid-send. We can't tell if the mail went out, so fail it instead
    // of risking a duplicate.
    const failed = await emailsRepository.markFailed(email.id, INTERRUPTED_DELIVERY_MESSAGE, ['sending']);
    syncEmailToSearch(failed, campaign, sender);
    return skipped(job, 'interrupted_during_delivery');
  }

  // the job can fire early (e.g. re-added by the reconciler), so go by the real due time
  const dueAt = Math.max(email.scheduledAt.getTime(), job.data.reservation?.slotAt ?? 0);
  if (dueAt - Date.now() > EARLY_TOLERANCE_MS) return park(job, token, dueAt);

  const slotAt = await acquireSendSlot(job, token, context, dueAt);
  const wait = slotAt - Date.now();
  if (wait > 0) await sleep(wait);

  const claimed = await emailsRepository.claimForSending(email.id);
  if (!claimed) return skipped(job, 'already_claimed');

  let delivery: DeliveryResult;
  try {
    delivery = await deliverEmail(sender, {
      emailId: email.id,
      campaignId: campaign.id,
      to: email.recipient,
      subject: email.subject,
      html: campaign.bodyHtml,
      text: campaign.bodyText,
    });
  } catch (err) {
    return handleDeliveryFailure(job, context, err);
  }

  const sent = await emailsRepository.markSent(email.id, { ...delivery, sentAt: new Date() });
  syncEmailToSearch(sent, campaign, sender);
  logger.info(
    { emailId: email.id, to: email.recipient, sender: sender.email, previewUrl: delivery.previewUrl },
    'Email sent',
  );
  return { outcome: 'sent', messageId: delivery.messageId, previewUrl: delivery.previewUrl };
}

function limitsFor(sender: Sender, campaign: Campaign): Omit<SlotRequest, 'earliestAt' | 'countedWindow'> {
  return {
    senderId: sender.id,
    senderLimit: sender.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    senderGapMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
    campaignId: campaign.id,
    campaignLimit: campaign.hourlyLimit,
    campaignGapMs: campaign.delayBetweenMs,
    globalLimit: env.MAX_EMAILS_PER_HOUR,
  };
}

// Returns when this job is allowed to send. If that's too far off the job is parked instead
// (throws DelayedError).
async function acquireSendSlot(job: EmailJob, token: string | undefined, context: EmailSendContext, dueAt: number) {
  const { email, sender, campaign } = context;
  const windowMs = env.rateLimitWindowMs;
  // use the due time, a job woken a few ms early still belongs to that window
  const earliestAt = Math.max(Date.now(), dueAt);
  const currentWindow = windowOf(earliestAt, windowMs);
  const reservation = job.data.reservation;

  // parked earlier with a reserved slot and woke up on time, the slot is already counted
  if (reservation && reservation.window === currentWindow && earliestAt - reservation.slotAt <= LATE_GRACE_MS) {
    return reservation.slotAt;
  }

  const limits = limitsFor(sender, campaign);
  const result = await rateLimiter().reserve({
    ...limits,
    earliestAt,
    // late wake-up or SMTP retry in the same window: new slot, but don't count it again
    countedWindow: reservation?.window === currentWindow ? reservation.window : undefined,
  });

  if (result.slotAt === null) {
    // nothing free in the whole look-ahead range (only with silly limits), try again next window
    const retryAt = windowStart(currentWindow + 1, windowMs);
    const row = await emailsRepository.reschedule(email.id, new Date(retryAt), 'rate_limited');
    syncEmailToSearch(row, campaign, sender);
    return park(job, token, retryAt);
  }

  reportLimitEvents(result, context, limits);
  await job.updateData({ ...job.data, reservation: { slotAt: result.slotAt, window: result.window } });

  if (result.slotAt - Date.now() > env.THROTTLE_INLINE_WAIT_MS) {
    const status = result.blockedBy || email.status === 'rate_limited' ? 'rate_limited' : 'scheduled';
    const row = await emailsRepository.reschedule(email.id, new Date(result.slotAt), status);
    syncEmailToSearch(row, campaign, sender);
    if (result.blockedBy) {
      logger.info(
        { emailId: email.id, limit: result.blockedBy, resumesAt: new Date(result.slotAt).toISOString() },
        'Hourly limit hit; email moved to the next available window',
      );
    }
    return park(job, token, result.slotAt);
  }
  return result.slotAt;
}

function reportLimitEvents(
  result: SlotReservation,
  { email, sender, campaign }: EmailSendContext,
  limits: ReturnType<typeof limitsFor>,
): void {
  const windowMs = env.rateLimitWindowMs;
  // Only alert about the current window. A backlog books future windows too, and a "limit
  // reached" message for an hour that hasn't started yet would just be noise.
  const currentWindow = windowOf(Date.now(), windowMs);
  const limitOf: Record<LimitScope, number> = {
    sender: limits.senderLimit,
    campaign: limits.campaignLimit,
    global: limits.globalLimit,
  };
  const base: Pick<LimitEvent, 'userId' | 'sender' | 'campaign' | 'window' | 'resumeAt'> = {
    userId: email.userId,
    sender: { id: sender.id, name: sender.name, email: sender.email },
    campaign: { id: campaign.id, subject: campaign.subject },
    window: currentWindow,
    resumeAt: windowStart(currentWindow + 1, windowMs),
  };

  // This send took the last slot of the current window. If more than one limit filled at once
  // (say the campaign limit equals the sender cap) we only report the first one.
  if (result.window === currentWindow) {
    const filled = (['sender', 'campaign', 'global'] as const).find(
      (scope) => limitOf[scope] > 0 && result.counts[scope] === limitOf[scope],
    );
    if (filled) reportLimitEvent({ ...base, kind: 'reached', scope: filled, limit: limitOf[filled] });
  }
  // window was already full (e.g. another campaign on the same sender) and this email got pushed out
  if (result.blockedBy && result.blockedWindow === currentWindow) {
    reportLimitEvent({ ...base, kind: 'blocked', scope: result.blockedBy, limit: limitOf[result.blockedBy] });
  }
}

async function handleDeliveryFailure(job: EmailJob, { email, sender, campaign }: EmailSendContext, err: unknown): Promise<never> {
  const message = err instanceof Error ? err.message : String(err);
  const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

  if (isTransientSmtpError(err) && !isLastAttempt) {
    // same formula as BullMQ's exponential backoff
    const retryAt = new Date(Date.now() + env.SEND_RETRY_BACKOFF_MS * 2 ** job.attemptsMade);
    const row = await emailsRepository.releaseForRetry(email.id, message, retryAt);
    syncEmailToSearch(row, campaign, sender);
    logger.warn({ emailId: email.id, attempt: job.attemptsMade + 1, err: message }, 'Transient SMTP failure; will retry');
    throw err;
  }

  const row = await emailsRepository.markFailed(email.id, message);
  syncEmailToSearch(row, campaign, sender);
  logger.error({ emailId: email.id, to: email.recipient, err: message }, 'Email delivery failed permanently');
  throw new UnrecoverableError(message);
}

// Puts the job back in the delayed set until `timestamp`. Doesn't use up a retry attempt.
async function park(job: EmailJob, token: string | undefined, timestamp: number): Promise<never> {
  await job.moveToDelayed(timestamp, token);
  throw new DelayedError();
}

function skipped(job: EmailJob, reason: string): EmailJobResult {
  logger.debug({ jobId: job.id, reason }, 'Email job skipped');
  return { outcome: 'skipped', reason };
}
