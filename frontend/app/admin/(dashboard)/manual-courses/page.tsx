'use client';

import { ManualCourseList } from '@/components/admin/manualCourses/ManualCourseList';

/** /admin/manual-courses — hand-written courses only (never the generated ones). */
export default function AdminManualCoursesPage() {
  return <ManualCourseList mode="list" />;
}
