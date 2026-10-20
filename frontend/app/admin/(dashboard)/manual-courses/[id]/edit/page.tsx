'use client';

import { useParams } from 'next/navigation';
import { ManualCourseBuilder } from '@/components/admin/manualCourses/ManualCourseBuilder';

/** /admin/manual-courses/[id]/edit — edit a manual course; publish or unpublish it. */
export default function AdminEditManualCoursePage() {
  const { id } = useParams<{ id: string }>();
  return <ManualCourseBuilder id={/^[a-f0-9]{24}$/.test(id) ? id : '000000000000000000000000'} />;
}
