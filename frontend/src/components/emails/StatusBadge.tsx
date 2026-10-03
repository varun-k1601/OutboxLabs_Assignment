import { CheckCircle2, Clock, Gauge, Loader2, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { EmailStatus } from '@/types/api';

const STATUS: Record<EmailStatus, { label: string; icon: LucideIcon; className: string; spin?: boolean; title: string }> = {
  scheduled: {
    label: 'Scheduled',
    icon: Clock,
    className: 'bg-amber-50 text-amber-700 ring-amber-200',
    title: 'Waiting in the queue for its send time',
  },
  rate_limited: {
    label: 'Rate limited',
    icon: Gauge,
    className: 'bg-orange-50 text-orange-700 ring-orange-200',
    title: 'Hourly limit reached; moved to the next available hour (nothing is dropped)',
  },
  sending: {
    label: 'Sending',
    icon: Loader2,
    spin: true,
    className: 'bg-sky-50 text-sky-700 ring-sky-200',
    title: 'Being delivered over SMTP right now',
  },
  sent: { label: 'Sent', icon: CheckCircle2, className: 'bg-brand-50 text-brand-700 ring-brand-200', title: 'Accepted by the SMTP server' },
  failed: { label: 'Failed', icon: XCircle, className: 'bg-red-50 text-red-700 ring-red-200', title: 'Delivery failed' },
};

export function StatusBadge({ status, className }: { status: EmailStatus; className?: string }) {
  const { label, icon: Icon, className: tone, spin, title } = STATUS[status];
  return (
    <span
      title={title}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ring-1 ring-inset', tone, className)}
    >
      <Icon className={cn('size-3.5', spin && 'animate-spin')} aria-hidden />
      {label}
    </span>
  );
}
