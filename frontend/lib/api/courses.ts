import { api } from './client';
import type { ChapterDifficulty, ContentSource, CourseInfo, CurriculumChapter, CurriculumQuestion } from './adminClasses';

/**
 * The AI Course Generator and course editor (admin), and learners' course progress. A course is
 * one subject of one class; generation saves nothing — the administrator reviews, edits, then saves.
 */

export type Engine = 'ai' | 'template';
export type CourseLevel = 'beginner' | 'basic' | 'intermediate' | 'advanced';
export type CourseLanguage = 'english' | 'hindi' | 'bilingual' | 'hinglish';

export interface CourseBrief {
  classLevel: number;
  subject: { key: string; title: string };
  title: string;
  description: string;
  language: CourseLanguage;
  level: CourseLevel;
  chapters: number;
  lessonsPerChapter: number;
  questionsPerLesson: number;
  prompt: string;
  goals: string;
  include: string;
  avoid: string;
  instructions: string;
}

export interface CourseOutline {
  classLevel?: number;
  subject?: string;
  title: string;
  description: string;
  objectives: string[];
  chapters: Array<{ title: string; description: string; lessonTitles: string[] }>;
}

export interface GeneratedLesson {
  title: string;
  explanation: string;
  examples: string[];
  keyPoints: string[];
  questions: CurriculumQuestion[];
  practice: CurriculumQuestion[];
  estimatedMinutes: number;
}
export interface GeneratedChapter {
  title: string;
  description: string;
  summary: string;
  objectives: string[];
  difficulty: ChapterDifficulty;
  estimatedMinutes: number;
  lessons: GeneratedLesson[];
  quiz: CurriculumQuestion[];
}

export interface GeneratedBy {
  kind: 'ai' | 'template';
  provider: string | null;
  model: string | null;
}

export interface EngineStatus {
  ai: { ready: boolean; provider: string | null; model: string | null; problem: string | null };
  defaultEngine: Engine;
}

export type ChapterStatus = 'draft' | 'published' | 'hidden';

/** A course as the editor loads it. */
export interface AdminCourse {
  class: { level: number; slug: string; title: string; status: 'draft' | 'published'; isVisible: boolean };
  subject: { key: string; title: string; glyph: string | null; exists: boolean };
  offered: boolean;
  isVisible: boolean;
  course: CourseInfo & { description: string };
  counts: { chapters: number; published: number; drafts: number; hidden: number };
  chapters: Array<CurriculumChapter & { status: ChapterStatus }>;
}

export interface SaveCourseInput {
  mode: 'new' | 'new-version' | 'edit';
  subjectTitle?: string;
  course: { title: string; description: string; objectives: string[]; language: CourseLanguage | null; level: CourseLevel | null };
  chapters: Array<{
    id?: string;
    title: string;
    description: string;
    summary: string;
    objectives: string[];
    difficulty: ChapterDifficulty | null;
    status: ChapterStatus;
    /** When it is taught. Left out = unchanged; null = not scheduled. */
    academicYear?: string | null;
    month?: number | null;
    lessons: Array<{ id?: string; title: string; explanation: string; examples: string[]; keyPoints: string[]; questions: CurriculumQuestion[]; practice: CurriculumQuestion[]; estimatedMinutes: number | null }>;
    quiz: CurriculumQuestion[];
  }>;
  source?: Omit<ContentSource, 'at'>;
  publish?: boolean;
}

export const COURSE_KEY = (level: number, subject: string) => ['admin', 'courses', level, subject] as const;

export const courseAdminApi = {
  engine: () => api.get<EngineStatus>('/api/admin/courses/engine'),
  outline: (brief: CourseBrief, engine: Engine) => api.post<{ outline: CourseOutline; by: GeneratedBy }>('/api/admin/courses/generate/outline', { brief, engine }),
  chapter: (brief: CourseBrief, engine: Engine, outline: CourseOutline, index: number, seed = '') =>
    api.post<{ chapter: GeneratedChapter; by: GeneratedBy }>('/api/admin/courses/generate/chapter', { brief, engine, outline, index, seed }),
  lesson: (brief: CourseBrief, engine: Engine, chapter: { title: string; description: string; lessonTitles: string[] }, index: number, seed = '') =>
    api.post<{ lesson: GeneratedLesson; by: GeneratedBy }>('/api/admin/courses/generate/lesson', { brief, engine, chapter, index, seed }),
  questions: (brief: CourseBrief, engine: Engine, chapterTitle: string, lessonIndex: number, lesson: { title: string; explanation: string }, count: number, seed = '') =>
    api.post<{ questions: CurriculumQuestion[]; by: GeneratedBy }>('/api/admin/courses/generate/questions', { brief, engine, chapterTitle, lessonIndex, lesson, count, seed }),
  get: (level: number, subject: string) => api.get<AdminCourse>(`/api/admin/courses/${level}/${encodeURIComponent(subject)}`),
  save: (level: number, subject: string, input: SaveCourseInput) => api.put<AdminCourse>(`/api/admin/courses/${level}/${encodeURIComponent(subject)}`, input),
  publish: (level: number, subject: string) => api.post<AdminCourse>(`/api/admin/courses/${level}/${encodeURIComponent(subject)}/publish`),
  unpublish: (level: number, subject: string) => api.post<AdminCourse>(`/api/admin/courses/${level}/${encodeURIComponent(subject)}/unpublish`),
  /** Resumable generation, saved on the server: start, then `next` until ready (see courseGeneration.ts). */
  jobs: {
    start: (brief: CourseBrief, engine: Engine, mode: 'new' | 'new-version') => api.post<GenerationJob>('/api/admin/courses/generate/jobs', { brief, engine, mode }),
    current: (classLevel: number, subject: string) => api.get<GenerationJob | null>('/api/admin/courses/generate/jobs/current', { classLevel, subject }),
    next: (id: string) => api.post<GenerationJob>(`/api/admin/courses/generate/jobs/${id}/next`),
    finish: (id: string) => api.post<GenerationJob>(`/api/admin/courses/generate/jobs/${id}/finish`),
    discard: (id: string) => api.delete<GenerationJob>(`/api/admin/courses/generate/jobs/${id}`),
  },
};

