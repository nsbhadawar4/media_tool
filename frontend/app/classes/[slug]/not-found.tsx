import { ClassNotFoundState } from '@/components/courses/ClassStates';

/** /classes/<unknown, hidden or draft class>: a clear way back instead of a bare 404. */
export default function ClassNotFound() {
  return <ClassNotFoundState title="Class not found" description="This class doesn't exist or isn't available right now." backHref="/classes" backLabel="Back to Classes" />;
}
