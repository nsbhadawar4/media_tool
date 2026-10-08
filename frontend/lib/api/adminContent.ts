import { api } from './client';
import type { Course } from './content';

/** Admin content management (requireAuth + requireAdmin on every route). */

export type ContentType = 'section' | 'class' | 'subject' | 'class_subject' | 'kid_game' | 'game';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type ContentStatus = 'live' | 'active' | 'disabled' | 'hidden' | 'archived' | 'all';
export type ContentSort = 'order' | 'title' | 'updated' | 'created';

export interface AdminContentItem {
  id: string;
  type: ContentType;
  key: string;
  title: string;
  description: string;
  classLevel: number | null;
  subject: string | null;
  thumbnailUrl: string | null;
  glyph: string | null;
  difficulty: Difficulty | null;
  gameType: string | null;
  courseId: string | null;
  order: number;
  isEnabled: boolean;
  isVisible: boolean;
  /** 'code': seeded from the app's own catalog; 'admin': added in the admin panel. */
  source: 'code' | 'admin';
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** The administrator who last changed it; null for entries never changed since the app added them. */
  updatedBy: { id: string; name: string | null; email: string | null } | null;
}

export interface TypeStats {
  total: number;
  active: number;
  disabled: number;
  hidden: number;
  archived: number;
  custom: number;
}

export type ContentStats = Record<ContentType, TypeStats> & { course: { total: number; active: number; archived: number } };

export interface ListContentParams {
  type: ContentType;
  search?: string;
  status?: ContentStatus;
  classLevel?: number;
  subject?: string;
  sort?: ContentSort;
  page?: number;
  limit?: number;
}

export interface CreateContentInput {
  type: ContentType;
  /** Not needed for classes and class subjects (the server derives it). */
  key?: string;
  title: string;
  description?: string;
  classLevel?: number;
  subject?: string;
  thumbnailUrl?: string | null;
  glyph?: string | null;
  difficulty?: Difficulty;
  gameType?: string;
  courseId?: string | null;
  isEnabled?: boolean;
  isVisible?: boolean;
}

export type UpdateContentInput = Partial<
  Pick<AdminContentItem, 'title' | 'description' | 'isEnabled' | 'isVisible' | 'thumbnailUrl' | 'glyph' | 'courseId' | 'classLevel' | 'subject' | 'gameType'> & {
    difficulty: Difficulty;
  }
>;

/** The game mechanics the Kid Games player implements. */
export const GAME_TYPES = [
  'multiple-choice',
  'image-choice',
  'fill-blank',
  'matching',
  'ordering',
  'memory',
  'word-builder',
  'drag-drop',
  'number-pad',
  'timed-quiz',
] as const;

export interface CourseInput {
  title: string;
  slug?: string;
  summary?: string;
  classLevel: number;
  subject: string;
  thumbnailUrl?: string | null;
  difficulty?: Difficulty | null;
  ageGroup?: string | null;
  learningObjective?: string;
  lessons?: Array<{ title: string; body?: string; url?: string | null }>;
  isEnabled?: boolean;
  isVisible?: boolean;
}

export interface ListCoursesParams {
  search?: string;
  status?: ContentStatus;
  classLevel?: number;
  subject?: string;
  sort?: ContentSort;
  page?: number;
  limit?: number;
}

export const adminContentApi = {
  stats: () => api.get<ContentStats>('/api/admin/content/stats'),
  list: (params: ListContentParams) => api.get<AdminContentItem[]>('/api/admin/content/items', { ...params }),
  create: (input: CreateContentInput) => api.post<AdminContentItem>('/api/admin/content/items', input),
  update: (id: string, input: UpdateContentInput) => api.patch<AdminContentItem>(`/api/admin/content/items/${id}`, input),
  move: (id: string, direction: 'up' | 'down') => api.post<AdminContentItem>(`/api/admin/content/items/${id}/move`, { direction }),
  archive: (id: string) => api.delete<AdminContentItem>(`/api/admin/content/items/${id}`),
  restore: (id: string) => api.post<AdminContentItem>(`/api/admin/content/items/${id}/restore`),

  courses: (params: ListCoursesParams = {}) => api.get<Course[]>('/api/admin/content/courses', { ...params }),
  course: (id: string) => api.get<Course>(`/api/admin/content/courses/${id}`),
  createCourse: (input: CourseInput) => api.post<Course>('/api/admin/content/courses', input),
  updateCourse: (id: string, input: Partial<CourseInput>) => api.patch<Course>(`/api/admin/content/courses/${id}`, input),
  moveCourse: (id: string, direction: 'up' | 'down') => api.post<Course>(`/api/admin/content/courses/${id}/move`, { direction }),
  archiveCourse: (id: string) => api.delete<Course>(`/api/admin/content/courses/${id}`),
  restoreCourse: (id: string) => api.post<Course>(`/api/admin/content/courses/${id}/restore`),
};
