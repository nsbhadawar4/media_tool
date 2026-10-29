import { ClassNotFoundState } from '@/components/courses/ClassStates';

/**
 * /classes/<anything not there>: a clear way back instead of a bare 404. The response is a real 404 (nothing
 * streams ahead of the page), and Next.js answers it with this, the first not-found boundary, whatever the
 * depth — so the words cover a class, subject, chapter or lesson alike.
 */
export default function ClassNotFound() {
  return <ClassNotFoundState title="Page not found" description="This class, subject, chapter or lesson doesn't exist or isn't available right now." backHref="/classes" backLabel="Back to Classes" />;
}
