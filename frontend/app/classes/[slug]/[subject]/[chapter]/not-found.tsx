'use client';

import { usePathname } from 'next/navigation';
import { ClassNotFoundState } from '@/components/courses/ClassStates';

/** /classes/class-N/<subject>/<a chapter that isn't in it, or not publicly>: back to the subject. */
export default function ChapterNotFound() {
  const subjectHref = (usePathname() ?? '/classes').split('/').slice(0, 4).join('/') || '/classes';
  return <ClassNotFoundState title="Chapter not found" description="This chapter isn't part of this subject, or it isn't available right now." backHref={subjectHref} backLabel="Back to the subject" />;
}
