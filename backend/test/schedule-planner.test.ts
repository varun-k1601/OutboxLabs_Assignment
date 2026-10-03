import { describe, expect, it } from 'vitest';
import { planSendTimes } from '../src/scheduling/schedule-planner';

const HOUR = 3_600_000;
const at = (hour: number, minute = 0, second = 0) => Date.UTC(2026, 0, 1, hour, minute, second);

describe('planSendTimes', () => {
  it('spaces emails by the delay', () => {
    const times = planSendTimes({ startAt: at(9), count: 3, delayMs: 2_000, hourlyLimit: 100, windowMs: HOUR });
    expect(times).toEqual([at(9), at(9, 0, 2), at(9, 0, 4)]);
  });

  it('moves the overflow of a full hour to the start of the next hour, in order', () => {
    const times = planSendTimes({ startAt: at(9, 30), count: 5, delayMs: 60_000, hourlyLimit: 2, windowMs: HOUR });
    expect(times).toEqual([at(9, 30), at(9, 31), at(10), at(10, 1), at(11)]);
  });

  it('starts counting afresh when the natural spacing crosses into a new hour', () => {
    const times = planSendTimes({ startAt: at(9, 59, 58), count: 4, delayMs: 2_000, hourlyLimit: 2, windowMs: HOUR });
    // 09:59:58 is in the 09:00 window, 10:00:00 and 10:00:02 fill up 10:00
    expect(times).toEqual([at(9, 59, 58), at(10), at(10, 0, 2), at(11)]);
  });

  it('never puts more than the hourly limit into one window', () => {
    const times = planSendTimes({ startAt: at(9, 17), count: 1_000, delayMs: 0, hourlyLimit: 200, windowMs: HOUR });
    const perHour = new Map<number, number>();
    for (const time of times) perHour.set(Math.floor(time / HOUR), (perHour.get(Math.floor(time / HOUR)) ?? 0) + 1);
    expect(Math.max(...perHour.values())).toBe(200);
    expect(perHour.size).toBe(5);
    expect([...times].sort((a, b) => a - b)).toEqual(times); // order preserved
  });

  it('does not plan sends inside the guard at the end of a window', () => {
    const times = planSendTimes({
      startAt: at(9, 59, 56),
      count: 2,
      delayMs: 2_000,
      hourlyLimit: 10,
      windowMs: HOUR,
      windowGuardMs: 5_000,
    });
    expect(times).toEqual([at(10), at(10, 0, 2)]);
  });

  it('rejects invalid limits', () => {
    expect(() => planSendTimes({ startAt: 0, count: 1, delayMs: 0, hourlyLimit: 0, windowMs: HOUR })).toThrow(RangeError);
  });
});
