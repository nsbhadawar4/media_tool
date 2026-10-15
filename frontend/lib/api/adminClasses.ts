import { api } from './client';

/** Where a class stands: a draft, listed, hidden from the lists, switched off elsewhere, or archived. */
export type ClassStatus = 'draft' | 'visible' | 'hidden' | 'off' | 'archived';

export type CurriculumType = 'general' | 'mathematics' | 'science' | 'language' | 'competitive' | 'skills' | 'custom';
export type ClassLanguage = 'english' | 'hindi' | 'bilingual' | 'other';
export type ClassDifficulty = 'beginner' | 'elementary' | 'intermediate' | 'advanced';
export type ChapterDifficulty = 'easy' | 'medium' | 'hard';

/** What the Course & Class Generator records about a class. */
export interface ClassProfile {
  learningGoal: string;
  targetAge: string;
  language: ClassLanguage | null;
  curriculumType: CurriculumType | null;
  difficulty: ClassDifficulty | null;
}

export interface AdminClassSubject {
  key: string;
  title: string;
  description: string;
  glyph: string | null;
  /** This class's own description of the subject (from the generator), if any. */
  classDescription: string;
  /** Listed in this class. */
  isVisible: boolean;
  /** The subject is switched on (it can be switched off for every class elsewhere). */
  isAvailable: boolean;
  games: number;
  chapters: number;
  lessons: number;
  difficulty: ChapterDifficulty | null;
  estimatedMinutes: number | null;
  resources: number;
}

/** A class with its subjects, as Manage Courses shows it (GET /api/admin/classes). */
export interface AdminClass {
  id: string;
  classLevel: number;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  details: string;
  image: string | null;
  isVisible: boolean;
  isEnabled: boolean;
  status: ClassStatus;
  /** False while the class is a draft. */
  published: boolean;
  profile: ClassProfile | null;
  /** 1-based place among the live classes; null when archived. */
  position: number | null;
  /** Classes 1–5, which the app has games and pictures for. */
  builtIn: boolean;
  subjects: AdminClassSubject[];
  counts: { subjects: number; visibleSubjects: number; games: number; courses: number; chapters: number; lessons: number };
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ClassSubjectInput {
  /** An existing subject; left out for a new one. */
  key?: string;
  title: string;
  description: string;
  glyph?: string | null;
  isVisible: boolean;
  difficulty?: ChapterDifficulty | null;
  estimatedMinutes?: number | null;
}

export interface ClassInput {
  title: string;
  subtitle: string;
  description: string;
  details: string;
  image: string | null;
  isVisible: boolean;
  position?: number;
  subjects: ClassSubjectInput[];
  /** class: leave shared subjects as they are and keep descriptions on this class (the generator). */
  subjectMode?: 'shared' | 'class';
  profile?: ClassProfile | null;
}

// ------------------------------------------------------------------------------------ generator

export interface ClassBrief {
  classLevel: number;
  title: string;
  subtitle?: string;
  description?: string;
  details?: string;
  learningGoal?: string;
  targetAge?: string;
  language?: ClassLanguage;
  curriculumType?: CurriculumType;
  difficulty?: ClassDifficulty;
}

export interface SubjectSuggestion {
  key: string;
  title: string;
  description: string;
  glyph: string;
  difficulty: ChapterDifficulty;
  estimatedMinutes: number;
  chapterCount: number;
  activityCount: number;
  reason: string;
  /** Already a subject in the catalog (shared with other classes). */
  existing: boolean;
}

export interface CurriculumQuestion {
  prompt: string;
  options: string[];
  /** Admin and generator data only; public pages never receive it. */
  answer?: string;
}

export interface CurriculumActivity {
  type: 'multiple-choice' | 'fill-blank' | 'match-pair' | 'number-problems';
  title: string;
  instructions: string;
  questions: CurriculumQuestion[];
}

export interface CurriculumChapter {
  id?: string;
  slug?: string;
  title: string;
  description: string;
  objectives: string[];
  estimatedMinutes: number | null;
  difficulty: ChapterDifficulty | null;
  lessons: Array<{ title: string; body: string }>;
  activities: CurriculumActivity[];
  quiz: CurriculumQuestion[];
  resources?: FreeResource[];
}

export interface FreeResource {
  title: string;
  author: string | null;
  source: string;
  url: string;
  type: 'book' | 'image' | 'link';
  license: string;
  thumbnailUrl: string | null;
}

export interface CurriculumSubject {
  key: string;
  title: string;
  description: string;
  glyph: string | null;
  difficulty: ChapterDifficulty | null;
  estimatedMinutes: number | null;
  games: number;
  isVisible?: boolean;
  resources: FreeResource[];
  chapters: CurriculumChapter[];
}

export const ADMIN_CLASSES_KEY = ['admin', 'classes'] as const;

export const adminClassesApi = {
  list: (status: 'live' | 'archived' | 'all' = 'live') => api.get<AdminClass[]>('/api/admin/classes', { status }),
  get: (level: number) => api.get<AdminClass>(`/api/admin/classes/${level}`),
  create: (input: ClassInput & { classLevel: number; status?: 'draft' | 'published' }) => api.post<AdminClass>('/api/admin/classes', input),
  update: (level: number, input: Partial<ClassInput>) => api.patch<AdminClass>(`/api/admin/classes/${level}`, input),
  setVisibility: (level: number, isVisible: boolean) => api.patch<AdminClass>(`/api/admin/classes/${level}/visibility`, { isVisible }),
  setPosition: (level: number, position: number) => api.patch<AdminClass>(`/api/admin/classes/${level}/order`, { position }),
  archive: (level: number) => api.delete<AdminClass>(`/api/admin/classes/${level}`),
  restore: (level: number) => api.post<AdminClass>(`/api/admin/classes/${level}/restore`),
  setStatus: (level: number, status: 'draft' | 'published') => api.patch<AdminClass>(`/api/admin/classes/${level}/status`, { status }),
  duplicate: (level: number, classLevel?: number) => api.post<AdminClass>(`/api/admin/classes/${level}/duplicate`, classLevel ? { classLevel } : {}),
  curriculum: (level: number) => api.get<{ subjects: CurriculumSubject[] }>(`/api/admin/classes/${level}/curriculum`),
  saveCurriculum: (level: number, subjects: Array<{ key: string; chapters: CurriculumChapter[]; resources: FreeResource[] }>) =>
    api.put<{ subjects: CurriculumSubject[] }>(`/api/admin/classes/${level}/curriculum`, { subjects }),
  suggestSubjects: (brief: ClassBrief) => api.post<{ generator: string; subjects: SubjectSuggestion[] }>('/api/admin/curriculum/subjects', brief),
  buildChapters: (brief: ClassBrief, subjects: Array<{ key: string; title: string; difficulty?: ChapterDifficulty; chapterCount?: number }>) =>
    api.post<{ generator: string; subjects: Array<{ key: string; chapters: CurriculumChapter[] }> }>('/api/admin/curriculum/chapters', { brief, subjects }),
  findResources: (subject: string, opts: { topic?: string; classLevel?: number } = {}) =>
    api.get<{ resources: FreeResource[]; unavailable: string[] }>('/api/admin/curriculum/resources', { subject, ...(opts.topic ? { topic: opts.topic } : {}), ...(opts.classLevel ? { classLevel: opts.classLevel } : {}) }),
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append('image', file);
    return api.postForm<{ url: string; width: number; height: number }>('/api/admin/classes/images', form);
  },
};
