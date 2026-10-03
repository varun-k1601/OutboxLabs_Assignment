import type { Redis, Result } from 'ioredis';

// Lua script that picks the next send slot for an email. It checks the caps (per sender, per
// campaign and the optional global one) and the minimum gap between sends in one atomic step,
// so it doesn't matter how many workers are running.
//
// If the window is already full it walks forward to the next window that has room and books the
// first free slot there. Jobs come in the order BullMQ releases them, so overflow keeps its order
// and doesn't all fire at the start of the next window.
//
// Keys are built inside the script, so this won't work on Redis Cluster. Standalone or Sentinel
// is fine (BullMQ has the same requirement).
//
// ARGV: 1 prefix, 2 earliestAt, 3 windowMs, 4 countedWindow (-1 = none), 5 maxWindows,
//       6 senderId, 7 senderLimit, 8 senderGapMs, 9 campaignId, 10 campaignLimit, 11 campaignGapMs,
//       12 globalLimit (0 = off), 13 windowGuardMs
// Returns { slotAt (-1 if nothing free), window, blockedBy, blockedWindow, senderCount,
//           campaignCount, globalCount }, counts are -1 when nothing was incremented
const RESERVE_SEND_SLOT_LUA = `
local prefix = ARGV[1]
local earliest = tonumber(ARGV[2])
local windowMs = tonumber(ARGV[3])
local counted = tonumber(ARGV[4])
local maxWindows = tonumber(ARGV[5])
local senderId, senderLimit, senderGap = ARGV[6], tonumber(ARGV[7]), tonumber(ARGV[8])
local campaignId, campaignLimit, campaignGap = ARGV[9], tonumber(ARGV[10]), tonumber(ARGV[11])
local globalLimit = tonumber(ARGV[12])
local guard = tonumber(ARGV[13])

local function key(scope, id, kind, w)
  return prefix .. scope .. ':' .. id .. ':' .. kind .. ':' .. w
end
local function num(k)
  return tonumber(redis.call('GET', k) or '0')
end

local t = earliest
local firstWindow = math.floor(earliest / windowMs)
local blockedBy = ''
local blockedWindow = -1

while true do
  local w = math.floor(t / windowMs)
  if w - firstWindow > maxWindows then
    return { -1, w, blockedBy, blockedWindow, -1, -1, -1 }
  end
  local wEnd = (w + 1) * windowMs

  -- keep the min gap, also against the last slot of the previous window
  local gapFloor = math.max(
    num(key('s', senderId, 'next', w)), num(key('s', senderId, 'next', w - 1)),
    num(key('c', campaignId, 'next', w)), num(key('c', campaignId, 'next', w - 1)))
  if gapFloor > t then t = gapFloor end

  if t >= wEnd - guard then
    -- too close to the end of this window, try the next one
    if t < wEnd then t = wEnd end
  else
    local full = nil
    if w ~= counted then
      if globalLimit > 0 and num(key('g', 'all', 'count', w)) >= globalLimit then
        full = 'global'
      elseif num(key('s', senderId, 'count', w)) >= senderLimit then
        full = 'sender'
      elseif num(key('c', campaignId, 'count', w)) >= campaignLimit then
        full = 'campaign'
      end
    end

    if full then
      if blockedBy == '' then
        blockedBy = full
        blockedWindow = w
      end
      t = wEnd
    else
      local expireAt = wEnd + windowMs
      local senderCount, campaignCount, globalCount = -1, -1, -1
      if w ~= counted then
        local sk, ck = key('s', senderId, 'count', w), key('c', campaignId, 'count', w)
        senderCount = redis.call('INCR', sk)
        redis.call('PEXPIREAT', sk, expireAt)
        campaignCount = redis.call('INCR', ck)
        redis.call('PEXPIREAT', ck, expireAt)
        if globalLimit > 0 then
          local gk = key('g', 'all', 'count', w)
          globalCount = redis.call('INCR', gk)
          redis.call('PEXPIREAT', gk, expireAt)
        end
      end
      redis.call('SET', key('s', senderId, 'next', w), t + senderGap, 'PXAT', expireAt)
      redis.call('SET', key('c', campaignId, 'next', w), t + campaignGap, 'PXAT', expireAt)
      return { t, w, blockedBy, blockedWindow, senderCount, campaignCount, globalCount }
    end
  end
end
`;

declare module 'ioredis' {
  interface RedisCommander<Context> {
    reserveSendSlot(
      ...args: (string | number)[]
    ): Result<[number, number, string, number, number, number, number], Context>;
  }
}

export type LimitScope = 'sender' | 'campaign' | 'global';

export interface SlotRequest {
  // usually now, or the due time of the email
  earliestAt: number;
  senderId: string;
  senderLimit: number;
  senderGapMs: number;
  campaignId: string;
  campaignLimit: number;
  campaignGapMs: number;
  // 0 = no global cap
  globalLimit: number;
  // window the email was already counted in, so it isn't counted twice
  countedWindow?: number;
}

export interface SlotReservation {
  // null if no window in range had room
  slotAt: number | null;
  window: number;
  // which limit pushed the email out of its window, if any
  blockedBy: LimitScope | null;
  blockedWindow: number | null;
  // null when the email was already counted in this window
  counts: Record<LimitScope, number | null>;
}

export interface RateLimiterOptions {
  keyPrefix?: string;
  // no slots in the last windowGuardMs of a window
  windowGuardMs?: number;
  // how far ahead to look for room (default ~31 days of hourly windows)
  maxWindows?: number;
}

const definedOn = new WeakSet<Redis>();

export class SendRateLimiter {
  private readonly keyPrefix: string;
  private readonly windowGuardMs: number;
  private readonly maxWindows: number;

  constructor(
    private readonly redis: Redis,
    readonly windowMs: number,
    options: RateLimiterOptions = {},
  ) {
    this.keyPrefix = options.keyPrefix ?? 'ratelimit:';
    this.windowGuardMs = options.windowGuardMs ?? 0;
    this.maxWindows = options.maxWindows ?? 24 * 31;
    if (!definedOn.has(redis)) {
      redis.defineCommand('reserveSendSlot', { numberOfKeys: 0, lua: RESERVE_SEND_SLOT_LUA });
      definedOn.add(redis);
    }
  }

  async reserve(request: SlotRequest): Promise<SlotReservation> {
    const [slotAt, window, blockedBy, blockedWindow, senderCount, campaignCount, globalCount] =
      await this.redis.reserveSendSlot(
        this.keyPrefix,
        Math.floor(request.earliestAt),
        this.windowMs,
        request.countedWindow ?? -1,
        this.maxWindows,
        request.senderId,
        request.senderLimit,
        Math.max(0, Math.floor(request.senderGapMs)),
        request.campaignId,
        request.campaignLimit,
        Math.max(0, Math.floor(request.campaignGapMs)),
        request.globalLimit,
        this.windowGuardMs,
      );

    const nullable = (value: number) => (value < 0 ? null : Number(value));
    return {
      slotAt: slotAt < 0 ? null : Number(slotAt),
      window: Number(window),
      blockedBy: (blockedBy || null) as LimitScope | null,
      blockedWindow: nullable(blockedWindow),
      counts: {
        sender: nullable(senderCount),
        campaign: nullable(campaignCount),
        global: nullable(globalCount),
      },
    };
  }
}
