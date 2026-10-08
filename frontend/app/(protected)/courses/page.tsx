'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpenCheck, Layers } from 'lucide-react';
import { contentApi } from '@/lib/api/content';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Badge } from '@/components/ui/Badge';
import { useContentCatalog } from '@/lib/content/useContentCatalog';

/** /courses: the courses administrators have published, in their order. */
export default function CoursesPage() {
  const query = useQuery({
    queryKey: ['content', 'courses'],
    queryFn: async () => (await contentApi.courses()).data,
  });
  const courses = query.data ?? [];
  const catalog = useContentCatalog();
  // Names as the administrator set them (any class or subject, not just the built-in ones).
  const subjectName = (s: string | null) => (s ? (catalog.subjectView(s)?.title ?? s) : null);
  const className = (l: number | null) => (l ? (catalog.classBySlug(`class-${l}`)?.title ?? `Class ${l}`) : null);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader icon={BookOpenCheck} eyebrow="Learn" title="Courses" description="Step-by-step lessons to learn at your own pace." />

      {query.isError ? (
        <ErrorState error={query.error} subject="courses" onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading courses">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border border-border bg-surface-hover" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState icon={BookOpenCheck} title="No courses yet" description="New courses will appear here as soon as they're published." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course, i) => (
            <li key={course.id} className="anim-rise" style={{ '--i': i } as React.CSSProperties}>
              <Link
                href={`/courses/${course.slug}`}
                className="card-interactive group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {course.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- an administrator's image from any https host
                  <img src={course.thumbnailUrl} alt="" className="h-32 w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                )}
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {course.classLevel && <Badge variant="accent">{className(course.classLevel)}</Badge>}
                    {course.subject && <Badge>{subjectName(course.subject)}</Badge>}
                    {course.difficulty && <Badge>{course.difficulty}</Badge>}
                  </div>
                  <h2 className="mt-3 text-lg font-semibold tracking-tight text-foreground group-hover:text-accent">{course.title}</h2>
                  {course.summary && <p className="mt-1.5 line-clamp-3 text-sm text-muted">{course.summary}</p>}
                  <p className="mt-auto flex items-center justify-between pt-4 text-xs font-medium text-subtle">
                    <span className="inline-flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" aria-hidden />
                      {course.lessonCount} {course.lessonCount === 1 ? 'lesson' : 'lessons'}
                    </span>
                    <ArrowRight className="h-4 w-4 text-accent transition group-hover:translate-x-0.5" aria-hidden />
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
