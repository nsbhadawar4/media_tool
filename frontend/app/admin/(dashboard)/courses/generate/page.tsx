import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { CourseGenerator } from '@/components/admin/courses/CourseGenerator';

/** /admin/courses/generate — the AI Course Generator (?class=N&subject=key pre-fills it). */
export default function AdminCourseGeneratorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-muted" role="status">
          <Loader2 aria-hidden className="h-6 w-6 animate-spin" />
          <span className="sr-only">Loading the generator…</span>
        </div>
      }
    >
      <CourseGenerator />
    </Suspense>
  );
}
