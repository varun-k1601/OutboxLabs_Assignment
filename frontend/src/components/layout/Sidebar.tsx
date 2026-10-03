import { Clock, PenSquare, Send, type LucideIcon } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router';
import { Logo } from '@/components/ui/BrandIcons';
import { Button } from '@/components/ui/Button';
import { useEmailCounts } from '@/hooks/useEmails';
import { cn } from '@/lib/cn';
import { SlackCard } from './SlackCard';
import { UserMenu } from './UserMenu';

interface NavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  count?: number;
}

function NavItem({ to, icon: Icon, label, count }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          isActive ? 'bg-brand-50 font-semibold text-brand-800' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        )
      }
    >
      <Icon className="size-4" aria-hidden />
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-xs font-medium text-gray-500 tabular-nums">{count.toLocaleString()}</span>}
    </NavLink>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const counts = useEmailCounts();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50/70 md:flex">
      <div className="px-5 pt-5">
        <Logo />
      </div>

      <div className="px-3 pt-5">
        <UserMenu />
      </div>

      <div className="px-4 pt-4">
        <Button variant="outline" pill className="w-full" onClick={() => navigate('/compose')} icon={<PenSquare className="size-4" />}>
          Compose
        </Button>
      </div>

      <nav aria-label="Mailboxes" className="mt-6 space-y-1 px-3">
        <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-gray-400 uppercase">Core</p>
        <NavItem to="/dashboard/scheduled" icon={Clock} label="Scheduled" count={counts.data?.scheduled} />
        <NavItem to="/dashboard/sent" icon={Send} label="Sent" count={counts.data?.sent} />
      </nav>

      <div className="mt-auto p-3">
        <SlackCard />
      </div>
    </aside>
  );
}

// top bar on mobile, the sidebar is hidden below md
export function MobileHeader() {
  const navigate = useNavigate();
  const counts = useEmailCounts();
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn('flex-1 border-b-2 py-2.5 text-center text-sm font-medium', isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500');

  return (
    <header className="border-b border-gray-200 bg-white md:hidden">
      <div className="flex items-center gap-2 px-4 py-3">
        <Logo />
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" pill onClick={() => navigate('/compose')} icon={<PenSquare className="size-3.5" />}>
            Compose
          </Button>
          <UserMenu compact />
        </div>
      </div>
      <nav aria-label="Mailboxes" className="flex px-4">
        <NavLink to="/dashboard/scheduled" className={tab}>
          Scheduled {counts.data ? `(${counts.data.scheduled})` : ''}
        </NavLink>
        <NavLink to="/dashboard/sent" className={tab}>
          Sent {counts.data ? `(${counts.data.sent})` : ''}
        </NavLink>
      </nav>
    </header>
  );
}
