'use client';

import { usePathname } from 'next/navigation';
import { ClassNotFoundState } from '@/components/courses/ClassStates';

/** /classes/class-N/<a subject this class doesn't offer, or not publicly>: back to the class. */
export default function SubjectNotFound() {
  const classHref = (usePathname() ?? '/classes').split('/').slice(0, 3).join('/') || '/classes';
  return <ClassNotFoundState title="Subject not found" description="This class doesn't offer this subject, or it isn't available right now." backHref={classHref} backLabel="Back to the class" />;
}
