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
  /** How this class describes the subject (the class editor and the generator write it); empty: the shared description. */
  classDescription: string;
  /** Listed in this class. */
  isVisible: boolean;
  /** The subject is switched on (it can be switched off for every class elsewhere). */
  isAvailable: boolean;
  games: number;
  chapters: number;
  lessons: number;
  /** Generated chapters waiting to be published. */
  draftChapters: number;
  questions: number;
  courseTitle: string;
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
  /** chapters / lessons: published ones; draftChapters: generated, waiting to be published. */
  counts: { subjects: number; visibleSubjects: number; games: number; courses: number; chapters: number; lessons: number; draftChapters: number; questions: number };
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

// ------------------------------------------------------------------------------------ curriculum

export type QuestionType = 'mcq' | 'true-false' | 'fill-blank' | 'short-answer' | 'match' | 'word-problem';

/** A question. Lessons' questions and practice carry their answer (to study); a public quiz doesn't. */
export interface CurriculumQuestion {
  type: QuestionType;
  prompt: string;
  options: string[];
  answer?: string;
  difficulty?: ChapterDifficulty | null;
  explanation?: string;
}

/** Practice sets in chapters written before lessons had their own questions. */
export interface CurriculumActivity {
  type: string;
  title: string;
  instructions: string;
  questions: CurriculumQuestion[];
}

export interface CurriculumLesson {
  /** Admin data. */
  id?: string;
  /** Its place in the chapter (1-based): a lesson's address. */
  number: number;
  title: string;
  explanation: string;
  examples: string[];
  keyPoints: string[];
  questions: CurriculumQuestion[];
  practice: CurriculumQuestion[];
  estimatedMinutes: number | null;
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

/** A chapter in a list (class and subject pages): no lesson content. */
export interface CurriculumChapterSummary {
  slug: string;
  title: string;
  description: string;
  difficulty: ChapterDifficulty | null;
  estimatedMinutes: number | null;
  lessonCount: number;
  questionCount: number;
  lessons: Array<{ number: number; title: string }>;
}

/** Who wrote content: an AI provider, the template generator, or a person. */
export interface ContentSource {
  kind: 'ai' | 'template' | 'manual';
  provider: string | null;
  model: string | null;
  at?: string | null;
}

/** A whole chapter: lessons in full, older practice sets, the quiz and resources (admin fields when an administrator reads it). */
export interface CurriculumChapter extends CurriculumChapterSummary {
  id?: string;
  draft?: boolean;
  isVisible?: boolean;
  generated?: boolean;
  source?: ContentSource | null;
  objectives: string[];
  /** The chapter's closing summary (empty for older chapters). */
  summary?: string;
  lessons: CurriculumLesson[];
  activities: CurriculumActivity[];
  quiz: CurriculumQuestion[];
  resources?: FreeResource[];
}

export interface CourseInfo {
  title: string;
  objectives: string[];
  language: 'english' | 'hindi' | 'bilingual' | 'hinglish' | null;
  level: 'beginner' | 'basic' | 'intermediate' | 'advanced' | null;
  source?: ContentSource | null;
}

export interface CurriculumSubject<C extends CurriculumChapterSummary = CurriculumChapter> {
  key: string;
  title: string;
  description: string;
  glyph: string | null;
  difficulty: ChapterDifficulty | null;
  estimatedMinutes: number | null;
  games: number;
  isVisible?: boolean;
  course?: CourseInfo | null;
  resources: FreeResource[];
  chapters: C[];
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
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append('image', file);
    return api.postForm<{ url: string; width: number; height: number }>('/api/admin/classes/images', form);
  },
};
