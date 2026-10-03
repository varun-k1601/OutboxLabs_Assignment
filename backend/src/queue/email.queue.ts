import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { env } from '../config/env';
import { createRedisConnection } from '../lib/redis';
import { chunk } from '../lib/time';

export const EMAIL_QUEUE_NAME = 'email-send';
export const SEND_EMAIL_JOB = 'send-email';

// slot the limiter already reserved (and counted) for this job
export interface SlotReservationData {
  slotAt: number;
  window: number;
}

export interface EmailJobData {
  emailId: string;
  // only here so Bull Board is readable, the DB is what counts
  to: string;
  subject: string;
  reservation?: SlotReservationData;
}

export interface EmailJobResult {
  outcome: 'sent' | 'skipped';
  reason?: string;
  messageId?: string;
  previewUrl?: string | null;
}

export interface EnqueueableEmail {
  id: string;
  recipient: string;
  subject: string;
  scheduledAt: Date;
}

export type EmailQueue = Queue<EmailJobData, EmailJobResult>;

let state: { queue: EmailQueue; connection: Redis } | undefined;

export function getEmailQueue(): EmailQueue {
  if (!state) {
    // BullMQ won't close a connection we pass in, so keep a ref and close it ourselves
    const connection = createRedisConnection('queue', { maxRetriesPerRequest: 3 });
    const queue: EmailQueue = new Queue(EMAIL_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: env.SEND_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: env.SEND_RETRY_BACKOFF_MS },
        removeOnComplete: { age: 7 * 24 * 3600, count: 20_000 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    });
    state = { queue, connection };
  }
  return state.queue;
}

// One delayed job per email. The job id is the email id, so adding the same email twice
// (client retry, reconciler on start-up...) does nothing while the job still exists.
export async function enqueueEmails(rows: readonly EnqueueableEmail[]): Promise<void> {
  const queue = getEmailQueue();
  for (const batch of chunk(rows, 500)) {
    const now = Date.now();
    await queue.addBulk(
      batch.map((row) => ({
        name: SEND_EMAIL_JOB,
        data: { emailId: row.id, to: row.recipient, subject: row.subject },
        opts: { jobId: row.id, delay: Math.max(0, row.scheduledAt.getTime() - now) },
      })),
    );
  }
}

export async function closeEmailQueue(): Promise<void> {
  if (!state) return;
  const { queue, connection } = state;
  state = undefined;
  await queue.close();
  await connection.quit().catch(() => connection.disconnect());
}
