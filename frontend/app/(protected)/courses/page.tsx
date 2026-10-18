'use client';

import { BookOpenCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { ClassCardsGrid } from '@/components/kid-games/cards/ClassCardsGrid';

/**
 * /courses: every published, visible class from Manage Courses — the same catalog, order and cards
 * as the home page and the dashboard. A class opens its course pages (/classes/class-N → subject →
 * chapter). The grid shows its own loading, error (with retry) and empty states.
 */
export default function CoursesPage() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader icon={BookOpenCheck} eyebrow="Learn" title="Courses" description="Pick a class, then a subject and a chapter — lessons, practice and a quiz in each." />
      <ClassCardsGrid purpose="learn" />
    </div>
  );
}
