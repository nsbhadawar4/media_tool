'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/utils/cn';
import { RATING_LABEL } from '@/lib/api/reviews';

/** Read-only stars, e.g. on a review card. Reads as "4 out of 5 stars". */
export function StarDisplay({ value, size = 'sm', className }: { value: number; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const px = { xs: 'h-3 w-3', sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-7 w-7' }[size];
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = rounded >= n ? 'full' : rounded >= n - 0.5 ? 'half' : 'none';
        return (
          <span key={n} className="relative inline-flex">
            <Star aria-hidden className={cn(px, 'fill-transparent text-border-strong')} strokeWidth={1.75} />
            {fill !== 'none' && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: fill === 'half' ? '50%' : '100%' }}>
                <Star aria-hidden className={cn(px, 'fill-amber-400 text-amber-400')} strokeWidth={1.75} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The 1–5 star picker. It is a radio group: Tab reaches it once, arrow keys move between stars,
 * 1–5 pick directly, and each star is a 44px target. Hovering previews a rating without choosing it.
 */
export function StarRatingInput({
  value,
  onChange,
  invalid = false,
  describedBy,
}: {
  value: number;
  onChange: (value: number) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [hover, setHover] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = hover || value;

  const pick = (n: number) => {
    onChange(n);
    refs.current[n - 1]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      pick(Math.min(5, (value || 0) + 1));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      pick(Math.max(1, (value || 2) - 1));
    } else if (/^[1-5]$/.test(event.key)) {
      event.preventDefault();
      pick(Number(event.key));
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        role="radiogroup"
        aria-label="Your rating"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="flex items-center gap-1"
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const on = n <= shown;
          return (
            <button
              key={n}
              ref={(el) => {
                refs.current[n - 1] = el;
              }}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} star${n > 1 ? 's' : ''}: ${RATING_LABEL[n]}`}
              tabIndex={value ? (value === n ? 0 : -1) : n === 1 ? 0 : -1}
              onClick={() => onChange(n)}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(0)}
              className="rv-star flex h-11 w-11 items-center justify-center rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-accent/60"
              data-on={on}
            >
              <Star
                aria-hidden
                className={cn('h-8 w-8 transition-colors duration-150', on ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-border-strong')}
                strokeWidth={1.6}
              />
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className={cn('h-5 text-sm font-semibold transition-colors', shown ? 'text-amber-500' : 'text-muted')}>
        {shown ? RATING_LABEL[shown] : 'Tap a star to rate'}
      </p>
    </div>
  );
}
