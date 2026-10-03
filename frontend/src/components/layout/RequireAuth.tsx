import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ErrorState, FullPageSpinner } from '@/components/ui/Feedback';
import { errorMessage } from '@/api/client';
import { CurrentUserContext, useSession } from '@/hooks/useAuth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <FullPageSpinner />;
  if (session.isError) {
    return <ErrorState message={errorMessage(session.error)} onRetry={() => session.refetch()} retrying={session.isFetching} />;
  }
  if (!session.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <CurrentUserContext.Provider value={session.data}>{children}</CurrentUserContext.Provider>;
}
