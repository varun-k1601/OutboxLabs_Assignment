import { AlertCircle, ArrowLeft, ExternalLink } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError, errorMessage } from '@/api/client';
import { StatusBadge } from '@/components/emails/StatusBadge';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useEmail } from '@/hooks/useEmails';
import { describeWindow, formatDuration, formatFullDate, formatRelative, pluralize } from '@/lib/format';
import type { EmailDetail } from '@/types/api';

// sandboxed iframe for the email HTML, no scripts and links open in a new tab
function EmailBodyFrame({ html }: { html: string }) {
  const [height, setHeight] = useState(240);
  const document = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
    <style>body{margin:0;font:15px/1.6 Inter,system-ui,sans-serif;color:#1f2937;word-wrap:break-word}
    p{margin:0 0 .75em}a{color:#168a42}blockquote{margin:0 0 .75em;border-left:4px solid #e5e7eb;padding-left:12px;color:#4b5563}</style>
    </head><body>${html}</body></html>`;
  return (
    <iframe
      title="Email body"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={document}
      style={{ height }}
      className="w-full border-0"
      onLoad={(event) => {
        const body = event.currentTarget.contentDocument?.body;
        if (body) setHeight(Math.max(120, body.scrollHeight + 8));
      }}
    />
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

function EmailDetailView({ email }: { email: EmailDetail }) {
  const config = useAppConfig();
  const per = describeWindow(config.data?.limits.rateLimitWindowSeconds ?? 3600);
  const rescheduled = email.scheduledAt !== email.originalScheduledAt;
  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs">
      <div className="flex flex-wrap items-start gap-4 border-b border-gray-100 p-5">
        <Avatar name={email.sender.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            <span className="font-semibold text-gray-900">{email.sender.name}</span>{' '}
            <span className="text-gray-500">&lt;{email.sender.email}&gt;</span>
          </p>
          <p className="truncate text-sm text-gray-500">to {email.recipient}</p>
        </div>
        {email.previewUrl && (
          <a
            href={email.previewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            View on Ethereal <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-gray-100 bg-gray-50/60 p-5 sm:grid-cols-3">
        {email.sentAt ? (
          <Detail label="Sent at">{formatFullDate(email.sentAt)}</Detail>
        ) : email.failedAt ? (
          <Detail label="Failed at">{formatFullDate(email.failedAt)}</Detail>
        ) : (
          <Detail label="Scheduled for">
            {formatFullDate(email.scheduledAt)} <span className="text-gray-500">({formatRelative(email.scheduledAt)})</span>
          </Detail>
        )}
        <Detail label={rescheduled ? 'Originally planned for' : 'Planned for'}>{formatFullDate(email.originalScheduledAt)}</Detail>
        <Detail label="Attempts">{email.attempts}</Detail>
        <Detail label="Delay between emails">{formatDuration(email.campaign.delayBetweenMs)}</Detail>
        <Detail label={per === 'hour' ? 'Hourly limit' : `Limit per ${per}`}>
          {email.campaign.hourlyLimit.toLocaleString()} / {per}
        </Detail>
        <Detail label="Campaign size">{pluralize(email.campaign.totalRecipients, 'recipient')}</Detail>
      </dl>

      {email.status === 'rate_limited' && (
        <p className="flex items-start gap-2 border-b border-orange-100 bg-orange-50 px-5 py-3 text-sm text-orange-800">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          The hourly limit was reached, so this email was moved to the next available hour. It will still be sent, in order.
        </p>
      )}
      {email.lastError && (
        <p className="flex items-start gap-2 border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {email.lastError}
        </p>
      )}

      <div className="p-5">
        <EmailBodyFrame html={email.bodyHtml} />
      </div>
    </article>
  );
}

export function EmailDetailPage() {
  const { emailId = '' } = useParams();
  const navigate = useNavigate();
  const email = useEmail(emailId);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-center gap-3">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-5" />
        </IconButton>
        {email.data ? (
          <>
            <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-gray-900">{email.data.subject}</h1>
            <StatusBadge status={email.data.status} />
          </>
        ) : (
          <Skeleton className="h-7 w-72" />
        )}
      </div>

      {email.isPending ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : email.isError ? (
        email.error instanceof ApiError && email.error.status === 404 ? (
          <EmptyState icon={<AlertCircle className="size-6" />} title="Email not found" description="It may belong to another account." />
        ) : (
          <ErrorState message={errorMessage(email.error)} onRetry={() => email.refetch()} retrying={email.isFetching} />
        )
      ) : (
        <EmailDetailView email={email.data} />
      )}
    </div>
  );
}
