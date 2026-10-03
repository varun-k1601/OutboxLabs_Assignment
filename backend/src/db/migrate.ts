import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { logger } from '../lib/logger';
import { pool } from './client';

// any fixed number works. API and worker can boot at the same time, the advisory lock makes
// sure only one of them runs the migrations
const MIGRATION_LOCK_ID = 727_001;

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await migrate(drizzle({ client }), { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });
    logger.info('Database migrations are up to date');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}
