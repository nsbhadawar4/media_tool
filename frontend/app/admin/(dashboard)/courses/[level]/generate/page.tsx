'use client';

import { useParams } from 'next/navigation';
import { ClassGeneratorPage } from '@/components/admin/courses/ClassGenerator';

/** /admin/courses/N/generate — Generate Curriculum for an existing class. */
export default function AdminGenerateCurriculumPage() {
  const { level } = useParams<{ level: string }>();
  const n = Number(level);
  return <ClassGeneratorPage level={Number.isInteger(n) && n >= 1 && n <= 12 ? n : -1} />;
}
