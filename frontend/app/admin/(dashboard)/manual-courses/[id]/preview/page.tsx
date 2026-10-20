'use client';

import { useParams } from 'next/navigation';
import { ManualCoursePreview } from '@/components/admin/manualCourses/ManualCoursePreview';

/** /admin/manual-courses/[id]/preview — the course as learners will take it, whatever its status. */
export default function AdminManualCoursePreviewPage() {
  const { id } = useParams<{ id: string }>();
  return <ManualCoursePreview id={/^[a-f0-9]{24}$/.test(id) ? id : '000000000000000000000000'} />;
}
