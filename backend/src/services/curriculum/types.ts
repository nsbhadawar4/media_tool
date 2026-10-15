/**
 * The Course & Class Generator's vocabulary: what an administrator describes (ClassBrief), what the
 * generator suggests (subjects) and builds (chapters with lessons, practice and a quiz).
 */

export const CURRICULUM_TYPES = ['general', 'mathematics', 'science', 'language', 'competitive', 'skills', 'custom'] as const;
export type CurriculumType = (typeof CURRICULUM_TYPES)[number];

export const CLASS_LANGUAGES = ['english', 'hindi', 'bilingual', 'other'] as const;
export type ClassLanguage = (typeof CLASS_LANGUAGES)[number];

export const CLASS_DIFFICULTIES = ['beginner', 'elementary', 'intermediate', 'advanced'] as const;
export type ClassDifficulty = (typeof CLASS_DIFFICULTIES)[number];

/** Course difficulty, as the Course model stores it. */
export type ChapterDifficulty = 'easy' | 'medium' | 'hard';

/** Everything the administrator told us about the class. */
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
  /** Catalog key: an existing subject's ("math") or a new one made from the name. */
  key: string;
  title: string;
  description: string;
  glyph: string;
  difficulty: ChapterDifficulty;
  estimatedMinutes: number;
  chapterCount: number;
  activityCount: number;
  /** Why it was suggested, in words an administrator reads ("Found: plants, animals"). */
  reason: string;
}

export interface GeneratedQuestion {
  prompt: string;
  /** Choices to pick from; empty for a written answer. */
  options: string[];
  answer: string;
}

export type ActivityType = 'multiple-choice' | 'fill-blank' | 'match-pair' | 'number-problems';

export interface GeneratedActivity {
  type: ActivityType;
  title: string;
  instructions: string;
  questions: GeneratedQuestion[];
}

export interface GeneratedLesson {
  title: string;
  body: string;
}

export interface GeneratedChapter {
  title: string;
  description: string;
  objectives: string[];
  estimatedMinutes: number;
  difficulty: ChapterDifficulty;
  lessons: GeneratedLesson[];
  activities: GeneratedActivity[];
  quiz: GeneratedQuestion[];
}

/** The subject a chapter set is built for: a suggestion, or one the administrator added. */
export interface SubjectRequest {
  key: string;
  title: string;
  difficulty?: ChapterDifficulty;
  chapterCount?: number;
}

/**
 * Anything that can turn a brief into subjects and chapters. The template generator is the default
 * and needs nothing external; an optional AI-backed generator can be registered later (see index.ts).
 */
export interface CurriculumGenerator {
  readonly name: string;
  suggestSubjects(brief: ClassBrief): Promise<SubjectSuggestion[]>;
  buildChapters(brief: ClassBrief, subject: SubjectRequest): Promise<GeneratedChapter[]>;
}
