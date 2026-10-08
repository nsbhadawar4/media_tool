import { api } from './client';

/** One entry of the admin-managed catalog, as the site and app see it (GET /api/content/catalog). */
export interface CatalogEntry {
  key: string;
  title: string;
  description: string;
  order: number;
  classLevel: number | null;
  subject: string | null;
  thumbnailUrl: string | null;
  /** Subjects: the short mark on their card ("A B C"). */
  glyph: string | null;
  /** Kid Games. */
  difficulty: 'easy' | 'medium' | 'hard' | null;
  gameType: string | null;
  courseId: string | null;
  isEnabled: boolean;
  isVisible: boolean;
}

/** A course as listed in the catalog (no lessons). */
export interface CatalogCourse {
  id: string;
  slug: string;
  title: string;
  summary: string;
  classLevel: number | null;
  subject: string | null;
  thumbnailUrl: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  ageGroup: string | null;
  lessonCount: number;
  order: number;
  isEnabled: boolean;
  isVisible: boolean;
}

export interface PublicCatalog {
  sections: CatalogEntry[];
  classes: CatalogEntry[];
  subjects: CatalogEntry[];
  /** Which subjects each class offers (each link switchable on its own). */
  classSubjects: CatalogEntry[];
  kidGames: CatalogEntry[];
  games: CatalogEntry[];
  courses: CatalogCourse[];
}

export interface CourseLesson {
  id: string;
  title: string;
  /** Plain text: always rendered as text, never as HTML. */
  body: string;
  /** Only ever an http(s) link (validated by the server). */
  url: string | null;
}

export interface Course {
  id: string;
  title: string;
  slug: string;
  summary: string;
  classLevel: number | null;
  subject: string | null;
  thumbnailUrl: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  ageGroup: string | null;
  learningObjective: string;
  lessons: CourseLesson[];
  order: number;
  isEnabled: boolean;
  isVisible: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CourseSummary = Omit<Course, 'lessons'> & { lessonCount: number };

export const contentApi = {
  catalog: () => api.get<PublicCatalog>('/api/content/catalog'),
  courses: (params: { classLevel?: number; subject?: string } = {}) => api.get<CourseSummary[]>('/api/content/courses', { ...params }),
  course: (slug: string) => api.get<Course>(`/api/content/courses/${encodeURIComponent(slug)}`),
};
