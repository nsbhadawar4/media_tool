'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, History } from 'lucide-react';
import { progressApi } from '@/lib/api/courses';
import { classVars } from '@/components/kid-games/cards/ClassCourseCard';
import { ContinueLearningCard } from '@/components/courses/ContinueLearningCard';
import { monthName, scheduleLabel, scheduleOfChapter } from '@/lib/content/academicCalendar';
import { classPath, lessonPath, subjectPath } from '@/lib/content/learnPaths';

/**
 * The learner's dashboard section: the academic year and month, where to continue, how far they are in each
 * subject this month, and the chapters they worked on last. Every number is counted by the server from the
 * lessons they completed — nothing here is typed in. Shows nothing until there is something to learn (and
 * nothing at all for a visitor: the endpoint needs the signed-in user, so it simply has no data).
 */
export function ThisMonthLearning() {
  const query = useQuery({ queryKey: ['progress', 'overview'], queryFn: async () => (await progressApi.overview()).data, staleTime: 5_000, retry: false });
  const data = query.data;
  if (query.isLoading) return <div aria-busy="true" aria-label="Loading your learning" className="h-40 animate-pulse rounded-3xl border border-border bg-surface-hover" />;
  if (!data || (data.subjects.length === 0 && !data.continue)) return null;

  const month = data.scope === 'month';
  const progress = month ? data.monthProgress : { lessons: data.subjects.reduce((n, s) => n + s.lessons, 0), completed: data.subjects.reduce((n, s) => n + s.completed, 0), percent: 0 };
  const percent = month ? progress.percent : progress.lessons ? Math.round((progress.completed / progress.lessons) * 100) : 0;

  return (
    <section aria-labelledby="this-month-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            <CalendarDays aria-hidden className="h-3.5 w-3.5 text-accent" />
            {data.academicYear}
          </p>
          <h2 id="this-month-title" className="text-xl font-semibold tracking-tight text-foreground">
            {month ? monthName(data.month) : 'Your learning'}
          </h2>
        </div>
        {progress.lessons > 0 && (
          <div className="w-full sm:w-64">
            <div className="mb-1 flex items-baseline justify-between text-xs font-semibold text-foreground-soft">
              <span>{month ? `${monthName(data.month)} progress` : 'Overall progress'}</span>
              <span className="tabular-nums">
                {progress.completed} of {progress.lessons} lessons · {percent}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${percent}% of ${month ? monthName(data.month) : 'your'} lessons done`}>
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(percent, progress.completed > 0 ? 4 : 0)}%` }} />
            </div>
          </div>
        )}
      </div>

      {data.continue && <ContinueLearningCard next={data.continue} />}

      {data.subjects.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={month ? `Subjects in ${monthName(data.month)}` : 'Your subjects'}>
          {data.subjects.map((s) => {
            const level = Number(/^class-(\d+)$/.exec(s.class.slug)?.[1]) || 1;
            const when = s.academicYear ? { year: s.academicYear, month: s.month } : null;
            const stop = s.continue;
            return (
              <li key={`${s.class.slug}-${s.subject.key}`} style={classVars(level)}>
                <Link
                  href={stop && s.completed > 0 ? lessonPath(stop.class.slug, stop.subject.key, stop.chapter.slug, stop.lesson) : subjectPath(s.class.slug, s.subject.key, when)}
                  className="group flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-(--kg) hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-foreground">{s.subject.title}</span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-foreground-soft">{s.percent}%</span>
                  </span>
                  <span className="truncate text-xs text-muted">
                    {s.class.title} · {s.completed} of {s.lessons} lessons
                  </span>
                  <span role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.percent} aria-label={`${s.subject.title}: ${s.percent}% complete`} className="block h-2 overflow-hidden rounded-full bg-surface-hover">
                    <span className="block h-full rounded-full bg-(--kg)" style={{ width: `${Math.max(s.percent, s.completed > 0 ? 4 : 0)}%` }} />
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[color-mix(in_srgb,var(--kg)_70%,var(--foreground))]">
                    {s.completed >= s.lessons && s.lessons > 0 ? 'Review' : s.completed > 0 ? 'Continue Learning' : 'Start Learning'}
                    <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {data.recent.length > 0 && (
        <div>
          <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-muted">
            <History aria-hidden className="h-3.5 w-3.5" />
            Recent courses
          </h3>
          <ul className="flex flex-wrap gap-2">
            {data.recent.map((r) => {
              const when = scheduleOfChapter(r);
              return (
                <li key={`${r.class.slug}-${r.subject.key}-${r.chapter.slug}`}>
                  <Link
                    href={r.nextLesson ? lessonPath(r.class.slug, r.subject.key, r.chapter.slug, r.nextLesson) : classPath(r.class.slug, when)}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-foreground-soft transition hover:border-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <span className="truncate font-medium text-foreground">{r.chapter.title}</span>
                    <span className="shrink-0 tabular-nums">
                      {r.subject.title} · {r.percent}%{when ? ` · ${scheduleLabel(when)}` : ''}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
