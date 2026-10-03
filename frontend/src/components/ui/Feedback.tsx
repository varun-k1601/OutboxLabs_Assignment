import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return <Loader2 role="status" aria-label={label} className={cn('size-5 animate-spin text-gray-400', className)} />;
}

export function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-7 text-brand-600" />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-gray-100', className)} />;
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">{icon}</div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export function ErrorState({ message, onRetry, retrying }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-gray-900">Couldn't load this</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry} loading={retrying} icon={<RotateCw className="size-4" />}>
          Try again
        </Button>
      )}
    </div>
  );
}
