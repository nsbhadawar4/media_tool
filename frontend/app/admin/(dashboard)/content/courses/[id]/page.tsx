'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { adminContentApi } from '@/lib/api/adminContent';
import { ApiError } from '@/lib/api/client';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { CourseEditor } from '@/components/admin/content/CourseEditor';

/** /admin/content/courses/[id]: edit one course. */
export default function EditCoursePage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({ queryKey: ['admin', 'content', 'course', id], queryFn: async () => (await adminContentApi.course(id)).data });
  if (query.isError) {
    const missing = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400);
    return missing ? <EmptyState icon={SearchX} title="Course not found" /> : <ErrorState error={query.error} subject="this course" onRetry={() => query.refetch()} />;
  }
  if (!query.data) return <FullPageSpinner />;
  // Keyed by save time, so the form reloads after the server returns the saved course.
  return <CourseEditor key={query.data.id} course={query.data} />;
}
