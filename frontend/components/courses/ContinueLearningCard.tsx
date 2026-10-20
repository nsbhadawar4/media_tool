'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { progressApi } from '@/lib/api/courses';
import { classVars } from '@/components/kid-games/cards/ClassCourseCard';
import { lessonPath } from '@/lib/content/learnPaths';

/**
 * One click back to where the learner stopped — Class 7 · Hindi · Chapter 3 · Lesson 2 — so the
 * class and subject never have to be chosen again. Shown only when there is something to continue.
 */
export function ContinueLearningCard() {
  const query = useQuery({ queryKey: ['progress', 'continue'], queryFn: async () => (await progressApi.continue()).data, staleTime: 30_000, retry: false });
  const next = query.data;
  if (!next) return null;
  const level = Number(/^class-(\d+)$/.exec(next.class.slug)?.[1]) || 1;
  const percent = next.lessonCount ? Math.round((next.completedLessons / next.lessonCount) * 100) : 0;
  return (
    <Link
      href={lessonPath(next.class.slug, next.subject.key, next.chapter.slug, next.lesson)}
      style={classVars(level)}
      className="anim-rise group flex items-center gap-4 rounded-2xl border border-(--kg)/40 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-(--kg) hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg) sm:p-5"
    >
      <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-(--kg) to-(--kg-2) text-white shadow-card">
        <PlayCircle className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--kg)_70%,var(--foreground))]">Continue Learning</span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
          {next.class.title} · {next.subject.title}
        </span>
        <span className="block truncate text-xs text-muted">
          Chapter {next.chapter.number}: {next.chapter.title} · Lesson {next.lesson} of {next.lessonCount}
        </span>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-hover" aria-label={`${next.completedLessons} of ${next.lessonCount} lessons completed`}>
          <span className="block h-full rounded-full bg-(--kg)" style={{ width: `${percent}%` }} />
        </span>
      </span>
      <span className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-[color-mix(in_srgb,var(--kg)_70%,var(--foreground))] sm:inline-flex">
        Continue
        <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
