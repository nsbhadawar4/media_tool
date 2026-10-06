'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquareHeart, PencilLine, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { InlineErrorState } from '@/components/ui/ErrorState';
import { REVIEW_CATEGORY_LABEL, reviewsApi } from '@/lib/api/reviews';
import { formatDate } from '@/utils/format';
import { MY_REVIEW_KEY, ReviewFormModal } from './ReviewFormModal';
import { OWN_STATUS_MESSAGE, ReviewStatusBadge, visibilityOf } from './ReviewStatusBadge';
import { StarDisplay } from './ReviewStars';

/**
 * "Review Media Tool" on the profile page: the one place a user gives feedback. Shows their review
 * and where moderation stands, or invites them to write one.
 */
export function MyReviewCard() {
  const [open, setOpen] = useState(false);
  // Re-keyed per opening, so the form starts from the saved review every time.
  const [formKey, setFormKey] = useState(0);
  const query = useQuery({ queryKey: MY_REVIEW_KEY, queryFn: async () => (await reviewsApi.mine()).data });
  const review = query.data ?? null;

  const openForm = () => {
    setFormKey((k) => k + 1);
    setOpen(true);
  };

  return (
    <section aria-labelledby="my-review" className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(60%_100%_at_100%_0%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_70%)]" />
      <div className="relative flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <MessageSquareHeart aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="my-review" className="text-base font-semibold tracking-tight text-foreground">
              Review Media Tool
            </h2>
            <p className="text-sm text-muted">Tell us what you think. Approved reviews may be shown to other people.</p>
          </div>
        </div>

        {query.isError ? (
          <InlineErrorState error={query.error} onRetry={() => query.refetch()} subject="your review" />
        ) : query.isLoading ? (
          <div className="space-y-2.5" role="status" aria-label="Loading your review">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ) : review ? (
          <div className="rv-enter flex flex-col gap-3 rounded-2xl border border-border bg-surface-elevated/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StarDisplay value={review.rating} />
              <ReviewStatusBadge status={review.status} isPublic={review.isPublic} />
            </div>
            <p className="whitespace-pre-line wrap-break-word text-sm leading-relaxed text-foreground-soft">{review.reviewText}</p>
            <p className="text-xs text-muted">
              {REVIEW_CATEGORY_LABEL[review.category]} · Updated {formatDate(review.updatedAt)}
            </p>
            <p className="text-sm text-foreground-soft">{OWN_STATUS_MESSAGE[visibilityOf(review.status, review.isPublic)]}</p>
            <div>
              <Button variant="secondary" size="sm" onClick={openForm}>
                <PencilLine className="h-4 w-4" />
                Edit Review
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border-strong p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted">
              <span className="flex" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className="h-4 w-4 text-border-strong" />
                ))}
              </span>
              You haven&apos;t submitted a review yet.
            </div>
            <Button onClick={openForm}>
              <MessageSquareHeart className="h-4 w-4" />
              Give Feedback
            </Button>
          </div>
        )}
      </div>

      {open && <ReviewFormModal key={formKey} isOpen={open} onClose={() => setOpen(false)} existing={review} />}
    </section>
  );
}
