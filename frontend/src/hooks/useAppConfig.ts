import { useQuery } from '@tanstack/react-query';
import { configApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/query-client';

export function useAppConfig() {
  return useQuery({ queryKey: queryKeys.config, queryFn: configApi.get, staleTime: Number.POSITIVE_INFINITY });
}
