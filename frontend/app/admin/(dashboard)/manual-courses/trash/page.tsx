'use client';

import { ManualCourseList } from '@/components/admin/manualCourses/ManualCourseList';

/** /admin/manual-courses/trash — deleted manual courses: Restore or Delete permanently. */
export default function AdminManualCourseTrashPage() {
  return <ManualCourseList mode="trash" />;
}
