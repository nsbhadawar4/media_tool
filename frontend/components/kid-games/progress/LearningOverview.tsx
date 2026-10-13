'use client';

import { BookOpenCheck, CalendarDays, GraduationCap, Trophy } from 'lucide-react';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { useContentCatalog } from '@/lib/content/useContentCatalog';
import { summarise, useKidProgress, weekStrip } from '@/lib/kid-games/progress';
import type { ClassLevel } from '@/lib/kid-games/types';

/**
 * The dashboard's learning overview (the Emerald Mint reference's top band): four figures, this
 * week's activity as bars and completed games per class as a donut. Every number is the user's
 * own saved Kid Games progress or the catalog — nothing is estimated or filled in.
 */
export function LearningOverview() {
  const progress = useKidProgress();
  const catalog = useContentCatalog();
  const classes = catalog.classViews.filter((c) => c.isCode);
  const week = weekStrip(progress).map((d) => ({ ...d, games: Object.values(progress.days[d.key] ?? {}).reduce((n, v) => n + (v || 0), 0) }));
  const thisWeek = week.reduce((n, d) => n + d.games, 0);
  const overall = summarise(progress);
  const perClass = classes.map((c) => ({ level: c.level, title: c.title, completed: summarise(progress, c.level as ClassLevel).completed }));

  return (
    <section aria-labelledby="learning-overview-title" className="flex flex-col gap-4">
      <h2 id="learning-overview-title" className="sr-only">
        Learning overview
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {!progress.ready && !progress.isError ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard index={0} icon={GraduationCap} label="Classes" value={String(catalog.classViews.length)} hint="Open to you" />
            <StatCard index={1} icon={BookOpenCheck} label="Courses" value={String(catalog.coursesFor().length)} hint="Lessons to follow" color="#06b6d4" />
            <StatCard index={2} icon={Trophy} label="Games completed" value={`${overall.completed}`} hint={`of ${overall.total} learning games`} color="#f59e0b" />
            <StatCard index={3} icon={CalendarDays} label="This week" value={`${thisWeek}`} hint={thisWeek === 1 ? 'game played' : 'games played'} color="#34d399" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <WeekChart days={week} />
        <ClassDonut parts={perClass} total={overall.completed} />
      </div>
    </section>
  );
}

/** Games played on each day of this week, as emerald bars. */
function WeekChart({ days }: { days: Array<{ label: string; games: number; isToday: boolean; isFuture: boolean }> }) {
  const max = Math.max(1, ...days.map((d) => d.games));
  const total = days.reduce((n, d) => n + d.games, 0);
  return (
    <div className="surface-card rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight text-foreground">Learning progress</h3>
        <span className="text-xs text-muted">Games played this week</span>
      </div>
      {/* The bars are a picture; the same figures are listed for screen readers. */}
      <ol className="sr-only">
        {days.map((d) => (
          <li key={d.label}>
            {d.label}: {d.games} {d.games === 1 ? 'game' : 'games'}
          </li>
        ))}
      </ol>
      <div aria-hidden className="mt-5 flex h-44 items-end gap-2 sm:gap-3">
        {days.map((d, i) => (
          <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
            <span className="text-[11px] font-semibold tabular-nums text-foreground-soft">{d.games > 0 ? d.games : ''}</span>
            <div className="relative flex w-full max-w-10 flex-1 items-end overflow-hidden rounded-xl bg-surface-hover">
              <div
                className="chart-bar w-full rounded-xl bg-linear-to-t from-accent to-accent-2"
                style={{ height: `${Math.max(d.games > 0 ? 8 : 0, (d.games / max) * 100)}%`, '--i': i } as React.CSSProperties}
              />
            </div>
            <span className={d.isToday ? 'text-[11px] font-semibold text-accent' : 'text-[11px] text-subtle'}>{d.label}</span>
          </div>
        ))}
      </div>
      {total === 0 && <p className="mt-3 text-center text-xs text-muted">No games played yet this week — each one you finish shows up here.</p>}
    </div>
  );
}

/** Completed games per class, as a donut in the class colours. */
function ClassDonut({ parts, total }: { parts: Array<{ level: number; title: string; completed: number }>; total: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  // Each segment starts where the ones before it end.
  const filled = parts.filter((p) => p.completed > 0);
  const lengths = filled.map((p) => (p.completed / Math.max(1, total)) * C);
  const segments = filled.map((p, i) => ({ ...p, length: lengths[i]!, offset: lengths.slice(0, i).reduce((a, b) => a + b, 0) }));
  return (
    <div className="surface-card rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight text-foreground">Class-wise overview</h3>
        <span className="text-xs text-muted">Completed games</span>
      </div>
      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:justify-around">
        <div className="relative h-40 w-40 shrink-0">
          <svg viewBox="0 0 140 140" className="chart-donut h-full w-full -rotate-90" aria-hidden>
            <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-hover)" strokeWidth="18" />
            {segments.map((s) => (
              <circle
                key={s.level}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={`var(--kid-class-${((s.level - 1) % 5) + 1})`}
                strokeWidth="18"
                strokeDasharray={`${s.length} ${C - s.length}`}
                strokeDashoffset={-s.offset}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums text-foreground">{total}</span>
            <span className="text-[11px] text-muted">completed</span>
          </div>
        </div>
        <ul className="grid w-full max-w-56 gap-2 text-sm">
          {parts.map((p) => (
            <li key={p.level} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: `var(--kid-class-${((p.level - 1) % 5) + 1})` }} />
                <span className="truncate text-foreground-soft">{p.title}</span>
              </span>
              <span className="font-semibold tabular-nums text-foreground">{p.completed}</span>
            </li>
          ))}
        </ul>
      </div>
      {total === 0 && <p className="mt-3 text-center text-xs text-muted">Complete a game in any class to fill the ring.</p>}
    </div>
  );
}
