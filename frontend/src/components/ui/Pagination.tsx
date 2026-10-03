import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './Button';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-3 text-sm text-gray-500">
      <span>
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <IconButton label="Previous page" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-4" />
        </IconButton>
        <span className="min-w-16 text-center tabular-nums">
          {page} / {pages}
        </span>
        <IconButton label="Next page" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}
