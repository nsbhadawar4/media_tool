'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ChevronLeft, ChevronRight, MessageSquareQuote, Quote, Star } from 'lucide-react';
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
      {/* Summary above the cards, not beside them: the carousel then gets the full width, so it
          shows 3 cards on desktop, 2 on tablet and 1 on a phone (see .rv-card-slot). */}
      <div className="flex flex-col gap-6">
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

/**
 * The section's frame, on the home page's shared emerald panel (it follows the theme): the heading
 * on the left, a quote bubble with a star on the right, and the content below.
 */
function PublicShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby="public-reviews-title" className={cn('w-full', className)}>
      <div className="mk-panel relative overflow-hidden rounded-[2rem] px-5 py-9 sm:px-10 sm:py-11 lg:px-12">
        <ReviewsArt className="pointer-events-none absolute right-6 top-6 hidden h-44 w-56 lg:right-14 lg:top-8 lg:block lg:h-56 lg:w-72" />
        <div className="relative max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent-2/40 bg-accent/15 px-3.5 py-1.5 text-sm font-bold uppercase tracking-wide text-foreground">
            <Star aria-hidden className="h-4 w-4 fill-accent-2 text-accent-2" /> Reviews
          </p>
          <h2 id="public-reviews-title" className="mt-4 text-balance text-[32px] font-extrabold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-[44px]">
            What Our <span className="text-accent-2">Users Say</span>
          </h2>
          <p className="mt-3 text-[15px] text-foreground-soft sm:text-[17px]">Real feedback from people using Media Tool — approved reviews only.</p>
        </div>
        <div className="relative mt-8">{children}</div>
      </div>
    </section>
  );
}

/** A laurel branch (one side of the wreath round the average); `flip` mirrors it for the right. */
function Laurel({ flip = false }: { flip?: boolean }) {
  const leaves = [0, 1, 2, 3, 4, 5];
  return (
    <svg aria-hidden viewBox="0 0 40 110" className={cn('h-24 w-9 shrink-0 text-accent-2', flip && '-scale-x-100')} fill="currentColor">
      <path d="M32 106 C 10 90, 6 50, 22 6" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {leaves.map((i) => {
        const y = 96 - i * 16;
        const x = 26 - Math.sin((i / 5) * Math.PI) * 14 + i * 1.2;
        return (
          <g key={i}>
            <ellipse cx={x - 7} cy={y - 4} rx="7" ry="3.4" transform={`rotate(-35 ${x - 7} ${y - 4})`} />
            <ellipse cx={x + 6} cy={y - 7} rx="6.5" ry="3.2" transform={`rotate(-70 ${x + 6} ${y - 7})`} />
          </g>
        );
      })}
    </svg>
  );
}

/** A glossy quote bubble with a star on its corner, on an orbit ring (decorative). */
function ReviewsArt({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 300 230" className={className} fill="none">
      <defs>
        <linearGradient id="rv-bubble" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--accent-2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--accent)' }} />
        </linearGradient>
        <linearGradient id="rv-star" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde047" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {/* Orbit, behind and in front of the bubble */}
      <ellipse cx="150" cy="168" rx="128" ry="34" style={{ stroke: 'var(--accent-2)' }} strokeWidth="3" opacity="0.35" />
      {/* Bubble */}
      <path d="M86 40 Q86 22 104 22 L206 22 Q224 22 224 40 L224 132 Q224 150 206 150 L132 150 L100 182 L106 150 L104 150 Q86 150 86 132 Z" fill="url(#rv-bubble)" />
      <path d="M96 34 Q96 30 104 30 L196 30" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="5" strokeLinecap="round" />
      {/* The quote marks */}
      <path d="M122 74 Q122 62 136 60 L136 70 Q130 72 130 80 L140 80 L140 102 L120 102 Z M160 74 Q160 62 174 60 L174 70 Q168 72 168 80 L178 80 L178 102 L158 102 Z" fill="#ffffff" />
      {/* Star */}
      <path d="M232 6 L242 28 L266 30 L248 46 L254 70 L232 58 L210 70 L216 46 L198 30 L222 28 Z" fill="url(#rv-star)" stroke="#fef3c7" strokeWidth="2" strokeLinejoin="round" />
      <path d="M150 202 C 230 200, 278 186, 278 168" style={{ stroke: 'var(--accent-2)' }} strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

function RatingSummary({ stats }: { stats: PublicReviewStats }) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10 lg:max-w-3xl">
      <div className="flex shrink-0 items-center justify-center gap-1 rounded-3xl border border-border-strong bg-surface-elevated/60 px-5 py-4 shadow-[var(--shadow-card)]">
        <Laurel />
        <div className="flex flex-col items-center text-center">
          <span className="text-5xl font-extrabold tabular-nums tracking-tight text-foreground">{stats.averageRating.toFixed(1)}</span>
          <StarDisplay value={stats.averageRating} size="md" className="mt-1" />
          <p className="mt-2 text-sm text-foreground-soft">
            Average from
            <br />
            <span className="font-semibold text-foreground">{stats.total.toLocaleString('en-IN')}</span> {stats.total === 1 ? 'review' : 'reviews'}
          </p>
        </div>
        <Laurel flip />
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5 sm:border-l sm:border-border-strong sm:pl-10" aria-label="Rating distribution">
        {([5, 4, 3, 2, 1] as const).map((star) => {
          const count = stats.distribution[String(star) as '1'] ?? 0;
          const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
          return (
            <li key={star} className="flex items-center gap-3 text-sm" aria-label={`${star} stars: ${count} (${pct}%)`}>
              <span className="w-3 text-right font-semibold tabular-nums text-foreground">{star}</span>
              <Star aria-hidden className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-border">
                {/* At least a sliver, so an empty row still reads as a bar. */}
                <span className="block h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-700" style={{ width: `${Math.max(pct, 2)}%` }} />
              </span>
              <span className="w-10 text-right font-medium tabular-nums text-foreground-soft">{pct}%</span>
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
    <article className="rv-card anim-rise-scale flex h-full flex-col gap-4 rounded-3xl border border-border-strong bg-surface-elevated/80 p-5 shadow-card">
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
