'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, SearchX } from 'lucide-react';
import { contentApi } from '@/lib/api/content';
import { ApiError } from '@/lib/api/client';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { chapterPath } from '@/lib/content/learnPaths';

/**
 * /courses/<course>: an older address of a chapter (Kid Games' course cards link here). There is
 * one learning route — /classes/class-N/<subject>/<chapter> — so this looks the course up (under
 * the same rules as that page) and moves on to it, replacing this entry in the history.
 */
export default function CourseRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const query = useQuery({ queryKey: ['content', 'courses', slug], queryFn: async () => (await contentApi.course(slug)).data, retry: 1 });
  const course = query.data;
  const target = course?.classLevel && course.subject ? chapterPath(`class-${course.classLevel}`, course.subject, course.slug) : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  const back = (
    <Link href="/courses" className="inline-flex w-fit items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-muted transition hover:text-foreground">
      <ArrowLeft className="h-4 w-4" />
      All courses
    </Link>
  );
  if (query.isError || (course && !target)) {
    const missing = !query.isError || (query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400));
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
    <div className="mx-auto w-full max-w-3xl space-y-3" role="status" aria-label="Opening course">
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-surface-hover" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-surface-hover" />
      <div className="h-28 animate-pulse rounded-2xl bg-surface-hover" />
    </div>
  );
}
