import { Redis, type RedisOptions } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

// BullMQ workers need maxRetriesPerRequest: null (blocking commands have to wait for a
// reconnect instead of failing), so that's the default here.
export function createRedisConnection(name: string, options: RedisOptions = {}): Redis {
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    connectionName: `reachinbox:${name}`,
    ...options,
  });
  connection.on('error', (err) => logger.error({ err, connection: name }, 'Redis connection error'));
  return connection;
}

let shared: Redis | undefined;

// shared connection for quick commands (limiter, slack dedupe, health check)
export function getRedis(): Redis {
  shared ??= createRedisConnection('shared', { maxRetriesPerRequest: 3 });
  return shared;
}

export async function closeRedis(): Promise<void> {
  if (shared) {
    await shared.quit().catch(() => shared?.disconnect());
    shared = undefined;
  }
}
