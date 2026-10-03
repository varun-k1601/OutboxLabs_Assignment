export interface PlanOptions {
  // epoch ms
  startAt: number;
  count: number;
  delayMs: number;
  // max emails per window
  hourlyLimit: number;
  // 1h normally
  windowMs: number;
  // see windowGuardMs in lib/time.ts
  windowGuardMs?: number;
}

// Works out the send time of every email up front, so the dashboard can show real times right
// away. Emails are delayMs apart and at most hourlyLimit go in one window. The rest roll over to
// the start of the next window, in the same order.
//
// This is only the plan. The worker checks the limits again in Redis at send time, which also
// covers other campaigns on the same sender and backlogs after downtime.
export function planSendTimes({ startAt, count, delayMs, hourlyLimit, windowMs, windowGuardMs = 0 }: PlanOptions): number[] {
  if (!Number.isInteger(hourlyLimit) || hourlyLimit < 1) throw new RangeError('hourlyLimit must be a positive integer');
  if (delayMs < 0) throw new RangeError('delayMs must be >= 0');
  if (windowMs <= 0) throw new RangeError('windowMs must be > 0');
  if (windowGuardMs < 0 || windowGuardMs >= windowMs) throw new RangeError('windowGuardMs must be in [0, windowMs)');

  const times: number[] = [];
  let next = startAt;
  let currentWindow = Math.floor(next / windowMs);
  let usedInWindow = 0;

  for (let i = 0; i < count; i++) {
    let window = Math.floor(next / windowMs);
    if (next >= (window + 1) * windowMs - windowGuardMs) {
      window += 1;
      next = window * windowMs;
    }
    if (window !== currentWindow) {
      currentWindow = window;
      usedInWindow = 0;
    }
    if (usedInWindow >= hourlyLimit) {
      currentWindow += 1;
      next = currentWindow * windowMs;
      usedInWindow = 0;
    }
    times.push(next);
    usedInWindow += 1;
    next += delayMs;
  }
  return times;
}
