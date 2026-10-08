'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpenCheck, ExternalLink, Gamepad2, SearchX, Target } from 'lucide-react';
import { contentApi } from '@/lib/api/content';
import { ApiError } from '@/lib/api/client';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Badge } from '@/components/ui/Badge';
import { useContentCatalog } from '@/lib/content/useContentCatalog';
import { useKidProgress } from '@/lib/kid-games/progress';
import { KidGameCard } from '@/components/kid-games/cards/KidCards';

/**
 * /courses/[slug]: one course and its lessons. Lesson text is shown as plain text (never HTML),
 * and lesson links — only ever http(s), checked by the server — open in a new tab.
 */
export default function CoursePage() {
  const { slug } = useParams<{ slug: string }>();
  const query = useQuery({
    queryKey: ['content', 'courses', slug],
    queryFn: async () => (await contentApi.course(slug)).data,
  });
  const course = query.data;
  const catalog = useContentCatalog();
  const progress = useKidProgress();
  const games = course ? catalog.gamesInCourse(course.id) : [];
  const classTitle = course?.classLevel ? (catalog.classBySlug(`class-${course.classLevel}`)?.title ?? `Class ${course.classLevel}`) : null;
  const subjectTitle = course?.subject ? (catalog.subjectView(course.subject)?.title ?? course.subject) : null;

  const back = (
    <Link href="/courses" className="inline-flex w-fit items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-muted transition hover:text-foreground">
      <ArrowLeft className="h-4 w-4" />
      All courses
    </Link>
  );

  if (query.isError) {
    const missing = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400);
    return (
      <div className="flex flex-col gap-6">
        {back}
        {missing ? (
          <EmptyState icon={SearchX} title="Course not available" description="This course doesn't exist or isn't published right now." />
        ) : (
          <ErrorState error={query.error} subject="this course" onRetry={() => query.refetch()} />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6">
      {back}
      {!course ? (
        <div className="space-y-3" role="status" aria-label="Loading course">
          <div className="h-8 w-2/3 animate-pulse rounded-lg bg-surface-hover" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-surface-hover" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-hover" />
          ))}
        </div>
      ) : (
        <>
          <header className="gradient-border relative overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
            {course.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- an administrator's image from any https host
              <img src={course.thumbnailUrl} alt="" className="h-40 w-full object-cover sm:h-52" referrerPolicy="no-referrer" />
            )}
            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="accent">
                  <BookOpenCheck className="h-3 w-3" aria-hidden />
                  Course
                </Badge>
                {classTitle && <Badge>{classTitle}</Badge>}
                {subjectTitle && <Badge>{subjectTitle}</Badge>}
                {course.difficulty && <Badge>{course.difficulty}</Badge>}
                {course.ageGroup && <Badge>{course.ageGroup}</Badge>}
              </div>
              <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{course.title}</h1>
              {course.summary && <p className="mt-2 text-sm text-muted sm:text-[15px]">{course.summary}</p>}
              {course.learningObjective && (
                <p className="mt-4 flex items-start gap-2 rounded-xl bg-accent/10 px-3 py-2.5 text-sm text-foreground-soft">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                  <span>
                    <span className="font-semibold text-foreground">You will learn: </span>
                    {course.learningObjective}
                  </span>
                </p>
              )}
              <p className="mt-3 text-xs text-subtle">
                {course.lessons.length} {course.lessons.length === 1 ? 'lesson' : 'lessons'}
                {games.length > 0 && ` · ${games.length} ${games.length === 1 ? 'game' : 'games'}`}
              </p>
            </div>
          </header>

          {games.length > 0 && (
            <section aria-labelledby="course-games">
              <h2 id="course-games" className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
                <Gamepad2 className="h-4 w-4 text-accent" aria-hidden />
                Practice games
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {games.map((game, i) => (
                  <KidGameCard key={game.id} game={game} record={progress.games[game.id]} index={i} showContext />
                ))}
              </div>
            </section>
          )}

          {course.lessons.length === 0 ? (
            <EmptyState icon={BookOpenCheck} title="Lessons coming soon" description="This course doesn't have any lessons yet." />
          ) : (
            <ol className="flex flex-col gap-3">
              {course.lessons.map((lesson, i) => (
                <li key={lesson.id} className="rounded-2xl border border-border bg-surface p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold tabular-nums text-accent">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-semibold text-foreground">{lesson.title}</h2>
                      {lesson.body && (
                        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground-soft [overflow-wrap:anywhere]">{lesson.body}</p>
                      )}
                      {lesson.url && (
                        <a
                          href={lesson.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent/10"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          Open lesson link
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
