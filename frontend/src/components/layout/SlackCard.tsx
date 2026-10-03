import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { SlackIcon } from '@/components/ui/BrandIcons';
import { Skeleton } from '@/components/ui/Feedback';
import { useConnectSlack, useDisconnectSlack, useSlackStatus, useSlackTestMessage } from '@/hooks/useSlack';

// connect / test / disconnect Slack for the limit alerts
export function SlackCard() {
  const status = useSlackStatus();
  const connect = useConnectSlack();
  const disconnect = useDisconnectSlack();
  const test = useSlackTestMessage();

  const onConnect = () =>
    connect.mutate(undefined, { onError: (err) => toast.error('Could not start Slack sign-in', { description: errorMessage(err) }) });
  const onTest = () =>
    test.mutate(undefined, {
      onSuccess: () => toast.success('Test message sent to Slack'),
      onError: (err) => {
        toast.error('Slack test failed', { description: errorMessage(err) });
        void status.refetch(); // the server removes it if Slack says it was revoked
      },
    });
  const onDisconnect = () =>
    disconnect.mutate(undefined, {
      onSuccess: () => toast.success('Slack disconnected'),
      onError: (err) => toast.error('Could not disconnect Slack', { description: errorMessage(err) }),
    });

  return (
    <section aria-label="Slack alerts" className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-xs">
      <div className="flex items-center gap-2">
        <SlackIcon className="size-4" />
        <h2 className="text-sm font-semibold text-gray-900">Slack alerts</h2>
        {status.data?.connected && <span className="ml-auto size-2 rounded-full bg-brand-500" title="Connected" />}
      </div>

      {status.isPending ? (
        <Skeleton className="mt-3 h-8 w-full" />
      ) : status.isError ? (
        <p className="mt-1.5 text-xs text-red-600">Status unavailable</p>
      ) : !status.data.configured ? (
        <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
          Not configured on the server (set <code className="text-[11px]">SLACK_CLIENT_ID</code> /{' '}
          <code className="text-[11px]">SLACK_CLIENT_SECRET</code>).
        </p>
      ) : status.data.connected ? (
        <>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
            Alerts go to <span className="font-medium text-gray-700">{status.data.channelName ?? 'your channel'}</span>
            {status.data.teamName && <> in {status.data.teamName}</>}.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" className="flex-1" onClick={onTest} loading={test.isPending}>
              Send test
            </Button>
            <Button size="sm" variant="danger" onClick={onDisconnect} loading={disconnect.isPending}>
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-500">Get a message the moment a sender hits its hourly limit.</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3 w-full"
            onClick={onConnect}
            loading={connect.isPending}
            icon={<SlackIcon className="size-3.5" />}
          >
            Connect Slack
          </Button>
        </>
      )}
    </section>
  );
}
