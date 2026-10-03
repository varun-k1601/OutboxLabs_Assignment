import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import * as schema from './schema';

export const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
pool.on('error', (err) => logger.error({ err }, 'Postgres pool error'));

export const db = drizzle({ client: pool, schema });
export type Database = typeof db;

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
