'use client';

import { BookOpenCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LearnClassPicker } from '@/components/courses/LearnClassPicker';

/**
 * /courses: class first, then subject. Every published, visible class from Manage Courses (the same
 * catalog and order as the home page and the dashboard); choosing one shows only its subjects, each
 * opening /classes/class-N/<subject> → chapter → lesson. The choice stays in the address
 * (?class=class-N), so a refresh, a new tab or Back keeps it.
 */
export default function CoursesPage() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader icon={BookOpenCheck} eyebrow="Learn" title="Courses" description="Choose your class first, then one of its subjects — chapters, lessons, practice and a quiz in each." />
      <LearnClassPicker idPrefix="courses" />
    </div>
  );
}
