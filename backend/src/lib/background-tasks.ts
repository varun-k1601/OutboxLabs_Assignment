import { logger } from './logger';
import { sleep } from './time';

const pending = new Set<Promise<void>>();

// Fire-and-forget for side work like search indexing and Slack alerts. Errors are logged, not
// thrown. On shutdown flushBackgroundTasks waits for whatever is still running.
export function runInBackground(label: string, task: () => Promise<unknown>): void {
  const promise: Promise<void> = task()
    .then(
      () => undefined,
      (err: unknown) => logger.warn({ err }, `Background task failed: ${label}`),
    )
    .finally(() => pending.delete(promise));
  pending.add(promise);
}

export async function flushBackgroundTasks(timeoutMs = 5_000): Promise<void> {
  if (pending.size === 0) return;
  await Promise.race([Promise.allSettled([...pending]), sleep(timeoutMs)]);
}
