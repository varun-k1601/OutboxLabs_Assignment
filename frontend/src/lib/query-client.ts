import { QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';

export const queryKeys = {
  me: ['me'] as const,
  config: ['config'] as const,
  senders: ['senders'] as const,
  slack: ['slack'] as const,
  emails: ['emails'] as const,
  emailList: (view: string, q: string, page: number) => ['emails', 'list', view, q, page] as const,
  emailCounts: ['emails', 'counts'] as const,
  email: (id: string) => ['emails', 'detail', id] as const,
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // any 401 means the session expired, send the user back to login
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(queryKeys.me, null);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500 && error.status !== 0) && failureCount < 2,
    },
  },
});
