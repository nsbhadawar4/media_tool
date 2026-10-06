'use client';

import { useParams } from 'next/navigation';
import { KidSubjectPage } from '@/components/kid-games/hub/ClassAndSubjectPages';

/** /kid-games/class-N/hindi | english | math */
export default function KidSubjectRoute() {
  const { classSlug, subject } = useParams<{ classSlug: string; subject: string }>();
  return <KidSubjectPage classSlug={classSlug} subjectSlug={subject} />;
}
