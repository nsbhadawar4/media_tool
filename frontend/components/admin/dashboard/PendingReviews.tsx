'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, MessageSquareDashed, MessagesSquare } from 'lucide-react';
import { adminReviewsApi, type AdminReview } from '@/lib/api/reviews';
import { Avatar } from '@/components/ui/Avatar';
import { InlineErrorState } from '@/components/ui/ErrorState';
import { StarDisplay } from '@/components/reviews/ReviewStars';
import {
  ModerationDialog,
  ReviewDetailModal,
  useModeration,
  type ModerationAction,
} from '@/components/reviews/admin/ReviewModeration';
import { formatDateShort } from '@/utils/format';
import { DashboardPanel, PanelEmpty, PanelRowsSkeleton } from './DashboardPanel';
import { ADMIN_ACTIVITY_KEY } from './RecentActivity';

const PENDING_REVIEW_COUNT = 5;

/**
 * The moderation queue's head. "View" opens the same detail modal as /admin/reviews, so a
 * review can be approved or rejected without leaving the dashboard; the shared moderation hook
 * refreshes every ['admin', 'reviews', …] query, including this list and the stat cards.
 */
export function PendingReviews({ total, className }: { total?: number; className?: string }) {
  const queryClient = useQueryClient();
  const [viewing, setViewing] = useState<AdminReview | null>(null);
  const [pending, setPending] = useState<{ action: ModerationAction; review: AdminReview } | null>(null);

  const params = { status: 'pending' as const, sort: 'newest' as const, page: 1, limit: PENDING_REVIEW_COUNT };
  const query = useQuery({
    queryKey: ['admin', 'reviews', 'list', params],
    queryFn: ({ signal }) => adminReviewsApi.list(params, signal),
  });
  const reviews = query.data?.data ?? [];

  const moderation = useModeration(() => {
    setPending(null);
    setViewing(null);
    // An approval is logged, so the activity feed has something new to show.
    void queryClient.invalidateQueries({ queryKey: ADMIN_ACTIVITY_KEY });
  });

  return (
    <DashboardPanel
      title="Pending reviews"
      description="Waiting for moderation"
      icon={MessagesSquare}
      link={{ href: '/admin/reviews', label: 'View all reviews' }}
      badge={
        total ? (
          <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none text-warning">
            {total > 99 ? '99+' : total}
          </span>
        ) : null
      }
      className={className}
    >
      {query.isError ? (
        <InlineErrorState error={query.error} onRetry={() => query.refetch()} subject="reviews" />
      ) : query.isLoading ? (
        <PanelRowsSkeleton rows={3} />
      ) : reviews.length === 0 ? (
        <PanelEmpty icon={MessageSquareDashed} title="All caught up" description="No reviews are waiting for moderation." />
      ) : (
        <ul className="divide-y divide-border">
          {reviews.map((review) => {
            const name = review.user?.name ?? 'Deleted account';
            return (
              <li key={review.id} className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-hover/50 sm:px-5">
                <Avatar name={name} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium text-foreground">{name}</span>
                    <StarDisplay value={review.rating} size="xs" />
                    <time dateTime={review.createdAt} className="text-[11px] tabular-nums text-subtle">
                      {formatDateShort(review.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] text-foreground-soft [overflow-wrap:anywhere]">
                    “{review.reviewText}”
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewing(review)}
                  aria-label={`View review by ${name}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-soft transition hover:border-accent/40 hover:bg-accent/10 hover:text-accent"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span className="max-sm:sr-only">View</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ReviewDetailModal review={viewing} onClose={() => setViewing(null)} onAction={(action, review) => setPending({ action, review })} />
      <ModerationDialog
        pending={pending}
        onClose={() => setPending(null)}
        isLoading={moderation.isPending}
        onConfirm={(reason) => pending && moderation.mutate({ ...pending, reason })}
      />
    </DashboardPanel>
  );
}
