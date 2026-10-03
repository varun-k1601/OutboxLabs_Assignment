import { Router } from 'express';
import { env } from '../../config/env';
import { pool } from '../../db/client';
import { pingSearch } from '../../integrations/search-index';
import { getRedis } from '../../lib/redis';
import { getEmailQueue } from '../../queue/email.queue';
import { MAX_RECIPIENTS_PER_CAMPAIGN } from '../../services/campaign.service';

export const systemRouter = Router();

// health check: DB, Redis, ES and queue counts
systemRouter.get('/health', async (_req, res) => {
  const [database, redis, elasticsearch, queue] = await Promise.all([
    pool.query('SELECT 1').then(() => true, () => false),
    getRedis().ping().then(() => true, () => false),
    pingSearch(),
    getEmailQueue()
      .getJobCounts('waiting', 'delayed', 'active', 'completed', 'failed', 'prioritized')
      .catch(() => null),
  ]);
  const healthy = database && redis;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? (elasticsearch ? 'ok' : 'degraded') : 'down',
    checks: { database, redis, elasticsearch },
    queue,
  });
});

// non-secret settings the dashboard needs for hints and validation
systemRouter.get('/config', (_req, res) => {
  res.json({
    googleAuthEnabled: env.googleAuthEnabled,
    slackEnabled: env.slackEnabled,
    limits: {
      minDelayBetweenEmailsMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
      maxEmailsPerHourPerSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
      maxEmailsPerHour: env.MAX_EMAILS_PER_HOUR,
      rateLimitWindowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
      maxRecipientsPerCampaign: MAX_RECIPIENTS_PER_CAMPAIGN,
    },
    workerConcurrency: env.WORKER_CONCURRENCY,
  });
});
