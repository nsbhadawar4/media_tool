'use client';

import { useParams } from 'next/navigation';
import { CourseEditPage } from '@/components/admin/courses/CourseEditPage';

/** /admin/courses/N/<subject> — one course (a subject of Class N) in the course editor. */
export default function AdminCourseEditRoute() {
  const { level, subject } = useParams<{ level: string; subject: string }>();
  const n = Number(level);
  return <CourseEditPage level={Number.isInteger(n) && n >= 1 && n <= 12 ? n : -1} subject={decodeURIComponent(subject)} />;
}
