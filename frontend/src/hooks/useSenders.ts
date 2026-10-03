import { useMutation, useQuery } from '@tanstack/react-query';
import { sendersApi } from '@/api/endpoints';
import { queryClient, queryKeys } from '@/lib/query-client';
import type { Sender } from '@/types/api';

export function useSenders() {
  return useQuery({
    queryKey: queryKeys.senders,
    queryFn: async ({ signal }) => (await sendersApi.list(signal)).senders,
    staleTime: 60_000,
  });
}

// creates another Ethereal sender
export function useCreateSender() {
  return useMutation({
    mutationFn: async (name?: string) => (await sendersApi.create(name)).sender,
    onSuccess: (sender) =>
      queryClient.setQueryData<Sender[]>(queryKeys.senders, (senders = []) => [...senders, sender]),
  });
}
