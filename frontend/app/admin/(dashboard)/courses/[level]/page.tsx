'use client';

import { useParams } from 'next/navigation';
import { ClassEditorPage } from '@/components/admin/courses/ClassEditor';

/** /admin/courses/N — Edit Class N. */
export default function AdminEditClassPage() {
  const { level } = useParams<{ level: string }>();
  const n = Number(level);
  return <ClassEditorPage level={Number.isInteger(n) && n >= 1 && n <= 12 ? n : -1} />;
}
