'use client';

import { usePathname } from 'next/navigation';
import { ClassNotFoundState } from '@/components/courses/ClassStates';

/** /classes/class-N/<subject>/<chapter>/<a lesson the chapter doesn't have>: back to the chapter. */
export default function LessonNotFound() {
  const chapterHref = (usePathname() ?? '/classes').split('/').slice(0, 5).join('/') || '/classes';
  return <ClassNotFoundState title="Lesson not found" description="This chapter doesn't have that lesson, or it isn't available right now." backHref={chapterHref} backLabel="Back to the chapter" />;
}
