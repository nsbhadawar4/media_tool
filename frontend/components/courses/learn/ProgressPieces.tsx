'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { progressApi } from '@/lib/api/courses';
import { lessonPath } from '@/lib/content/learnPaths';
import { STARS_PER_LESSON } from '@/lib/learn/lessonFlow';
import { cn } from '@/utils/cn';

/**
 * Small progress-aware pieces for the course pages. They read the learner's existing progress
 * (GET /api/progress/classes/<class>, shared by every piece through one cache key) and only show it
 * for signed-in learners; for everyone else they fall back to a plain start state.
 */
const useClassProgress = (classSlug: string, signedIn: boolean) =>
  useQuery({ queryKey: ['progress', 'class', classSlug] as const, queryFn: async () => (await progressApi.class(classSlug)).data, enabled: signedIn, retry: false, staleTime: 15_000 });

/** A subject card's footer: progress bar, stars, and "Start" or "Continue". */
export function SubjectProgress({ classSlug, subject, lessons, signedIn }: { classSlug: string; subject: string; lessons: number; signedIn: boolean }) {
  const progress = useClassProgress(classSlug, signedIn);
  const rows = progress.data?.chapters.filter((c) => c.subject === subject) ?? [];
  const done = rows.reduce((n, c) => n + c.completedLessons.length, 0);
  const started = rows.some((c) => c.completedLessons.length > 0 || c.startedLessons.length > 0);
  const percent = lessons > 0 ? Math.round((done / lessons) * 100) : 0;
  const finished = lessons > 0 && done >= lessons;
  return (
    <div className="mt-auto flex flex-col gap-3">
      {signedIn && progress.data && lessons > 0 ? (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-sm font-semibold text-foreground">
            <span>
              {done} of {lessons} lessons
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <span aria-hidden>⭐</span>
              {done * STARS_PER_LESSON} <span className="sr-only">stars</span>
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${percent}% done`}>
            <div className="kl-grow kl-badge h-full rounded-full" style={{ width: `${Math.max(percent, done > 0 ? 6 : 0)}%` }} />
          </div>
        </div>
      ) : null}
      <span className="kl-badge inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-extrabold text-white shadow-card transition group-hover:brightness-110">
        {finished ? 'Play again' : started ? 'Continue learning' : 'Start learning'}
        <ArrowRight aria-hidden className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </div>
  );
}

/** One dot per lesson, filled as the learner completes them: the chapter as a short journey. */
export function LessonDots({ classSlug, chapter, lessonCount, signedIn }: { classSlug: string; chapter: string; lessonCount: number; signedIn: boolean }) {
  const progress = useClassProgress(classSlug, signedIn);
  const done = progress.data?.chapters.find((c) => c.chapter === chapter)?.completedLessons ?? [];
  if (lessonCount < 1) return null;
  return (
    <div role="img" aria-label={signedIn ? `${done.length} of ${lessonCount} lessons done` : `${lessonCount} lessons`} className="flex flex-wrap items-center gap-2">
      {Array.from({ length: lessonCount }, (_, i) => (
        <span key={i} aria-hidden className={cn('h-4 w-4 rounded-full border-2 transition', done.includes(i + 1) ? 'kl-badge border-transparent' : 'border-(--kg) bg-surface')} />
      ))}
      {signedIn && progress.data ? (
        <span className="ml-1 text-sm font-semibold tabular-nums text-foreground-soft">
          {done.length}/{lessonCount}
        </span>
      ) : null}
    </div>
  );
}

/** "Start" at lesson 1, or "Continue" at the first lesson not yet completed. */
export function ChapterStart({ classSlug, subject, chapter, lessonCount, signedIn }: { classSlug: string; subject: string; chapter: string; lessonCount: number; signedIn: boolean }) {
  const progress = useClassProgress(classSlug, signedIn);
  if (lessonCount < 1) return null;
  const done = progress.data?.chapters.find((c) => c.chapter === chapter)?.completedLessons ?? [];
  let next = 1;
  while (next <= lessonCount && done.includes(next)) next++;
  const all = next > lessonCount;
  return (
    <Link href={lessonPath(classSlug, subject, chapter, all ? 1 : next)} className="btn-primary inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-8 text-lg font-extrabold text-accent-foreground transition active:scale-95">
      {all ? 'Play again' : done.length > 0 ? 'Continue' : 'Start learning'}
      <ArrowRight aria-hidden className="h-5 w-5" />
    </Link>
  );
}
