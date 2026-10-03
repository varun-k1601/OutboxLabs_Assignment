import { useQueryClient } from '@tanstack/react-query';
import { Clock, PenSquare, RefreshCw, Search, SearchX, Send, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '@/api/client';
import { EmailTable, EmailTableSkeleton } from '@/components/emails/EmailTable';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useEmailList } from '@/hooks/useEmails';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';
import { queryKeys } from '@/lib/query-client';
import type { EmailView } from '@/types/api';

const PAGE_SIZE = 20;

const COPY: Record<EmailView, { title: string; subtitle: string; emptyTitle: string; emptyText: string }> = {
  scheduled: {
    title: 'Scheduled',
    subtitle: 'Emails waiting to go out. Statuses update live.',
    emptyTitle: 'No scheduled emails',
    emptyText: 'Compose an email and upload a list of leads to schedule your first campaign.',
  },
  sent: {
    title: 'Sent',
    subtitle: 'Delivered and failed emails, newest first.',
    emptyTitle: 'Nothing sent yet',
    emptyText: 'Emails show up here as soon as the worker delivers them.',
  },
};

export function EmailListPage({ view }: { view: EmailView }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search.trim(), 300);
  const [pageState, setPageState] = useState({ query: '', page: 1 });
  // a new search goes back to page 1
  const page = pageState.query === query ? pageState.page : 1;

  const list = useEmailList(view, query, page, PAGE_SIZE);
  const copy = COPY[view];
  const result = list.data;

  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.emails });

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-gray-200 px-6 py-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-900">{copy.title}</h1>
          <p className="text-xs text-gray-500">{copy.subtitle}</p>
        </div>

        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <div className="relative flex-1 sm:w-80 sm:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search recipient, subject or content"
              aria-label={`Search ${copy.title.toLowerCase()} emails`}
              className="h-10 w-full rounded-full border border-transparent bg-gray-100 pr-9 pl-9 text-sm outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:bg-white focus:ring-3 focus:ring-brand-100 [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:text-gray-700"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <IconButton label="Refresh" onClick={refresh} disabled={list.isFetching}>
            <RefreshCw className={cn('size-4', list.isFetching && 'animate-spin')} />
          </IconButton>
        </div>
      </header>

      {query && result && (
        <div className="border-b border-gray-100 bg-gray-50 px-6 py-2 text-xs text-gray-500">
          {pluralize(result.total, 'result')} for <span className="font-medium text-gray-700">"{query}"</span> ·{' '}
          {result.source === 'elasticsearch' ? 'full-text search by Elasticsearch' : 'Elasticsearch unavailable, basic search'}
        </div>
      )}

      <div className="flex-1">
        {list.isPending ? (
          <EmailTableSkeleton />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} retrying={list.isFetching} />
        ) : result && result.items.length > 0 ? (
          <EmailTable emails={result.items} view={view} />
        ) : query ? (
          <EmptyState
            icon={<SearchX className="size-6" />}
            title="No matching emails"
            description={`Nothing in ${copy.title} matches "${query}".`}
            action={
              <Button variant="secondary" onClick={() => setSearch('')}>
                Clear search
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={view === 'scheduled' ? <Clock className="size-6" /> : <Send className="size-6" />}
            title={copy.emptyTitle}
            description={copy.emptyText}
            action={
              <Button onClick={() => navigate('/compose')} icon={<PenSquare className="size-4" />}>
                Compose new email
              </Button>
            }
          />
        )}
      </div>

      {result && result.total > PAGE_SIZE && (
        <div className="border-t border-gray-200">
          <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} onPageChange={(next) => setPageState({ query, page: next })} />
        </div>
      )}
    </div>
  );
}
