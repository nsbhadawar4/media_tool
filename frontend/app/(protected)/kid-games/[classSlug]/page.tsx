'use client';

import { useParams } from 'next/navigation';
import { KidClassPage } from '@/components/kid-games/hub/ClassAndSubjectPages';

/** /kid-games/class-1 … /kid-games/class-5: one dynamic route for all five classes. */
export default function KidClassRoute() {
  const { classSlug } = useParams<{ classSlug: string }>();
  return <KidClassPage classSlug={classSlug} />;
}
