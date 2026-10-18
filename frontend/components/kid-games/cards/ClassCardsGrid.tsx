'use client';

import { GraduationCap, RefreshCw } from 'lucide-react';
import { useContentCatalog } from '@/lib/content/useContentCatalog';
import { summarise, useKidProgress } from '@/lib/kid-games/progress';
import type { ClassLevel } from '@/lib/kid-games/types';
import { ClassCard } from './KidCards';
import { GenericClassCard } from './GenericCards';
import { ClassCourseCard } from './ClassCourseCard';
import { classPath } from '@/lib/content/learnPaths';
import { useQuery } from '@tanstack/react-query';
import { progressApi } from '@/lib/api/courses';

/**
 * Every class a signed-in user can open, as the shared class cards — the same classes, titles and
 * order everywhere, from the catalog administrators manage in Manage Courses.
 *  - learn (the dashboard's "My Classes" and /courses): each card opens the class's course pages
 *    (/classes/class-N), whatever the Kid Games switch says;
 *  - play (the Kid Games hub): each card opens the class's games, with the child's game progress.
 */
export function ClassCardsGrid({ purpose = 'learn' }: { purpose?: 'learn' | 'play' }) {
  const progress = useKidProgress();
  const catalog = useContentCatalog();
  // Course progress (lessons completed per class) for the learning cards — the signed-in app only.
  const learnProgress = useQuery({ queryKey: ['progress', 'classes'], queryFn: async () => (await progressApi.classes()).data, enabled: purpose === 'learn', staleTime: 30_000, retry: false });
  // Only the managed catalog lists classes — never the code's own defaults, even for a moment.
  if (!catalog.fromServer && !catalog.settled) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading classes">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-card">
            <div className="aspect-[4/3] animate-pulse bg-surface-hover" />
            <div className="space-y-3 p-6">
              <div className="h-6 w-1/2 animate-pulse rounded-lg bg-surface-hover" />
              <div className="h-4 w-3/4 animate-pulse rounded-lg bg-surface-hover" />
              <div className="h-11 w-36 animate-pulse rounded-xl bg-surface-hover" />
            </div>
          </div>
        ))}
      </div>
    );
  }
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
  if (catalog.classViews.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border px-6 py-10 text-center">
        <GraduationCap aria-hidden className="h-8 w-8 text-muted" />
        <p className="font-semibold text-foreground">No classes available</p>
        <p className="text-sm text-muted">No visible classes are available right now.</p>
      </div>
    );
  }
  if (purpose === 'learn') {
    const percent = (key: string) => learnProgress.data?.find((p) => p.slug === key);
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {catalog.classViews.map((view, i) => {
          const subjects = catalog.subjectsFor(view.level);
          const chapters = catalog.coursesFor(view.level).length;
          return (
            <ClassCourseCard
              key={view.key}
              level={view.level}
              builtIn={view.isCode}
              title={view.title}
              subtitle={view.subtitle || undefined}
              description={view.description || undefined}
              image={view.thumbnailUrl}
              marks={subjects.map((s) => s.glyph ?? '').filter(Boolean)}
              href={classPath(view.key)}
              linkLabel={`Explore ${view.title}`}
              facts={[
                ...(subjects.length ? [{ label: `${subjects.length} ${subjects.length === 1 ? 'subject' : 'subjects'}` }] : []),
                ...(chapters ? [{ label: `${chapters} ${chapters === 1 ? 'chapter' : 'chapters'}` }] : []),
              ]}
              progress={percent(view.key)?.lessons ? { percent: percent(view.key)!.percent, label: `${percent(view.key)!.completed} of ${percent(view.key)!.lessons} lessons completed` } : null}
              cta={percent(view.key)?.completed ? 'Continue Learning' : 'Start Learning'}
              index={i}
            />
          );
        })}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      {catalog.classViews.map((view, i) =>
        view.isCode ? (
          <ClassCard
            key={view.key}
            level={view.level as ClassLevel}
            summary={summarise(progress, view.level as ClassLevel)}
            index={i}
            title={view.title}
            subtitle={view.subtitle}
            image={view.thumbnailUrl}
            tagline={view.description}
            subjects={catalog.subjectsFor(view.level).length}
          />
        ) : (
          <GenericClassCard key={view.key} view={view} index={i} subjects={catalog.subjectsFor(view.level).length} marks={catalog.subjectsFor(view.level).map((s) => s.glyph ?? "").filter(Boolean)} />
        ),
      )}
    </div>
  );
}
