import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// Status flow: scheduled -> sending -> sent / failed.
// rate_limited = the limiter moved the email to a later window, it's still pending.
export const EMAIL_STATUSES = ['scheduled', 'rate_limited', 'sending', 'sent', 'failed'] as const;
export const emailStatusEnum = pgEnum('email_status', EMAIL_STATUSES);
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const PENDING_STATUSES = ['scheduled', 'rate_limited', 'sending'] as const satisfies readonly EmailStatus[];
export const CLAIMABLE_STATUSES = ['scheduled', 'rate_limited'] as const satisfies readonly EmailStatus[];
export const FINISHED_STATUSES = ['sent', 'failed'] as const satisfies readonly EmailStatus[];

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    googleId: text('google_id').notNull(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_google_id_uq').on(t.googleId)],
);

// SMTP accounts we send from (Ethereal test accounts here)
export const senders = pgTable(
  'senders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    provider: text('provider').notNull().default('ethereal'),
    smtpHost: text('smtp_host').notNull(),
    smtpPort: integer('smtp_port').notNull(),
    smtpSecure: boolean('smtp_secure').notNull().default(false),
    smtpUser: text('smtp_user').notNull(),
    smtpPass: text('smtp_pass').notNull(),
    // null = use MAX_EMAILS_PER_HOUR_PER_SENDER
    hourlyLimit: integer('hourly_limit'),
    ...timestamps,
  },
  (t) => [index('senders_user_idx').on(t.userId)],
);

// one compose/schedule action (same message, many recipients)
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => senders.id, { onDelete: 'restrict' }),
    subject: text('subject').notNull(),
    bodyHtml: text('body_html').notNull(),
    bodyText: text('body_text').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    // delay and hourly limit are what the user entered in the compose form
    delayBetweenMs: integer('delay_between_ms').notNull(),
    hourlyLimit: integer('hourly_limit').notNull(),
    totalRecipients: integer('total_recipients').notNull(),
    // from the Idempotency-Key header, a retried request gets the same campaign back
    idempotencyKey: text('idempotency_key'),
    ...timestamps,
  },
  (t) => [
    index('campaigns_user_idx').on(t.userId),
    uniqueIndex('campaigns_user_idempotency_uq').on(t.userId, t.idempotencyKey),
  ],
);

// one row per recipient. The id is also the BullMQ job id
export const emails = pgTable(
  'emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => senders.id, { onDelete: 'restrict' }),
    recipient: text('recipient').notNull(),
    subject: text('subject').notNull(),
    status: emailStatusEnum('status').notNull().default('scheduled'),
    // current due time, the limiter can push it forward
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    // first planned time, never updated
    originalScheduledAt: timestamp('original_scheduled_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    messageId: text('message_id'),
    previewUrl: text('preview_url'),
    lastError: text('last_error'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('emails_campaign_recipient_uq').on(t.campaignId, t.recipient),
    index('emails_user_status_scheduled_idx').on(t.userId, t.status, t.scheduledAt),
    index('emails_status_scheduled_idx').on(t.status, t.scheduledAt),
    index('emails_campaign_status_idx').on(t.campaignId, t.status),
  ],
);

// Slack install per user (incoming webhook from OAuth v2)
export const slackConnections = pgTable(
  'slack_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    teamId: text('team_id').notNull(),
    teamName: text('team_name'),
    channelId: text('channel_id'),
    channelName: text('channel_name'),
    webhookUrl: text('webhook_url').notNull(),
    configurationUrl: text('configuration_url'),
    accessToken: text('access_token'),
    ...timestamps,
  },
  (t) => [uniqueIndex('slack_connections_user_uq').on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type Sender = typeof senders.$inferSelect;
export type NewSender = typeof senders.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
export type SlackConnection = typeof slackConnections.$inferSelect;
