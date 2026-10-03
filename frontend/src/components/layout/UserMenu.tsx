import { ChevronDown, ExternalLink, LogOut } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { apiUrl } from '@/api/client';
import { Avatar } from '@/components/ui/Avatar';
import { useCurrentUser, useLogout } from '@/hooks/useAuth';
import { useDismiss } from '@/hooks/useDismiss';
import { cn } from '@/lib/cn';

// avatar, name and email with a small menu (Bull Board link, logout)
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const user = useCurrentUser();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl text-left transition-colors hover:bg-gray-100',
          compact ? 'p-1' : 'p-2',
        )}
      >
        <Avatar name={user.name} src={user.avatarUrl} size={compact ? 'sm' : 'md'} />
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-gray-900">{user.name}</span>
            <span className="block truncate text-xs text-gray-500">{user.email}</span>
          </span>
        )}
        {!compact && <ChevronDown className={cn('size-4 shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} />}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-30 mt-2 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg',
            compact ? 'right-0' : 'left-0',
          )}
        >
          {compact && (
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            </div>
          )}
          <a
            role="menuitem"
            href={apiUrl('/admin/queues')}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <ExternalLink className="size-4 text-gray-400" /> Queue dashboard
          </a>
          <button
            role="menuitem"
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut className="size-4" /> {logout.isPending ? 'Signing out…' : 'Logout'}
          </button>
        </div>
      )}
    </div>
  );
}
