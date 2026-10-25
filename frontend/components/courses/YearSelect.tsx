'use client';

import { useRouter } from 'next/navigation';
import { useId, useTransition } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { UNSCHEDULED, type Schedule } from '@/lib/content/academicCalendar';
import { classPath } from '@/lib/content/learnPaths';

/**
 * The academic year selector. Choosing a year goes to the class's address for that year (the page then
 * lands on a month that has content), so the year is in the URL like everything else and the back button
 * returns to the previous choice.
 */
export function YearSelect({ classKey, years, value, hasAnytime }: { classKey: string; years: string[]; value: string; hasAnytime: boolean }) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const go = (year: string) => start(() => router.push(classPath(classKey, { year, month: null } satisfies Schedule)));
  return (
    // A plain GET form too: without JavaScript (or before it has loaded) the selector still works, with a Go button.
    <form action={classPath(classKey)} method="get" className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
        Academic year
      </label>
      <div className="relative">
        <CalendarDays aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--kg)" />
        <select
          id={id}
          name="year"
          value={value}
          onChange={(e) => go(e.target.value)}
          className="h-12 w-full min-w-44 appearance-none rounded-2xl border-2 border-border bg-surface pl-10 pr-10 text-base font-bold text-foreground shadow-card transition hover:border-(--kg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
          {hasAnytime && <option value={UNSCHEDULED}>Anytime lessons</option>}
        </select>
        {pending ? <Loader2 aria-hidden className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" /> : <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted">▾</span>}
      </div>
      <noscript>
        <button type="submit" className="btn-primary inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-accent-foreground">
          Go
        </button>
      </noscript>
    </form>
  );
}
