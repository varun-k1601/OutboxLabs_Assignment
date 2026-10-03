import { useMutation, useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { queryClient, queryKeys } from '@/lib/query-client';
import type { User } from '@/types/api';

// current user, or null if not logged in
export function useSession() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async ({ signal }) => {
      try {
        return (await authApi.me(signal)).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export const CurrentUserContext = createContext<User | null>(null);

// only use this inside <RequireAuth>
export function useCurrentUser(): User {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error('useCurrentUser must be used inside <RequireAuth>');
  return user;
}

export function useLogout() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, null);
      navigate('/login', { replace: true });
    },
  });
}
