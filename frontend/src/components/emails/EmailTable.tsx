import { Clock, Send } from 'lucide-react';
import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/Feedback';
import { formatChipTime, formatFullDate, formatRelative } from '@/lib/format';
import type { EmailListItem, EmailView } from '@/types/api';
import { StatusBadge } from './StatusBadge';

const GRID = 'md:grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,2fr)_12rem_8.5rem] md:items-center md:gap-x-6';

const timeOf = (email: EmailListItem, view: EmailView) =>
  view === 'scheduled' ? email.scheduledAt : (email.sentAt ?? email.failedAt ?? email.scheduledAt);

function EmailRow({ email, view }: { email: EmailListItem; view: EmailView }) {
  const time = timeOf(email, view);
  const TimeIcon = view === 'scheduled' ? Clock : Send;
  return (
    <li>
      <Link
        to={`/emails/${email.id}`}
        className={`${GRID} flex flex-col gap-1.5 px-6 py-3.5 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50`}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="truncate text-sm">
            <span className="text-gray-400">To: </span>
            <span className="font-medium text-gray-900">{email.recipient}</span>
          </p>
          <StatusBadge status={email.status} className="md:hidden" />
        </div>

        <p className="min-w-0 truncate text-sm">
          <span className="font-semibold text-gray-900">{email.subject}</span>
          {email.bodyPreview && <span className="text-gray-500"> – {email.bodyPreview}</span>}
        </p>

        <div className="flex items-center gap-1.5 text-xs tabular-nums md:items-start" title={formatFullDate(time)}>
          <TimeIcon className="size-3.5 shrink-0 text-gray-400 md:mt-px" aria-hidden />
          <div className="flex flex-wrap gap-x-1.5 md:flex-col md:gap-0.5">
            <span className="whitespace-nowrap text-gray-700">{formatChipTime(time)}</span>
            {view === 'scheduled' && (
              <span className="whitespace-nowrap text-gray-400">
                <span className="md:hidden">· </span>
                {formatRelative(time)}
              </span>
            )}
          </div>
        </div>

        <div className="hidden md:block">
          <StatusBadge status={email.status} />
        </div>
      </Link>
    </li>
  );
}

export function EmailTable({ emails, view }: { emails: EmailListItem[]; view: EmailView }) {
  return (
    <div>
      <div
        className={`${GRID} hidden border-b border-gray-200 bg-gray-50/60 px-6 py-2.5 text-[11px] font-semibold tracking-wider text-gray-500 uppercase`}
        aria-hidden
      >
        <span>Email</span>
        <span>Subject</span>
        <span>{view === 'scheduled' ? 'Scheduled for' : 'Sent at'}</span>
        <span>Status</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {emails.map((email) => (
          <EmailRow key={email.id} email={email} view={view} />
        ))}
      </ul>
    </div>
  );
}

export function EmailTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading emails">
      <div className="hidden h-9 border-b border-gray-200 bg-gray-50/60 md:block" />
      <ul className="divide-y divide-gray-100">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className={`${GRID} flex flex-col gap-2 px-6 py-4`}>
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="hidden h-6 w-24 rounded-full md:block" />
          </li>
        ))}
      </ul>
    </div>
  );
}
