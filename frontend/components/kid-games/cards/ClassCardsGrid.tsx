'use client';

import { GraduationCap, RefreshCw } from 'lucide-react';
import { useContentCatalog } from '@/lib/content/useContentCatalog';
import { summarise, useKidProgress } from '@/lib/kid-games/progress';
import type { ClassLevel } from '@/lib/kid-games/types';
import { ClassCard } from './KidCards';
import { GenericClassCard } from './GenericCards';

/**
 * Every class a signed-in user can open, as the shared class cards with their own progress — the
 * Kid Games hub and the dashboard's "Learn by Class" block both render this, so the two never
 * differ. Classes, titles and order come from the catalog administrators manage.
 */
export function ClassCardsGrid() {
  const progress = useKidProgress();
  const catalog = useContentCatalog();
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
          <GenericClassCard key={view.key} view={view} index={i} subjects={catalog.subjectsFor(view.level).length} />
        ),
      )}
    </div>
  );
}
