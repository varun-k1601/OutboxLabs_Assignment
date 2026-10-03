import { useMutation, useQuery } from '@tanstack/react-query';
import { slackApi } from '@/api/endpoints';
import { queryClient, queryKeys } from '@/lib/query-client';

export function useSlackStatus() {
  return useQuery({ queryKey: queryKeys.slack, queryFn: ({ signal }) => slackApi.status(signal) });
}

// goes to slack.com for OAuth and comes back to the dashboard after
export function useConnectSlack() {
  return useMutation({
    mutationFn: slackApi.install,
    onSuccess: ({ url }) => window.location.assign(url),
  });
}

export function useDisconnectSlack() {
  return useMutation({
    mutationFn: slackApi.disconnect,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.slack }),
  });
}

export function useSlackTestMessage() {
  return useMutation({ mutationFn: slackApi.test });
}
