'use client';

import { Suspense, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useContentCatalog } from '@/lib/content/useContentCatalog';
import { progressApi } from '@/lib/api/courses';
import { ClassSubjectPicker, type PickerClass } from './ClassSubjectPicker';
import { ThisMonthLearning } from './ThisMonthLearning';

const TILE_SKELETON = (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-busy="true" aria-label="Loading classes">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="h-[4.5rem] animate-pulse rounded-2xl border border-border bg-surface-hover" />
    ))}
  </div>
);

/**
 * The signed-in app's class-first picker (Dashboard → My Classes, /courses): the published classes
 * from the live catalog, each with the learner's own progress in it, then only the chosen class's
 * subjects. Never the code's default classes — it waits for the server's.
 */
export function LearnClassPicker({ idPrefix = 'learn' }: { idPrefix?: string }) {
  const catalog = useContentCatalog();
  const learnProgress = useQuery({ queryKey: ['progress', 'classes'], queryFn: async () => (await progressApi.classes()).data, staleTime: 30_000, retry: false });
  const progress = useMemo(() => new Map((learnProgress.data ?? []).map((p) => [p.slug, p.percent])), [learnProgress.data]);
  const classes = useMemo<PickerClass[]>(() => catalog.classViews.map((c) => ({ ...c, subjects: catalog.subjectsFor(c.level).length })), [catalog]);

  if (!catalog.fromServer && !catalog.settled) return TILE_SKELETON;
  if (!catalog.fromServer) {
    return (
      <div className="rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
        <p className="font-semibold text-foreground">Unable to load classes</p>
        <p className="mt-1 text-sm text-muted">Please check your connection and try again.</p>
        <button type="button" onClick={catalog.refetch} className="btn-primary mt-4 inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-accent-foreground">
          <RefreshCw aria-hidden className="h-4 w-4" />
          Try Again
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {/* This academic month: where to continue, progress per subject, recent courses — from the learner's saved progress. */}
      <ThisMonthLearning />
      <Suspense fallback={TILE_SKELETON}>
        <ClassSubjectPicker classes={classes} kidGamesOn={catalog.isSectionOn('kid-games')} progress={progress} idPrefix={idPrefix} />
      </Suspense>
    </div>
  );
}
