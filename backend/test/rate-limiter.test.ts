import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SendRateLimiter, type SlotRequest } from '../src/queue/rate-limiter';

// These run the real Lua script, so the Redis from docker-compose has to be up.
const WINDOW = 60_000;
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true, maxRetriesPerRequest: 1 });
let redisAvailable = true;
let prefix: string;
let limiter: SendRateLimiter;
// far in the future so we never collide with real data
const baseWindow = Math.floor(Date.now() / WINDOW) + 1_000;
const windowStartMs = (offset = 0) => (baseWindow + offset) * WINDOW;

const request = (overrides: Partial<SlotRequest> = {}): SlotRequest => ({
  earliestAt: windowStartMs(),
  senderId: 'sender-a',
  senderLimit: 100,
  senderGapMs: 2_000,
  campaignId: 'campaign-1',
  campaignLimit: 100,
  campaignGapMs: 0,
  globalLimit: 0,
  ...overrides,
});

beforeAll(async () => {
  try {
    await redis.connect();
    await redis.ping();
  } catch {
    redisAvailable = false;
  }
});

beforeEach((context) => {
  if (!redisAvailable) context.skip();
  prefix = `test:rl:${randomUUID()}:`;
  limiter = new SendRateLimiter(redis, WINDOW, { keyPrefix: prefix });
});

afterAll(async () => {
  if (redisAvailable) {
    const keys = await redis.keys('test:rl:*');
    if (keys.length) await redis.del(...keys);
  }
  redis.disconnect();
});

describe('SendRateLimiter (Redis Lua)', () => {
  it('spaces consecutive sends of a sender by the minimum gap', async () => {
    const slots = [];
    for (let i = 0; i < 3; i++) slots.push((await limiter.reserve(request())).slotAt);
    expect(slots).toEqual([windowStartMs(), windowStartMs() + 2_000, windowStartMs() + 4_000]);
  });

  it('applies the larger of the sender gap and the campaign gap', async () => {
    const first = await limiter.reserve(request({ campaignGapMs: 5_000 }));
    const second = await limiter.reserve(request({ campaignGapMs: 5_000 }));
    expect(second.slotAt! - first.slotAt!).toBe(5_000);
  });

  it('moves the overflow of a full window into the next one, in order, and reports why', async () => {
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await limiter.reserve(request({ senderLimit: 3 })));

    expect(results.map((r) => r.window - baseWindow)).toEqual([0, 0, 0, 1, 1, 1, 2]);
    const slots = results.map((r) => r.slotAt!);
    expect([...slots].sort((a, b) => a - b)).toEqual(slots);
    expect(results[2]!.counts.sender).toBe(3); // this one filled the window
    expect(results[3]!.blockedBy).toBe('sender');
    expect(results[3]!.blockedWindow).toBe(baseWindow);
    expect(results[3]!.slotAt).toBe(windowStartMs(1));
  });

  it('keeps campaign limits independent while sharing the sender limit', async () => {
    await limiter.reserve(request({ campaignId: 'A', campaignLimit: 2 }));
    await limiter.reserve(request({ campaignId: 'A', campaignLimit: 2 }));
    const thirdOfA = await limiter.reserve(request({ campaignId: 'A', campaignLimit: 2 }));
    const firstOfB = await limiter.reserve(request({ campaignId: 'B', campaignLimit: 2 }));

    expect(thirdOfA.blockedBy).toBe('campaign');
    expect(thirdOfA.window).toBe(baseWindow + 1);
    expect(firstOfB.window).toBe(baseWindow); // B still has room in the current window
  });

  it('enforces the optional global limit across senders', async () => {
    await limiter.reserve(request({ senderId: 's1', campaignId: 'c1', globalLimit: 2 }));
    await limiter.reserve(request({ senderId: 's2', campaignId: 'c2', globalLimit: 2 }));
    const third = await limiter.reserve(request({ senderId: 's3', campaignId: 'c3', globalLimit: 2 }));
    expect(third.blockedBy).toBe('global');
    expect(third.window).toBe(baseWindow + 1);
  });

  it('does not count an email twice in a window it was already counted in', async () => {
    await limiter.reserve(request({ senderLimit: 1 }));
    const again = await limiter.reserve(request({ senderLimit: 1, countedWindow: baseWindow }));
    expect(again.window).toBe(baseWindow);
    expect(again.counts.sender).toBeNull();
    expect(again.slotAt).toBe(windowStartMs() + 2_000); // still respects the gap
  });

  it('never starts a send inside the guard at the end of a window', async () => {
    const guarded = new SendRateLimiter(redis, WINDOW, { keyPrefix: prefix, windowGuardMs: 5_000 });
    const nearTheEnd = await guarded.reserve(request({ earliestAt: windowStartMs(1) - 3_000 }));
    expect(nearTheEnd.slotAt).toBe(windowStartMs(1));
    expect(nearTheEnd.window).toBe(baseWindow + 1);
    expect(nearTheEnd.blockedBy).toBeNull(); // moved because of the guard, the window isn't full
  });

  it('is safe under concurrency: never exceeds the limit, never hands out the same slot twice', async () => {
    const results = await Promise.all(
      Array.from({ length: 60 }, () => limiter.reserve(request({ senderLimit: 25, senderGapMs: 1_000 }))),
    );
    const perWindow = new Map<number, number>();
    for (const r of results) perWindow.set(r.window, (perWindow.get(r.window) ?? 0) + 1);
    expect([...perWindow.entries()].sort()).toEqual([
      [baseWindow, 25],
      [baseWindow + 1, 25],
      [baseWindow + 2, 10],
    ]);
    const slots = results.map((r) => r.slotAt!).sort((a, b) => a - b);
    for (let i = 1; i < slots.length; i++) expect(slots[i]! - slots[i - 1]!).toBeGreaterThanOrEqual(1_000);
  });
});
