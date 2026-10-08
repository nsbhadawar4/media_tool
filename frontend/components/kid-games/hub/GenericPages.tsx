'use client';

import { BookOpen, BookOpenCheck, GraduationCap } from 'lucide-react';
import { useContentCatalog } from '@/lib/content/useContentCatalog';
import type { ClassView, SubjectView } from '@/lib/content/catalog';
import { useKidProgress } from '@/lib/kid-games/progress';
import { KidGameCard } from '../cards/KidCards';
import { ANY_SUBJECT_STYLE, CourseCard, GenericSubjectCard, anyClassStyle } from '../cards/GenericCards';
import { KidBackLink, KidEmptyState, KidFloatingShapes } from '../shared/KidUi';

/**
 * Pages for learning content that exists only in the database: a class or subject an
 * administrator added. They show what that content has — courses, and any games built for it —
 * in the same Kid Games look as the built-in classes and subjects.
 */

/** "Courses" for one class and subject, listed in the administrator's order. Nothing when there are none. */
export function CoursesSection({ level, subject, emptyHint }: { level: number; subject: string; emptyHint?: boolean }) {
  const catalog = useContentCatalog();
  const courses = catalog.coursesFor(level, subject);
  if (courses.length === 0) {
    return emptyHint ? (
      <KidEmptyState icon={BookOpenCheck} title="Courses are on their way" description="New lessons for this subject will appear here soon." />
    ) : null;
  }
  return (
    <section aria-labelledby={`courses-${level}-${subject}`}>
      <h2 id={`courses-${level}-${subject}`} className="mb-4 flex items-center gap-2 text-lg font-bold tracking-tight text-foreground sm:text-xl">
        <BookOpenCheck aria-hidden className="kg-text h-5 w-5" />
        Courses
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {courses.map((course, i) => (
          <CourseCard key={course.id} course={course} gameCount={catalog.gamesInCourse(course.id).length} index={i} />
        ))}
      </div>
    </section>
  );
}

function Hero({ eyebrow, title, description, icon: Icon }: { eyebrow: string; title: string; description: string; icon: typeof GraduationCap }) {
  return (
    <section className="kg-wash relative overflow-hidden rounded-4xl border border-border bg-surface p-5 shadow-card sm:p-8">
      <KidFloatingShapes />
      <div className="relative flex items-center gap-4">
        <span aria-hidden className="kg-gradient kg-bob flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white shadow-lift sm:h-20 sm:w-20">
          <Icon className="h-9 w-9 sm:h-11 sm:w-11" strokeWidth={1.75} />
        </span>
        <div>
          <p className="kg-text text-xs font-bold uppercase tracking-[0.16em]">{eyebrow}</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
          {description && <p className="text-sm text-muted sm:text-base">{description}</p>}
        </div>
      </div>
    </section>
  );
}

/** A database-only class (e.g. Class 6): its subjects, each with its courses and games. */
export function GenericClassPage({ view }: { view: ClassView }) {
  const catalog = useContentCatalog();
  const subjects = catalog.subjectsFor(view.level);
  return (
    <div style={anyClassStyle(view.level)} className="space-y-8">
      <div>
        <KidBackLink href="/kid-games" label="All classes" />
        <Hero eyebrow={view.title} title="Let's Learn & Play!" description={view.description} icon={GraduationCap} />
      </div>
      <section aria-labelledby="kg-subjects">
        <h2 id="kg-subjects" className="mb-4 flex items-center gap-2 text-lg font-bold tracking-tight text-foreground sm:text-xl">
          <BookOpen aria-hidden className="kg-text h-5 w-5" />
          Choose a subject
        </h2>
        {subjects.length === 0 ? (
          <KidEmptyState icon={BookOpen} title="Subjects coming soon" description={`Nothing has been added to ${view.title} yet.`} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
            {subjects.map((s, i) => (
              <GenericSubjectCard
                key={s.key}
                classKey={view.key}
                view={s}
                courseCount={catalog.coursesFor(view.level, s.key).length}
                gameCount={catalog.listedGames(view.level, s.key).length}
                index={i}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** A subject page for a class / subject the app has no built-in games for: courses (and any games). */
export function GenericSubjectPage({ classView, subject }: { classView: ClassView; subject: SubjectView }) {
  const catalog = useContentCatalog();
  const progress = useKidProgress();
  const games = catalog.listedGames(classView.level, subject.key);
  return (
    <div style={ANY_SUBJECT_STYLE} className="space-y-8">
      <div>
        <KidBackLink href={`/kid-games/${classView.key}`} label={`Back to ${classView.title}`} />
        <Hero eyebrow={classView.title} title={subject.title} description={subject.description} icon={BookOpen} />
      </div>
      <CoursesSection level={classView.level} subject={subject.key} emptyHint={games.length === 0} />
      {games.length > 0 && (
        <section aria-label="Games">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {games.map((game, i) => (
              <KidGameCard key={game.id} game={game} record={progress.games[game.id]} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
