// API response types, keep in sync with backend/src/http/dto.ts. Dates are ISO strings.

export type EmailStatus = 'scheduled' | 'rate_limited' | 'sending' | 'sent' | 'failed';
export type EmailView = 'scheduled' | 'sent';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface Sender {
  id: string;
  name: string;
  email: string;
  provider: string;
  hourlyLimit: number;
  createdAt: string;
}

export interface EmailListItem {
  id: string;
  campaignId: string;
  recipient: string;
  subject: string;
  bodyPreview: string;
  status: EmailStatus;
  scheduledAt: string;
  originalScheduledAt: string;
  sentAt: string | null;
  failedAt: string | null;
  previewUrl: string | null;
  lastError: string | null;
  sender: { id: string; name: string; email: string };
}

export interface EmailDetail extends EmailListItem {
  bodyHtml: string;
  bodyText: string;
  attempts: number;
  createdAt: string;
  campaign: {
    id: string;
    startAt: string;
    delayBetweenMs: number;
    hourlyLimit: number;
    totalRecipients: number;
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  source: 'database' | 'elasticsearch';
}

export interface EmailCounts {
  scheduled: number;
  rateLimited: number;
  sent: number;
  failed: number;
}

export interface ScheduleCampaignInput {
  senderId: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  recipients: string[];
  startAt?: string;
  delayBetweenEmailsSeconds: number;
  hourlyLimit: number;
}

export interface ScheduledCampaign {
  campaign: {
    id: string;
    subject: string;
    totalRecipients: number;
    startAt: string;
    firstSendAt: string | null;
    lastSendAt: string | null;
    requested: { delayBetweenMs: number; hourlyLimit: number };
    effective: { delayBetweenMs: number; hourlyLimit: number };
  };
  skipped: { duplicates: number; invalid: string[] };
  replayed: boolean;
}

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  channelName: string | null;
  connectedAt: string | null;
}

export interface AppConfig {
  googleAuthEnabled: boolean;
  slackEnabled: boolean;
  limits: {
    minDelayBetweenEmailsMs: number;
    maxEmailsPerHourPerSender: number;
    maxEmailsPerHour: number;
    rateLimitWindowSeconds: number;
    maxRecipientsPerCampaign: number;
  };
  workerConcurrency: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
