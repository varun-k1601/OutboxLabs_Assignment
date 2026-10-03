import { Worker } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { createRedisConnection } from '../lib/redis';
import { EMAIL_QUEUE_NAME, type EmailJobData, type EmailJobResult } from './email.queue';
import { processEmailJob } from './email.processor';

export interface EmailWorkerHandle {
  worker: Worker<EmailJobData, EmailJobResult>;
  // stop taking jobs and wait for the running ones (graceful shutdown)
  close(): Promise<void>;
}

export function startEmailWorker(): EmailWorkerHandle {
  const connection = createRedisConnection('worker');
  const worker = new Worker<EmailJobData, EmailJobResult>(EMAIL_QUEUE_NAME, processEmailJob, {
    connection,
    concurrency: env.WORKER_CONCURRENCY,
    // well above the longest a job takes (throttle wait + SMTP timeout), BullMQ renews it anyway
    lockDuration: 60_000,
    // stalled jobs get one retry, which is safe because of the claim in the processor
    maxStalledCount: 1,
  });

  worker.on('ready', () => logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'Email worker ready'));
  worker.on('failed', (job, err) =>
    logger.warn({ jobId: job?.id, attemptsMade: job?.attemptsMade, err: err.message }, 'Email job failed'),
  );
  worker.on('error', (err) => logger.error({ err }, 'Email worker error'));

  return {
    worker,
    async close() {
      await worker.close();
      await connection.quit().catch(() => connection.disconnect());
    },
  };
}
