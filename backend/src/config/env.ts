import 'dotenv/config';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // HTTP
  PORT: z.coerce.number().int().positive().default(4000),
  // Slack only allows https redirect URLs, so locally we also listen on https (self-signed). 0 = off
  HTTPS_DEV_PORT: z.coerce.number().int().nonnegative().default(4443),
  FRONTEND_URL: z.url().default('http://localhost:5173'),

  // Infrastructure
  DATABASE_URL: z.string().min(1).default('postgres://reachinbox:reachinbox@localhost:5433/reachinbox'),
  RUN_MIGRATIONS_ON_START: booleanString.default(true),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().min(1).default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().min(1).default('emails'),

  // Auth
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters long'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.url().default('http://localhost:4000/api/auth/google/callback'),

  // Slack
  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  SLACK_REDIRECT_URI: z.url().default('https://localhost:4443/api/slack/callback'),

  // Scheduler, throughput and rate limiting
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
  // min gap between two sends from the same sender
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().int().min(0).default(2000),
  // default per-sender cap, a sender row can override it
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().min(1).default(200),
  // cap across all senders, 0 = off
  MAX_EMAILS_PER_HOUR: z.coerce.number().int().min(0).default(0),
  // 3600 = per hour. Set it to something like 60 for a demo so windows roll over quickly
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).default(3600),
  // shorter waits are slept in the worker, longer ones park the job in the delayed set
  THROTTLE_INLINE_WAIT_MS: z.coerce.number().int().min(0).default(3000),
  SEND_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  SEND_RETRY_BACKOFF_MS: z.coerce.number().int().min(1000).default(15000),

  // Bull Board (optional HTTP basic auth)
  BULL_BOARD_USERNAME: z.string().default(''),
  BULL_BOARD_PASSWORD: z.string().default(''),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

const values = parsed.data;

export const env = {
  ...values,
  isProduction: values.NODE_ENV === 'production',
  rateLimitWindowMs: values.RATE_LIMIT_WINDOW_SECONDS * 1000,
  googleAuthEnabled: Boolean(values.GOOGLE_CLIENT_ID && values.GOOGLE_CLIENT_SECRET),
  slackEnabled: Boolean(values.SLACK_CLIENT_ID && values.SLACK_CLIENT_SECRET),
  bullBoardAuthEnabled: Boolean(values.BULL_BOARD_USERNAME && values.BULL_BOARD_PASSWORD),
} as const;

export type Env = typeof env;
