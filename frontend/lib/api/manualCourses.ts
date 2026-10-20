import { api } from './client';

/**
 * Admin → Manual Courses (backend adminManualCourseController): courses written by hand — chapters,
 * lessons and questions — in their own collection, independent of the AI Course Generator. And the
 * learner reads of published, visible ones.
 */

export type ManualStatus = 'draft' | 'published';
export type ManualQuestionType = 'mcq' | 'true-false' | 'short-answer';

export interface ManualQuestion {
  uid: string;
  type: ManualQuestionType;
  prompt: string;
  /** mcq: four options (A–D); empty for the other types. */
  options: string[];
  /** mcq: one of the options; true-false: "True" / "False"; short-answer: the expected answer. */
  answer: string;
  explanation: string;
}

export interface ManualLesson {
  uid: string;
  title: string;
  description: string;
  content: string;
  status: ManualStatus;
  questions: ManualQuestion[];
}

export interface ManualChapter {
  uid: string;
  title: string;
  description: string;
  status: ManualStatus;
  lessons: ManualLesson[];
}

export interface ManualCounts {
  chapters: number;
  lessons: number;
  questions: number;
}

/** What the builder edits and saves. */
export interface ManualCourseDraft {
  classLevel: number | null;
  subjectKey: string;
  title: string;
  description: string;
  isVisible: boolean;
  chapters: ManualChapter[];
}

export interface ManualCourseRow {
  id: string;
  source: 'manual';
  classLevel: number;
  classTitle: string;
  subjectKey: string;
  subjectTitle: string;
  title: string;
  slug: string;
  status: ManualStatus;
  isVisible: boolean;
  counts: ManualCounts;
  publishedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManualCourse extends ManualCourseRow {
  description: string;
  revision: number;
  chapters: ManualChapter[];
}

export interface ManualCourseOptions {
  classes: Array<{ level: number; title: string; subjects: Array<{ key: string; title: string }> }>;
}

export interface ManualCourseStats {
  total: number;
  published: number;
  drafts: number;
  hidden: number;
  trashed: number;
}

export interface ManualCourseListQuery {
  q: string;
  classLevel?: number;
  subject?: string;
  status: 'all' | ManualStatus;
  visibility: 'all' | 'visible' | 'hidden';
  sort: 'recent' | 'oldest' | 'title';
  page: number;
  limit: number;
}

/** Everything Manual Courses shows — invalidated after any change. */
export const MANUAL_COURSES_KEY = ['admin', 'manual-courses'] as const;

const listQuery = (q: ManualCourseListQuery) => ({ ...q, q: q.q || undefined, subject: q.subject || undefined });

type Body = Omit<ManualCourseDraft, 'classLevel'> & { classLevel: number | null };

export const manualCoursesApi = {
  options: (signal?: AbortSignal) => api.get<ManualCourseOptions>('/api/admin/manual-courses/options', undefined, signal),
  stats: (signal?: AbortSignal) => api.get<ManualCourseStats>('/api/admin/manual-courses/stats', undefined, signal),
  list: (query: ManualCourseListQuery, signal?: AbortSignal) => api.get<ManualCourseRow[]>('/api/admin/manual-courses', listQuery(query), signal),
  trash: (query: ManualCourseListQuery, signal?: AbortSignal) => api.get<ManualCourseRow[]>('/api/admin/manual-courses/trash', listQuery(query), signal),
  get: (id: string, signal?: AbortSignal) => api.get<ManualCourse>(`/api/admin/manual-courses/${id}`, undefined, signal),
  create: (body: Body & { status: ManualStatus }) => api.post<ManualCourse>('/api/admin/manual-courses', body),
  /** Saves the whole course; refused (409) when it was saved elsewhere since `revision`. */
  update: (id: string, body: Body & { revision: number }) => api.patch<ManualCourse>(`/api/admin/manual-courses/${id}`, body),
  publish: (id: string) => api.post<ManualCourse>(`/api/admin/manual-courses/${id}/publish`),
  unpublish: (id: string) => api.post<ManualCourse>(`/api/admin/manual-courses/${id}/unpublish`),
  duplicate: (id: string) => api.post<ManualCourse>(`/api/admin/manual-courses/${id}/duplicate`),
  /** To Manual Courses → Trash (restorable). */
  trashOne: (id: string) => api.delete<{ id: string }>(`/api/admin/manual-courses/${id}`),
  restore: (id: string) => api.post<ManualCourse>(`/api/admin/manual-courses/${id}/restore`),
  /** From Trash, for good. The server checks the typed word too. */
  deleteForever: (id: string, confirm: string) => api.delete<{ id: string }>(`/api/admin/manual-courses/${id}/permanent`, { confirm }),
};

// ------------------------------------------------------------------------------------ learners

export interface PublicManualCourseSummary {
  slug: string;
  title: string;
  description: string;
  chapters: number;
  lessons: number;
}

export interface PublicManualCourse {
  class: { slug: string; title: string; classLevel: number };
  subject: { key: string; title: string };
  course: {
    slug: string;
    title: string;
    description: string;
    updatedAt: string;
    chapters: Array<{
      title: string;
      description: string;
      lessons: Array<{ title: string; description: string; content: string; questions: Array<Omit<ManualQuestion, 'uid'>> }>;
    }>;
  };
}

export const publicManualCoursesApi = {
  list: (classSlug: string, subject: string) => api.get<PublicManualCourseSummary[]>(`/api/content/classes/${classSlug}/subjects/${subject}/manual-courses`),
  get: (classSlug: string, subject: string, course: string) => api.get<PublicManualCourse>(`/api/content/classes/${classSlug}/subjects/${subject}/manual-courses/${course}`),
};
