/**
 * Values a class's profile can take (Manage Courses stores them with a class). The course
 * generator's own vocabulary is in course.ts.
 */

export const CURRICULUM_TYPES = ['general', 'mathematics', 'science', 'language', 'competitive', 'skills', 'custom'] as const;
export type CurriculumType = (typeof CURRICULUM_TYPES)[number];

export const CLASS_LANGUAGES = ['english', 'hindi', 'bilingual', 'other'] as const;
export type ClassLanguage = (typeof CLASS_LANGUAGES)[number];

export const CLASS_DIFFICULTIES = ['beginner', 'elementary', 'intermediate', 'advanced'] as const;
export type ClassDifficulty = (typeof CLASS_DIFFICULTIES)[number];
