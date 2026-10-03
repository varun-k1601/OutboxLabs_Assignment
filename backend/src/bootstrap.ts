import { env } from './config/env';
import { closeDatabase } from './db/client';
import { runMigrations } from './db/migrate';
import { createApp } from './http/app';
import { closeServer, startHttpServers } from './http/servers';
import { closeTransports } from './integrations/mailer';
import { closeSearch, ensureSearchIndex } from './integrations/search-index';
import { flushBackgroundTasks } from './lib/background-tasks';
import { logger } from './lib/logger';
import { closeRedis } from './lib/redis';
import { closeEmailQueue } from './queue/email.queue';
import { startEmailWorker, type EmailWorkerHandle } from './queue/email.worker';
import { reconcilePendingEmails } from './queue/reconcile';

export interface Roles {
  api: boolean;
  worker: boolean;
}

const SHUTDOWN_TIMEOUT_MS = 30_000;

// Starts the API and/or the worker. Both can run in one process (npm run dev) or separately
// (dev:api + any number of dev:worker), all shared state is in Postgres/Redis.
export async function start(roles: Roles): Promise<void> {
  logger.info({ roles, env: env.NODE_ENV }, 'Starting ReachInbox email scheduler');

  if (env.RUN_MIGRATIONS_ON_START) await runMigrations();
  ensureSearchIndex().catch((err) => logger.warn({ err }, 'Elasticsearch unavailable; search falls back to Postgres'));

  const servers = roles.api ? await startHttpServers(createApp()) : [];
  const worker: EmailWorkerHandle | undefined = roles.worker ? startEmailWorker() : undefined;

  // re-add any jobs Redis might have lost, see reconcile.ts
  reconcilePendingEmails().catch((err) => logger.error({ err }, 'Queue reconciliation failed'));

  registerShutdown(async () => {
    // stop taking requests, let running sends finish, then close connections
    await Promise.all(servers.map(closeServer));
    await worker?.close();
    await flushBackgroundTasks();
    await closeEmailQueue();
    closeTransports();
    await Promise.allSettled([closeSearch(), closeRedis(), closeDatabase()]);
  });
}

function registerShutdown(cleanup: () => Promise<void>): void {
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      logger.warn('Second signal received, exiting immediately');
      process.exit(1);
    }
    shuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown: waiting for in-flight jobs to finish');
    const timer = setTimeout(() => {
      logger.error('Graceful shutdown timed out');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();
    try {
      await cleanup();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) {
    process.on(signal, () => void shutdown(signal));
  }
}

export function runMain(roles: Roles): void {
  start(roles).catch((err) => {
    logger.fatal({ err }, 'Failed to start');
    process.exit(1);
  });
}
