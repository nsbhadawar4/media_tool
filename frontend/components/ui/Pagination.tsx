import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationMeta } from '@/types/api';

/** The page numbers to show: always the first and last, the current one and its neighbours. */
function pageList(current: number, total: number): (number | 'gap')[] {
  const pages = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1] > 1) out.push('gap');
    out.push(page);
  });
  return out;
}

export function Pagination({
  meta,
  onPageChange,
  numbered = false,
}: {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  /** Show page numbers between the arrows (off by default, so existing lists are unchanged). */
  numbered?: boolean;
}) {
  if (meta.totalPages <= 1) return null;

  return (
    <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
      <p className="text-xs text-muted">
        Page {meta.page} of {meta.totalPages} &middot; {meta.total} total
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-elevated text-muted transition hover:border-border-strong hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {numbered &&
          pageList(meta.page, meta.totalPages).map((page, i) =>
            page === 'gap' ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-muted" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                aria-current={page === meta.page ? 'page' : undefined}
                aria-label={`Page ${page}`}
                className={
                  page === meta.page
                    ? 'flex h-8 min-w-8 items-center justify-center rounded-lg border border-accent/40 bg-accent/15 px-2 text-xs font-semibold text-foreground'
                    : 'flex h-8 min-w-8 items-center justify-center rounded-lg border border-border bg-surface-elevated px-2 text-xs text-muted transition hover:border-border-strong hover:bg-surface-hover hover:text-foreground'
                }
              >
                {page}
              </button>
            ),
          )}
        <button
          type="button"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-elevated text-muted transition hover:border-border-strong hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
