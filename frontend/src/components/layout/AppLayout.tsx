import { useEffect, useRef } from 'react';
import { Outlet, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { queryClient, queryKeys } from '@/lib/query-client';
import { MobileHeader, Sidebar } from './Sidebar';

const SLACK_OUTCOMES: Record<string, () => void> = {
  connected: () => toast.success('Slack connected', { description: 'Hourly-limit alerts will be posted to your channel.' }),
  cancelled: () => toast.info('Slack connection cancelled'),
  error: () => toast.error('Slack connection failed', { description: 'Please try connecting again.' }),
};

// shows a toast when we come back from Slack OAuth (/dashboard?slack=...)
function useSlackRedirectResult() {
  const [params, setParams] = useSearchParams();
  const outcome = params.get('slack');
  // OAuth comes back with a full page load, so we only handle it once per mount
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!outcome || handled.current === outcome) return;
    handled.current = outcome;
    (SLACK_OUTCOMES[outcome] ?? SLACK_OUTCOMES.error)?.();
    void queryClient.invalidateQueries({ queryKey: queryKeys.slack });
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('slack');
        return next;
      },
      { replace: true },
    );
  }, [outcome, setParams]);
}

export function AppLayout() {
  useSlackRedirectResult();
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
