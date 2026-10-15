'use client';

import { useParams } from 'next/navigation';
import { ClassPreview } from '@/components/admin/courses/ClassPreview';

/** /admin/courses/N/preview — the class as visitors will see it, whatever its status. */
export default function AdminClassPreviewPage() {
  const { level } = useParams<{ level: string }>();
  const n = Number(level);
  return <ClassPreview level={Number.isInteger(n) && n >= 1 && n <= 12 ? n : -1} />;
}
