'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ChevronLeft, ChevronRight, MessageSquareQuote, Quote } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatDateShort } from '@/utils/format';
import { REVIEW_CATEGORY_LABEL, reviewsApi, type PublicReview, type PublicReviewStats } from '@/lib/api/reviews';
import { StarDisplay } from './ReviewStars';

/**
 * "What Our Users Say": approved, published reviews only (the server decides which — this
 * component just shows what /api/reviews/public returns). Nothing is ever invented: with no
 * reviews the section hides itself or, where it is the page's subject, says so.
 */
export function PublicReviews({ hideWhenEmpty = false, className }: { hideWhenEmpty?: boolean; className?: string }) {
  const [sort, setSort] = useState<'newest' | 'rating'>('newest');
  const query = useQuery({
    queryKey: ['reviews', 'public', sort],
    queryFn: async () => (await reviewsApi.publicList({ sort, limit: 12 })).data,
    staleTime: 60_000,
  });

  if (query.isError) return hideWhenEmpty ? null : <PublicShell className={className}>{<p className="text-center text-sm text-muted">Reviews could not be loaded right now.</p>}</PublicShell>;
  // Where the section may hide, show nothing until there is something to show (no skeleton that then vanishes).
  if (query.isLoading) return hideWhenEmpty ? null : <PublicShell className={className}>{<PublicReviewsSkeleton />}</PublicShell>;

  const reviews = query.data?.reviews ?? [];
  const stats = query.data?.stats;
  if (reviews.length === 0 || !stats) {
    if (hideWhenEmpty) return null;
    return (
      <PublicShell className={className}>
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border-strong bg-surface/50 px-6 py-12 text-center">
          <MessageSquareQuote aria-hidden className="mb-3 h-8 w-8 text-accent" />
          <p className="font-semibold text-foreground">No published reviews yet.</p>
          <p className="mt-1 text-sm text-muted">Be the first to share your experience.</p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell className={className}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:items-start">
        <RatingSummary stats={stats} />
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-end gap-1" role="group" aria-label="Sort reviews">
            {(['newest', 'rating'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={sort === value}
                onClick={() => setSort(value)}
                className={cn(
                  'min-h-9 rounded-lg px-3 text-xs font-semibold transition',
                  sort === value ? 'bg-surface-elevated text-foreground shadow-card' : 'text-muted hover:text-foreground',
                )}
              >
                {value === 'newest' ? 'Newest' : 'Highest rated'}
              </button>
            ))}
          </div>
          <ReviewCarousel reviews={reviews} />
        </div>
      </div>
    </PublicShell>
  );
}

function PublicShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby="public-reviews-title" className={cn('w-full', className)}>
      <div className="mb-6 text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent-2">Reviews</p>
        <h2 id="public-reviews-title" className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          What Our Users Say
        </h2>
        <p className="mt-1.5 text-sm text-muted sm:text-base">Real feedback from people using Media Tool.</p>
      </div>
      {children}
    </section>
  );
}

function RatingSummary({ stats }: { stats: PublicReviewStats }) {
  return (
    <div className="gradient-border rounded-3xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-end gap-3">
        <span className="text-5xl font-semibold tabular-nums tracking-tight text-foreground">{stats.averageRating.toFixed(1)}</span>
        <span className="mb-1.5 text-sm text-muted">out of 5</span>
      </div>
      <StarDisplay value={stats.averageRating} size="md" className="mt-2" />
      <p className="mt-1 text-xs text-muted">
        Based on {stats.total} published {stats.total === 1 ? 'review' : 'reviews'}
      </p>
      <ul className="mt-4 space-y-1.5" aria-label="Rating distribution">
        {([5, 4, 3, 2, 1] as const).map((star) => {
          const count = stats.distribution[String(star) as '1'] ?? 0;
          const pct = stats.total ? (count / stats.total) * 100 : 0;
          return (
            <li key={star} className="flex items-center gap-2 text-xs" aria-label={`${star} stars: ${count}`}>
              <span className="w-3 text-right tabular-nums text-muted">{star}</span>
              <span aria-hidden className="text-amber-400">★</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
                <span className="block h-full rounded-full bg-amber-400 transition-[width] duration-700" style={{ width: `${pct}%` }} />
              </span>
              <span className="w-6 text-right tabular-nums text-muted">{count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A horizontal scroll-snap track: 1 card per view on phones, 2 on tablets, 3 on desktops. It never
 * moves by itself; the arrows (or a swipe) move it one card at a time.
 */
function ReviewCarousel({ reviews }: { reviews: PublicReview[] }) {
  const track = useRef<HTMLUListElement>(null);
  const scrollBy = (direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector('li');
    el.scrollBy({ left: direction * ((card?.clientWidth ?? el.clientWidth) + 16), behavior: 'smooth' });
  };

  return (
    <div className="relative">
      <ul ref={track} className="rv-track app-no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2" aria-label="Customer reviews">
        {reviews.map((review, i) => (
          <li key={review.id} className="rv-card-slot snap-start" style={{ ['--i' as string]: i }}>
            <ReviewCard review={review} />
          </li>
        ))}
      </ul>
      {reviews.length > 1 && (
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Previous reviews"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-elevated text-foreground transition hover:border-border-strong hover:bg-surface-hover active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Next reviews"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-elevated text-foreground transition hover:border-border-strong hover:bg-surface-hover active:scale-95"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** One testimonial. The text is rendered as text: whatever a reviewer typed can never become markup. */
export function ReviewCard({ review }: { review: PublicReview }) {
  return (
    <article className="rv-card anim-rise-scale flex h-full flex-col gap-4 rounded-3xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <StarDisplay value={review.rating} />
        <Quote aria-hidden className="h-6 w-6 text-accent/40" />
      </div>
      <p className="line-clamp-6 flex-1 whitespace-pre-line wrap-break-word text-[15px] leading-relaxed text-foreground-soft">“{review.reviewText}”</p>
      <div className="flex items-end justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{review.displayName}</p>
          {review.verified && (
            <p className="flex items-center gap-1 text-xs font-medium text-emerald-500">
              <BadgeCheck aria-hidden className="h-3.5 w-3.5" />
              Verified User
            </p>
          )}
        </div>
        <div className="shrink-0 text-right text-xs text-muted">
          <p>{formatDateShort(review.approvedAt ?? review.createdAt)}</p>
          <p>{REVIEW_CATEGORY_LABEL[review.category]}</p>
        </div>
      </div>
    </article>
  );
}

export function ReviewCardSkeleton() {
  return (
    <div className="flex h-56 flex-col gap-3 rounded-3xl border border-border bg-surface p-5" aria-hidden>
      <div className="h-4 w-24 animate-pulse rounded bg-surface-hover" />
      <div className="h-3.5 w-full animate-pulse rounded bg-surface-hover" />
      <div className="h-3.5 w-5/6 animate-pulse rounded bg-surface-hover" />
      <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-hover" />
      <div className="mt-auto h-4 w-32 animate-pulse rounded bg-surface-hover" />
    </div>
  );
}

function PublicReviewsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]" role="status" aria-label="Loading reviews">
      <div className="h-56 animate-pulse rounded-3xl border border-border bg-surface" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ReviewCardSkeleton />
        <div className="hidden md:block">
          <ReviewCardSkeleton />
        </div>
        <div className="hidden xl:block">
          <ReviewCardSkeleton />
        </div>
      </div>
    </div>
  );
}
