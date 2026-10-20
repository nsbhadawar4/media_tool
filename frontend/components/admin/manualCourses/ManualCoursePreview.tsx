'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, PencilLine } from 'lucide-react';
import { manualCoursesApi } from '@/lib/api/manualCourses';
import { ManualCourseView } from '@/components/courses/ManualCourseView';
import { Badge } from '@/components/ui/Badge';
import { Toggle } from '@/components/ui/Toggle';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { manualCourseKey } from './ManualCourseBuilder';

/**
 * The admin preview: the course exactly as learners take it (published chapters and lessons only),
 * whatever its own status — or, switched on, with its drafts too.
 */
export function ManualCoursePreview({ id }: { id: string }) {
  const [withDrafts, setWithDrafts] = useState(false);
  const course = useQuery({ queryKey: manualCourseKey(id), queryFn: async ({ signal }) => (await manualCoursesApi.get(id, signal)).data });
  if (course.isError) return <ErrorState error={course.error} onRetry={() => void course.refetch()} subject="this course" />;
  const c = course.data;
  if (!c) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }
  const chapters = c.chapters
    .filter((ch) => withDrafts || ch.status === 'published')
    .map((ch) => ({ ...ch, lessons: ch.lessons.filter((l) => withDrafts || l.status === 'published') }))
    .filter((ch) => ch.lessons.length > 0);
  const live = c.status === 'published' && c.isVisible && !c.deletedAt;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-card">
        <Link
          href={c.deletedAt ? '/admin/manual-courses/trash' : `/admin/manual-courses/${c.id}/edit`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          {c.deletedAt ? 'Back to Trash' : 'Back to editor'}
        </Link>
        <span className="text-sm font-semibold text-foreground">Preview</span>
        <Badge variant={c.status === 'published' ? 'success' : 'warning'}>{c.status === 'published' ? 'Published' : 'Draft'}</Badge>
        <Badge variant={c.isVisible ? 'accent' : 'default'}>{c.isVisible ? 'Visible' : 'Hidden'}</Badge>
        {c.deletedAt && <Badge variant="danger">In Trash</Badge>}
        <label className="ml-auto flex items-center gap-2 text-xs font-medium text-foreground-soft">
          Show drafts
          <Toggle checked={withDrafts} onChange={setWithDrafts} label="Show draft chapters and lessons" />
        </label>
        {!c.deletedAt && (
          <Link href={`/admin/manual-courses/${c.id}/edit`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium hover:bg-surface-hover">
            <PencilLine aria-hidden className="h-4 w-4" />
            Edit
          </Link>
        )}
        {live && (
          <a
            href={`/classes/class-${c.classLevel}/${c.subjectKey}/manual/${c.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium hover:bg-surface-hover"
          >
            <ExternalLink aria-hidden className="h-4 w-4" />
            Open live page
          </a>
        )}
      </div>
      {!live && <p className="text-xs text-muted">Learners don’t see this course yet — it {c.deletedAt ? 'is in Trash' : c.status !== 'published' ? 'is a draft' : 'is hidden'}.</p>}
      <ManualCourseView course={{ title: c.title, description: c.description, classTitle: c.classTitle, subjectTitle: c.subjectTitle, chapters }} />
    </div>
  );
}