export const GENERATION_JOB_KEY = (level: number, subject: string) => ['admin', 'courses', 'job', level, subject] as const;

/** A course being generated, as the server keeps it: chapters are saved as they are written. */
export interface GenerationJob {
  id: string;
  classLevel: number;
  subject: string;
  status: 'running' | 'paused' | 'ready' | 'complete' | 'discarded';
  engine: Engine;
  mode: 'new' | 'new-version';
  brief: CourseBrief;
  outline: CourseOutline | null;
  chapters: GeneratedChapter[];
  by: GeneratedBy | null;
  total: number;
  done: number;
  /** "outline", "chapter:5" (0-based), or null when everything is written. */
  next: string | null;
  retry: { step: string; attempt: number; of: number; waitSeconds: number } | null;
  lastError: { message: string; code: string | null; rateLimited: boolean } | null;
  updatedAt: string;
}

// ------------------------------------------------------------------------------------ progress

export interface SubjectProgressRow {
  subject: string;
  title: string;
  chapters: number;
  lessons: number;
  completed: number;
  percent: number;
}
export interface ChapterProgressRow {
  subject: string;
  chapter: string;
  academicYear: string | null;
  month: number | null;
  lessonCount: number;
  completedLessons: number[];
  startedLessons: number[];
  /** Lesson number → the step the learner stopped at inside it (only lessons left part-way). */
  positions: Record<string, number>;
  /** The first lesson not yet completed (1-based), or null when the chapter is finished. */
  nextLesson: number | null;
  completed: boolean;
  quiz: { best: number; last: number; attempts: number; total: number } | null;
}
export interface ClassProgress {
  slug: string;
  academicYear: string | null;
  month: number | null;
  percent: number;
  lessons: number;
  completed: number;
  subjects: SubjectProgressRow[];
  chapters: ChapterProgressRow[];
}
export interface QuizResult {
  correct: number;
  total: number;
  score: number;
  best: number;
  attempts: number;
  results: Array<{ correct: boolean; answer: string; explanation: string }>;
}
type Where = { class: string; subject: string; chapter: string };

/** The learner's next lesson, with its class and subject (GET /api/progress/continue). */
export interface ContinueLearning {
  class: { slug: string; title: string };
  subject: { key: string; title: string };
  chapter: { slug: string; title: string; number: number };
  lesson: number;
  lessonTitle: string;
  lessonCount: number;
  completedLessons: number;
  /** The step inside the lesson where the learner stopped (0 = its start). */
  position: number;
  academicYear: string | null;
  month: number | null;
  /** Nothing of it started yet: the button says Start, not Continue. */
  fresh?: boolean;
}

/** The dashboard: this month's progress, its subjects, recent chapters and where to continue (GET /api/progress/overview). */
export interface ProgressOverview {
  academicYear: string;
  month: number;
  /** "month": the subjects scheduled this month; "all": nothing is scheduled in it, so everything the learner can study. */
  scope: 'month' | 'all';
  monthProgress: { lessons: number; completed: number; percent: number };
  yearProgress: { lessons: number; completed: number; percent: number };
  subjects: Array<{
    class: { slug: string; title: string };
    subject: { key: string; title: string };
    academicYear: string | null;
    month: number | null;
    chapters: number;
    lessons: number;
    completed: number;
    percent: number;
    continue: ContinueLearning | null;
  }>;
  recent: Array<{
    class: { slug: string; title: string };
    subject: { key: string; title: string };
    chapter: { slug: string; title: string };
    academicYear: string | null;
    month: number | null;
    lessonCount: number;
    completedLessons: number;
    percent: number;
    nextLesson: number | null;
    lastAccessedAt: string | null;
  }>;
  continue: ContinueLearning | null;
}

export type LessonEvent = 'start' | 'position' | 'complete';

export const progressApi = {
  classes: () => api.get<Array<{ slug: string; classLevel: number; percent: number; lessons: number; completed: number }>>('/api/progress/classes'),
  /** Where to pick up (class, subject, chapter, lesson, step), or null. Optionally for one class, subject or month. */
  continue: (scope: { class?: string; subject?: string; academicYear?: string; month?: string } = {}) => api.get<ContinueLearning | null>('/api/progress/continue', { ...scope }),
  overview: (scope: { academicYear?: string; month?: string } = {}) => api.get<ProgressOverview>('/api/progress/overview', { ...scope }),
  class: (slug: string) => api.get<ClassProgress>(`/api/progress/classes/${encodeURIComponent(slug)}`),
  lesson: (where: Where, lesson: number, event: LessonEvent, extra: { position?: number; score?: number } = {}) =>
    api.post<{ lesson: number; completed: boolean; position: number; score: number | null; attempts: number; chapterCompleted: boolean; completedLessons: number; lessonCount: number }>('/api/progress/lessons', { ...where, lesson, event, ...extra }),
  quiz: (where: Where, answers: string[]) => api.post<QuizResult>('/api/progress/quiz', { ...where, answers }),
};
