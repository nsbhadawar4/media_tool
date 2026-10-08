'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock3, Eye, Globe, PartyPopper, RefreshCw, Search, Star, XCircle, MessagesSquare } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { useDebounce } from '@/hooks/useDebounce';
import { REVIEW_CATEGORY_LABEL, adminReviewsApi, type AdminReview, type AdminReviewSort, type ReviewCategory, type ReviewStatus } from '@/lib/api/reviews';
import { formatDateShort } from '@/utils/format';
import { cn } from '@/utils/cn';
import { ModerationBadge, VisibilityBadge } from '../ReviewStatusBadge';
import { StarDisplay } from '../ReviewStars';
import { ModerationDialog, ReviewDetailModal, useBulkModeration, useModeration, type ModerationAction } from './ReviewModeration';

const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];
const RATING_OPTIONS = [{ label: 'All ratings', value: '' }, ...[5, 4, 3, 2, 1].map((n) => ({ label: `${n} star${n > 1 ? 's' : ''}`, value: String(n) }))];
const CATEGORY_OPTIONS = [{ label: 'All categories', value: '' }, ...(Object.keys(REVIEW_CATEGORY_LABEL) as ReviewCategory[]).map((value) => ({ label: REVIEW_CATEGORY_LABEL[value], value }))];
const VISIBILITY_OPTIONS = [
  { label: 'All visibility', value: '' },
  { label: 'Public', value: 'public' },
  { label: 'Private', value: 'private' },
];
const SORT_OPTIONS: { label: string; value: AdminReviewSort }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Highest rating', value: 'rating_desc' },
  { label: 'Lowest rating', value: 'rating_asc' },
];
const PAGE_SIZE_OPTIONS = [10, 20, 50].map((n) => ({ label: `${n} per page`, value: String(n) }));

export const ADMIN_REVIEW_STATS_KEY = ['admin', 'reviews', 'stats'] as const;

