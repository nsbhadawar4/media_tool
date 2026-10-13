'use client';

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
