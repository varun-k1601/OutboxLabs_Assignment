import { logger } from '../lib/logger';
import { emailsRepository } from '../repositories/emails.repository';
import { enqueueEmails, getEmailQueue } from './email.queue';
import { INTERRUPTED_DELIVERY_MESSAGE } from './email.processor';

const PAGE_SIZE = 1000;
// lock duration is 60s, so a row stuck in "sending" this long has lost its worker
const STUCK_SENDING_AFTER_MS = 5 * 60_000;
const ALIVE_JOB_STATES = new Set(['active', 'waiting', 'delayed', 'prioritized', 'waiting-children']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Brings the queue back in line with Postgres. Runs on every start-up and is safe to run from
// several processes at once.
//  - pending emails get their delayed job back (job id = email id, so existing jobs are left
//    alone). Covers a wiped Redis or a crash between the DB insert and the enqueue.
//  - jobs BullMQ gave up on (e.g. Postgres was down for every attempt) are retried if the email
//    is still pending
//  - "sending" rows whose job disappeared are marked failed. We don't know if they went out,
//    so they are not resent.
export async function reconcilePendingEmails(): Promise<void> {
  const queue = getEmailQueue();

  let pendingChecked = 0;
  let afterId: string | null = null;
  for (;;) {
    const page = await emailsRepository.listClaimable(afterId, PAGE_SIZE);
    if (page.length === 0) break;
    await enqueueEmails(page);
    pendingChecked += page.length;
    afterId = page[page.length - 1]!.id;
  }

  let failedJobsRetried = 0;
  for (let start = 0; ; ) {
    const failedJobs = await queue.getFailed(start, start + PAGE_SIZE - 1);
    if (failedJobs.length === 0) break;
    const jobsById = new Map(failedJobs.filter((job) => job.id && UUID_PATTERN.test(job.id)).map((job) => [job.id!, job]));
    const pendingIds = await emailsRepository.filterClaimableIds([...jobsById.keys()]);
    for (const id of pendingIds) await jobsById.get(id)!.retry('failed');
    failedJobsRetried += pendingIds.length;
    // retried jobs drop out of the failed set, so move the offset back
    start += failedJobs.length - pendingIds.length;
    if (failedJobs.length < PAGE_SIZE) break;
  }

  let interruptedClosed = 0;
  for (const { id } of await emailsRepository.listStuckSending(new Date(Date.now() - STUCK_SENDING_AFTER_MS))) {
    if (ALIVE_JOB_STATES.has(await queue.getJobState(id))) continue; // worker will deal with it
    if (await emailsRepository.markFailed(id, INTERRUPTED_DELIVERY_MESSAGE, ['sending'])) interruptedClosed++;
  }

  logger.info({ pendingChecked, failedJobsRetried, interruptedClosed }, 'Queue reconciled with the database');
}
