import { env } from '../config/env';
import type { EmailStatus, Sender, User } from '../db/schema';
import type { EmailSearchDocument } from '../integrations/search-index';
import type { EmailListRow, EmailWithRelations } from '../repositories/emails.repository';

// API response types, keep in sync with frontend/src/types/api.ts. Dates are ISO strings.

export interface UserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface SenderDto {
  id: string;
  name: string;
  email: string;
  provider: string;
  hourlyLimit: number;
  createdAt: string;
}

export interface EmailListItemDto {
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

export interface EmailDetailDto extends EmailListItemDto {
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

export interface PaginatedDto<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  // "elasticsearch" when the rows came from a search
  source: 'database' | 'elasticsearch';
}

const iso = (date: Date | null) => date?.toISOString() ?? null;
const preview = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 160);

export const toUserDto = (user: User): UserDto => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatarUrl: user.avatarUrl,
});

// never send SMTP credentials to the client
export const toSenderDto = (sender: Sender): SenderDto => ({
  id: sender.id,
  name: sender.name,
  email: sender.email,
  provider: sender.provider,
  hourlyLimit: sender.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER,
  createdAt: sender.createdAt.toISOString(),
});

export const toEmailListItemDto = ({ email, bodyPreview, sender }: EmailListRow): EmailListItemDto => ({
  id: email.id,
  campaignId: email.campaignId,
  recipient: email.recipient,
  subject: email.subject,
  bodyPreview: preview(bodyPreview),
  status: email.status,
  scheduledAt: email.scheduledAt.toISOString(),
  originalScheduledAt: email.originalScheduledAt.toISOString(),
  sentAt: iso(email.sentAt),
  failedAt: iso(email.failedAt),
  previewUrl: email.previewUrl,
  lastError: email.lastError,
  sender,
});

export const searchDocumentToDto = (document: EmailSearchDocument): EmailListItemDto => ({
  id: document.id,
  campaignId: document.campaignId,
  recipient: document.recipient,
  subject: document.subject,
  bodyPreview: preview(document.bodyText),
  status: document.status,
  scheduledAt: document.scheduledAt,
  originalScheduledAt: document.originalScheduledAt,
  sentAt: document.sentAt,
  failedAt: document.failedAt,
  previewUrl: document.previewUrl,
  lastError: document.lastError,
  sender: { id: document.senderId, name: document.senderName, email: document.senderEmail },
});

export const toEmailDetailDto = ({ email, campaign, sender }: EmailWithRelations): EmailDetailDto => ({
  ...toEmailListItemDto({ email, bodyPreview: campaign.bodyText, sender }),
  bodyHtml: campaign.bodyHtml,
  bodyText: campaign.bodyText,
  attempts: email.attempts,
  createdAt: email.createdAt.toISOString(),
  campaign: {
    id: campaign.id,
    startAt: campaign.startAt.toISOString(),
    delayBetweenMs: campaign.delayBetweenMs,
    hourlyLimit: campaign.hourlyLimit,
    totalRecipients: campaign.totalRecipients,
  },
});
