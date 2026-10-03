import type {
  AppConfig,
  EmailCounts,
  EmailDetail,
  EmailListItem,
  EmailView,
  Paginated,
  ScheduleCampaignInput,
  ScheduledCampaign,
  Sender,
  SlackStatus,
  User,
} from '@/types/api';
import { apiRequest, apiUrl } from './client';

export interface ListEmailsParams {
  view: EmailView;
  q?: string;
  page?: number;
  pageSize?: number;
}

export const authApi = {
  // full page redirect, starts the Google login
  googleLoginUrl: apiUrl('/api/auth/google'),
  me: (signal?: AbortSignal) => apiRequest<{ user: User }>('/api/auth/me', { signal }),
  logout: () => apiRequest<void>('/api/auth/logout', { method: 'POST' }),
};

export const configApi = {
  get: () => apiRequest<AppConfig>('/api/config'),
};

export const emailsApi = {
  list: ({ view, q, page = 1, pageSize = 20 }: ListEmailsParams, signal?: AbortSignal) => {
    const params = new URLSearchParams({ view, page: String(page), pageSize: String(pageSize) });
    if (q) params.set('q', q);
    return apiRequest<Paginated<EmailListItem>>(`/api/emails?${params}`, { signal });
  },
  counts: (signal?: AbortSignal) => apiRequest<EmailCounts>('/api/emails/counts', { signal }),
  get: (id: string, signal?: AbortSignal) => apiRequest<{ email: EmailDetail }>(`/api/emails/${id}`, { signal }),
};

export const sendersApi = {
  list: (signal?: AbortSignal) => apiRequest<{ senders: Sender[] }>('/api/senders', { signal }),
  create: (name?: string) => apiRequest<{ sender: Sender }>('/api/senders', { method: 'POST', body: { name } }),
};

export const campaignsApi = {
  schedule: (input: ScheduleCampaignInput, idempotencyKey: string) =>
    apiRequest<ScheduledCampaign>('/api/campaigns', {
      method: 'POST',
      body: input,
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
};

export const slackApi = {
  status: (signal?: AbortSignal) => apiRequest<SlackStatus>('/api/slack/status', { signal }),
  install: () => apiRequest<{ url: string }>('/api/slack/install', { method: 'POST' }),
  test: () => apiRequest<void>('/api/slack/test', { method: 'POST' }),
  disconnect: () => apiRequest<void>('/api/slack', { method: 'DELETE' }),
};
