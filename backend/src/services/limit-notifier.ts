import { env } from '../config/env';
import type { LimitScope } from '../queue/rate-limiter';
import { runInBackground } from '../lib/background-tasks';
import { logger } from '../lib/logger';
import { getRedis } from '../lib/redis';
import { describeWindow } from '../lib/time';
import { emailsRepository } from '../repositories/emails.repository';
import { slackRepository } from '../repositories/slack.repository';
import { escapeMrkdwn, slackService } from './slack.service';

export interface LimitEvent {
  // reached = a send just took the last slot, blocked = an email got pushed out of a full window
  kind: 'reached' | 'blocked';
  scope: LimitScope;
  limit: number;
  // current window (now full)
  window: number;
  // when sending resumes (start of the next window)
  resumeAt: number;
  userId: string;
  sender: { id: string; name: string; email: string };
  campaign: { id: string; subject: string };
}

const SCOPE_LABEL: Record<LimitScope, (event: LimitEvent) => string> = {
  sender: (e) => `Sender *${escapeMrkdwn(e.sender.name)}* (${escapeMrkdwn(e.sender.email)})`,
  campaign: (e) => `Campaign *"${escapeMrkdwn(e.campaign.subject)}"*`,
  global: () => 'The global sending cap',
};

function buildMessage(event: LimitEvent, stillQueued: number) {
  const per = describeWindow(env.rateLimitWindowMs);
  const resumeUnix = Math.floor(event.resumeAt / 1000);
  const resume = `<!date^${resumeUnix}^{date_short_pretty} at {time_secs}|${new Date(event.resumeAt).toISOString()}>`;
  return {
    text: `Sending limit reached: ${event.sender.email} hit ${event.limit} emails per ${per}.`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: ':stopwatch: Sending limit reached', emoji: true } },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `${SCOPE_LABEL[event.scope](event)} reached its limit of *${event.limit} emails per ${per}*.` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Sender*\n${escapeMrkdwn(event.sender.name)} (${escapeMrkdwn(event.sender.email)})` },
          { type: 'mrkdwn', text: `*Campaign*\n${escapeMrkdwn(event.campaign.subject)}` },
          { type: 'mrkdwn', text: `*Still queued in this campaign*\n${stillQueued}` },
          { type: 'mrkdwn', text: `*Sending resumes*\n${resume}` },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Nothing was dropped: emails over the limit were moved to the next window in their original order.',
          },
        ],
      },
    ],
  };
}

async function deliver(event: LimitEvent): Promise<void> {
  const scopeId = event.scope === 'sender' ? event.sender.id : event.scope === 'campaign' ? event.campaign.id : 'all';
  const dedupeKey = `notify:limit:${event.userId}:${event.scope}:${scopeId}:${event.window}`;
  const redis = getRedis();

  if (await redis.exists(dedupeKey)) return;
  // no Slack connected, nothing to do
  if (!(await slackRepository.findByUser(event.userId))) return;
  // one message per user + scope + window, even if several workers hit it at the same time
  if ((await redis.set(dedupeKey, event.kind, 'PX', env.rateLimitWindowMs * 2, 'NX')) !== 'OK') return;

  const stillQueued = await emailsRepository.countPendingForCampaign(event.campaign.id);
  const delivered = await slackService.notify(event.userId, buildMessage(event, stillQueued));
  if (delivered) {
    logger.info({ scope: event.scope, window: event.window, userId: event.userId }, 'Slack notified: sending limit reached');
  } else {
    await redis.del(dedupeKey); // so a later hit in this window can try again
  }
}

export function reportLimitEvent(event: LimitEvent): void {
  logger.info(
    { kind: event.kind, scope: event.scope, limit: event.limit, window: event.window, sender: event.sender.email },
    'Hourly sending limit reached',
  );
  runInBackground('Slack limit notification', () => deliver(event));
}