/** /admin/reviews: moderate, publish and remove feedback. Every filter is applied by the server. */
export function AdminReviewsView() {
  const [status, setStatus] = useState<'' | ReviewStatus>('');
  const [visibility, setVisibility] = useState<'' | 'public' | 'private'>('');
  const [rating, setRating] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<AdminReviewSort>('newest');
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<AdminReview | null>(null);
  const [pending, setPending] = useState<{ action: ModerationAction; review: AdminReview } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<'approve' | 'reject' | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const params = {
    status: status || undefined,
    visibility: visibility || undefined,
    rating: rating ? Number(rating) : undefined,
    category: (category || undefined) as ReviewCategory | undefined,
    search: debouncedSearch.trim() || undefined,
    sort,
    page,
    limit,
  };

  const stats = useQuery({ queryKey: ADMIN_REVIEW_STATS_KEY, queryFn: async ({ signal }) => (await adminReviewsApi.stats(signal)).data });
  const list = useQuery({ queryKey: ['admin', 'reviews', 'list', params], queryFn: ({ signal }) => adminReviewsApi.list(params, signal) });

  const moderation = useModeration((action, review) => {
    setPending(null);
    setSelected((ids) => ids.filter((id) => id !== review.id));
    if (action === 'delete') {
      setViewing(null);
      return;
    }
    setFlashId(review.id);
    // Keep the open detail view in step with what just happened.
    void adminReviewsApi.get(review.id).then((res) => setViewing((current) => (current?.id === review.id ? res.data : current)));
  });
  const bulkModeration = useBulkModeration(() => {
    setBulk(null);
    setSelected([]);
  });

  const ask = (action: ModerationAction, review: AdminReview) => setPending({ action, review });
  const reviews = list.data?.data ?? [];
  const meta = list.data?.meta;
  const s = stats.data;
  const filtered = Boolean(status || visibility || rating || category || debouncedSearch.trim());
  const selectable = reviews.filter((r) => r.status === 'pending');
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.includes(r.id));

  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
    setSelected([]);
  };

  const refresh = () => {
    void stats.refetch();
    void list.refetch();
  };

  const toggle = (id: string) => setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Manage"
        icon={Star}
        title="Reviews"
        description="Review, moderate and publish customer feedback."
        actions={
          <Button variant="secondary" onClick={refresh} disabled={list.isFetching || stats.isFetching}>
            <RefreshCw className={cn('h-4 w-4', (list.isFetching || stats.isFetching) && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      {stats.isError ? (
        <ErrorState error={stats.error} subject="review statistics" onRetry={() => stats.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6" aria-label="Review statistics">
          {!s ? (
            Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard index={0} icon={MessagesSquare} label="Total Reviews" value={String(s.total)} hint="All submitted" />
              <StatCard index={1} icon={Clock3} label="Pending" value={String(s.pending)} hint="Waiting for you" color="#f59e0b" />
              <StatCard index={2} icon={CheckCircle2} label="Approved" value={String(s.approved)} hint="Public or unpublished" color="#22c55e" />
              <StatCard index={3} icon={XCircle} label="Rejected" value={String(s.rejected)} hint="Never public" color="#f43f5e" />
              <StatCard index={4} icon={Globe} label="Public Reviews" value={String(s.published)} hint="Visible to everyone" color="#38bdf8" />
              <StatCard index={5} icon={Star} label="Average Rating" value={s.published ? `${s.averagePublic.toFixed(1)} ★` : '—'} hint="Public reviews only" color="#fbbf24" />
            </>
          )}
        </div>
      )}

      {/* Filters: every one is a server query parameter. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card sm:p-4">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => change(setSearch)(e.target.value)}
            placeholder="Search by user or review..."
            aria-label="Search by user or review"
            className="h-10 w-full rounded-xl border border-border bg-surface-elevated pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Select aria-label="Filter by status" options={STATUS_OPTIONS} value={status} onChange={(e) => change(setStatus)(e.target.value as '' | ReviewStatus)} className="h-10 w-full" />
          <Select aria-label="Filter by rating" options={RATING_OPTIONS} value={rating} onChange={(e) => change(setRating)(e.target.value)} className="h-10 w-full" />
          <Select aria-label="Filter by category" options={CATEGORY_OPTIONS} value={category} onChange={(e) => change(setCategory)(e.target.value)} className="h-10 w-full" />
          <Select aria-label="Filter by visibility" options={VISIBILITY_OPTIONS} value={visibility} onChange={(e) => change(setVisibility)(e.target.value as '' | 'public' | 'private')} className="h-10 w-full" />
          <Select aria-label="Sort reviews" options={SORT_OPTIONS} value={sort} onChange={(e) => change(setSort)(e.target.value as AdminReviewSort)} className="h-10 w-full" />
          <Select aria-label="Reviews per page" options={PAGE_SIZE_OPTIONS} value={String(limit)} onChange={(e) => change(setLimit)(Number(e.target.value))} className="h-10 w-full" />
        </div>
      </div>

      {selected.length > 0 && (
        <div className="anim-rise flex flex-col gap-2 rounded-2xl border border-accent/30 bg-accent/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="region" aria-label="Bulk actions">
          <p className="text-sm font-medium text-foreground">
            {selected.length} pending review{selected.length === 1 ? '' : 's'} selected
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear
            </Button>
            <Button variant="danger" size="sm" onClick={() => setBulk('reject')}>
              <XCircle className="h-4 w-4" />
              Reject selected
            </Button>
            <Button size="sm" onClick={() => setBulk('approve')}>
              <CheckCircle2 className="h-4 w-4" />
              Approve selected
            </Button>
          </div>
        </div>
      )}

      {list.isError ? (
        <ErrorState error={list.error} subject="reviews" onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <ReviewTableSkeleton />
      ) : reviews.length === 0 ? (
        s && s.total === 0 ? (
          <EmptyState icon={Star} title="No reviews yet" description="Customer feedback will appear here once users start sharing their experience." />
        ) : status === 'pending' && !visibility && !rating && !category && !debouncedSearch.trim() ? (
          <EmptyState icon={PartyPopper} title="You're all caught up!" description="There are no pending reviews. New feedback will appear here." />
        ) : (
          <EmptyState
            icon={Search}
            title="No reviews match these filters"
            description="Try a different search, status, rating, category or visibility."
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStatus('');
                    setVisibility('');
                    setRating('');
                    setCategory('');
                    setSearch('');
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          {/* Tablet and desktop: a table. Columns drop away as space shrinks, never a sideways scroll. */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-card md:block">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="border-b border-border bg-surface-hover/50 text-xs font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      disabled={selectable.length === 0}
                      onChange={() => setSelected(allSelected ? [] : selectable.map((r) => r.id))}
                      aria-label="Select all pending reviews on this page"
                      className="h-4 w-4 accent-accent"
                    />
                  </th>
                  <th scope="col" className="w-[18%] px-3 py-3">User</th>
                  <th scope="col" className="hidden w-[11%] px-3 py-3 lg:table-cell">Rating</th>
                  <th scope="col" className="px-3 py-3">Review</th>
                  <th scope="col" className="hidden w-[10%] px-3 py-3 xl:table-cell">Category</th>
                  <th scope="col" className="hidden w-[10%] px-3 py-3 xl:table-cell">Submitted</th>
                  <th scope="col" className="w-[13%] px-3 py-3">Status</th>
                  <th scope="col" className="w-[12%] px-3 py-3">Visibility</th>
                  <th scope="col" className="w-[9%] px-3 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((review) => (
                  <tr
                    key={review.id}
                    onClick={() => setViewing(review)}
                    className={cn('cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-surface-hover/50', flashId === review.id && 'rv-flash', selected.includes(review.id) && 'bg-accent/5')}
                  >
                    <td className="px-3 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.includes(review.id)}
                        disabled={review.status !== 'pending'}
                        onChange={() => toggle(review.id)}
                        aria-label={`Select review by ${review.user?.name ?? 'deleted account'}`}
                        className="h-4 w-4 accent-accent disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <p className="truncate font-medium text-foreground">{review.user?.name ?? 'Deleted account'}</p>
                      <p className="truncate text-xs text-muted">{review.user?.email ?? '—'}</p>
                    </td>
                    <td className="hidden px-3 py-3 align-top lg:table-cell">
                      <StarDisplay value={review.rating} size="xs" />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="mb-0.5 block lg:hidden">
                        <StarDisplay value={review.rating} size="xs" />
                      </span>
                      <p className="line-clamp-2 wrap-break-word text-foreground-soft">“{review.reviewText}”</p>
                    </td>
                    <td className="hidden px-3 py-3 align-top text-muted xl:table-cell">{REVIEW_CATEGORY_LABEL[review.category]}</td>
                    <td className="hidden px-3 py-3 align-top text-muted xl:table-cell">{formatDateShort(review.createdAt)}</td>
                    <td className="px-3 py-3 align-top">
                      <ModerationBadge status={review.status} />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <VisibilityBadge status={review.status} isPublic={review.isPublic} />
                    </td>
                    <td className="px-3 py-3 text-right align-top">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewing(review);
                        }}
                        aria-label={`View review by ${review.user?.name ?? 'deleted account'}`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition hover:border-accent/40 hover:bg-surface-hover"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: cards. The actions live in the View sheet. */}
          <ul className="flex flex-col gap-3 md:hidden" aria-label="Reviews">
            {reviews.map((review) => (
              <li key={review.id} className={cn('rounded-2xl border border-border bg-surface p-4 shadow-card', flashId === review.id && 'rv-flash')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{review.user?.name ?? 'Deleted account'}</p>
                    <p className="truncate text-xs text-muted">{review.user?.email ?? '—'}</p>
                  </div>
                  <ModerationBadge status={review.status} />
                </div>
                <div className="mt-2">
                  <StarDisplay value={review.rating} size="sm" />
                </div>
                <p className="mt-2 line-clamp-3 wrap-break-word text-sm text-foreground-soft">“{review.reviewText}”</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{REVIEW_CATEGORY_LABEL[review.category]}</span>
                  <span>{formatDateShort(review.createdAt)}</span>
                  <VisibilityBadge status={review.status} isPublic={review.isPublic} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  {review.status === 'pending' ? (
                    <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
                      <input type="checkbox" checked={selected.includes(review.id)} onChange={() => toggle(review.id)} className="h-4 w-4 accent-accent" />
                      Select
                    </label>
                  ) : (
                    <span />
                  )}
                  <Button variant="secondary" className="min-h-11" onClick={() => setViewing(review)} aria-label={`View review by ${review.user?.name ?? 'deleted account'}`}>
                    <Eye className="h-4 w-4" />
                    View
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {meta && meta.totalPages > 1 && <Pagination meta={meta} onPageChange={setPage} numbered />}

      <ReviewDetailModal review={viewing} onClose={() => setViewing(null)} onAction={ask} />
      <ModerationDialog
        pending={pending}
        onClose={() => setPending(null)}
        isLoading={moderation.isPending}
        onConfirm={(reason) => pending && moderation.mutate({ ...pending, reason })}
      />
      <ConfirmDialog
        isOpen={bulk !== null}
        onClose={() => setBulk(null)}
        onConfirm={() => bulk && bulkModeration.mutate({ action: bulk, ids: selected })}
        title={bulk === 'approve' ? `Approve and publish ${selected.length} review${selected.length === 1 ? '' : 's'}?` : `Reject ${selected.length} review${selected.length === 1 ? '' : 's'}?`}
        description={
          bulk === 'approve'
            ? 'Once approved, these reviews will become visible in the public Reviews section.'
            : 'They will not be shown publicly. The reviewers only see that their review was not published.'
        }
        confirmLabel={bulk === 'approve' ? 'Approve & Publish' : 'Reject'}
        isDangerous={bulk === 'reject'}
        isLoading={bulkModeration.isPending}
      />
    </div>
  );
}

export function ReviewTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface" role="status" aria-label="Loading reviews">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-b-0">
          <div className="w-32 space-y-2">
            <div className="h-3.5 w-24 animate-pulse rounded bg-surface-hover" />
            <div className="h-3 w-32 animate-pulse rounded bg-surface-hover" />
          </div>
          <div className="h-3.5 w-20 animate-pulse rounded bg-surface-hover" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-full animate-pulse rounded bg-surface-hover" />
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-hover" />
          </div>
          <div className="hidden h-6 w-20 animate-pulse rounded-full bg-surface-hover sm:block" />
          <div className="hidden h-6 w-16 animate-pulse rounded-full bg-surface-hover sm:block" />
        </div>
      ))}
    </div>
  );
}
