'use client';

import { useContentCatalog } from '@/lib/content/useContentCatalog';
import { ClassCourseCard } from './ClassCourseCard';

/**
 * The class cards exactly as visitors and users get them — the same catalog, the same shared card
 * — for the admin panel (dashboard and Classes page). A picture of what is live: nothing in it can
 * be clicked, and it changes nothing. After an administrator saves a class, the catalog query is
 * refreshed and this follows.
 */
export function ClassCardsPreview() {
  const catalog = useContentCatalog();
  if (catalog.classViews.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">No class is visible to users right now.</p>;
  }
  return (
    <div inert className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      {catalog.classViews.map((view, i) => {
        const subjects = catalog.subjectsFor(view.level).length;
        const games = catalog.listedGames(view.level).length;
        return (
          <ClassCourseCard
            key={view.key}
            level={view.level}
            builtIn={view.isCode}
            title={view.title}
            description={view.description || undefined}
            image={view.isCode ? undefined : view.thumbnailUrl}
            facts={[
              ...(subjects ? [{ label: `${subjects} ${subjects === 1 ? 'subject' : 'subjects'}` }] : []),
              ...(games ? [{ label: `${games} ${games === 1 ? 'game' : 'games'}` }] : []),
            ]}
            cta="Start Learning"
            index={i}
          />
        );
      })}
    </div>
  );
}
