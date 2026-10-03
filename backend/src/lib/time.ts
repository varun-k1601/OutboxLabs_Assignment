export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// which fixed window a timestamp falls in
export const windowOf = (timestampMs: number, windowMs: number) => Math.floor(timestampMs / windowMs);

export const windowStart = (window: number, windowMs: number) => window * windowMs;

// Don't start a send in the last few seconds of a window. SMTP takes about a second, so a send
// started at 10:59:59 could land in the 11:00 window while being counted in 10:00.
// The planner and the limiter both use this so they agree.
export const windowGuardMs = (windowMs: number) => Math.min(5_000, Math.floor(windowMs / 10));

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// "hour", "minute", "10 minutes" etc.
export function describeWindow(windowMs: number): string {
  if (windowMs === 3_600_000) return 'hour';
  const minutes = windowMs / 60_000;
  if (Number.isInteger(minutes)) return minutes === 1 ? 'minute' : `${minutes} minutes`;
  return `${Math.round(windowMs / 1000)} seconds`;
}
