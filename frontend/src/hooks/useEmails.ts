import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { campaignsApi, emailsApi } from '@/api/endpoints';
import { queryClient, queryKeys } from '@/lib/query-client';
import type { EmailStatus, EmailView, ScheduleCampaignInput } from '@/types/api';

// statuses change while the worker is sending, so keep polling
const LIVE_REFRESH_MS = 5_000;
const PENDING: readonly EmailStatus[] = ['scheduled', 'rate_limited', 'sending'];

export function useEmailList(view: EmailView, q: string, page: number, pageSize = 20) {
  return useQuery({
    queryKey: queryKeys.emailList(view, q, page),
    queryFn: ({ signal }) => emailsApi.list({ view, q: q || undefined, page, pageSize }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useEmailCounts() {
  return useQuery({
    queryKey: queryKeys.emailCounts,
    queryFn: ({ signal }) => emailsApi.counts(signal),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useEmail(id: string) {
  return useQuery({
    queryKey: queryKeys.email(id),
    queryFn: async ({ signal }) => (await emailsApi.get(id, signal)).email,
    // stop polling once it's sent or failed
    refetchInterval: (query) => (query.state.data && !PENDING.includes(query.state.data.status) ? false : LIVE_REFRESH_MS),
  });
}

export function useScheduleCampaign() {
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: ScheduleCampaignInput; idempotencyKey: string }) =>
      campaignsApi.schedule(input, idempotencyKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.emails }),
  });
}
