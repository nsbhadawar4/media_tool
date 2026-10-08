import { z } from 'zod';
import { CONTENT_TYPES, DIFFICULTIES, GAME_TYPES } from '../config/constants';

/**
 * Admin content management input. Every body schema is strict: a field the API doesn't take
 * (createdBy, source, archivedAt, role…) is refused rather than silently ignored.
 */

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
export const contentIdParamSchema = z.object({ id: objectId });

/** Code identifiers: lowercase letters, digits and hyphens. */
const key = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'Use lowercase letters, numbers and hyphens (max 63)');
const title = z.string().trim().min(1, 'Title is required').max(120, 'Title is too long');
const description = z.string().trim().max(500, 'Description is too long');
const classLevel = z.coerce.number().int().min(1).max(12);

const pageParams = {
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
};

/** live = everything not archived; active / disabled / hidden are subsets of live. */
const status = z.enum(['live', 'active', 'disabled', 'hidden', 'archived', 'all']).default('live');

export const listContentQuerySchema = z.object({
  type: z.enum(CONTENT_TYPES),
  search: z.string().trim().max(100).optional(),
  status,
  classLevel: classLevel.optional(),
  subject: key.optional(),
  sort: z.enum(['order', 'title', 'updated', 'created']).default('order'),
  ...pageParams,
});

/** Only web links: never javascript:, data: or anything else a browser would run. */
const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .url('Enter a full link, starting with https://')
  .refine((u) => /^https?:\/\//i.test(u), 'Links must start with http:// or https://');

const difficulty = z.enum(DIFFICULTIES);
const gameType = z.enum(GAME_TYPES);
const glyph = z.string().trim().max(12, 'Keep it short (12 characters)');

export const createContentSchema = z
  .object({
    type: z.enum(CONTENT_TYPES),
    /** Classes and class ↔ subject links get theirs from the class number / subject instead. */
    key: key.optional(),
    title,
    description: description.default(''),
    classLevel: classLevel.optional(),
    subject: key.optional(),
    thumbnailUrl: httpUrl.nullable().optional(),
    glyph: glyph.nullable().optional(),
    difficulty: difficulty.optional(),
    gameType: gameType.optional(),
    courseId: objectId.nullable().optional(),
    isEnabled: z.boolean().default(true),
    isVisible: z.boolean().default(true),
  })
  .strict()
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    const derivedKey = v.type === 'class' || v.type === 'class_subject';
    if (!derivedKey && !v.key) issue('key', 'Key is required');
    const needsClass = v.type === 'class' || v.type === 'class_subject' || v.type === 'kid_game';
    const needsSubject = v.type === 'class_subject' || v.type === 'kid_game';
    if (needsClass && v.classLevel === undefined) issue('classLevel', 'Choose a class');
    if (needsSubject && v.subject === undefined) issue('subject', 'Choose a subject');
    if (!needsClass && v.classLevel !== undefined) issue('classLevel', 'Only classes, class subjects and Kid Games have a class');
    if (!needsSubject && v.subject !== undefined) issue('subject', 'Only class subjects and Kid Games have a subject');
    if (v.type !== 'kid_game' && (v.difficulty || v.gameType || v.courseId)) issue('difficulty', 'Only Kid Games have a difficulty, game type or course');
    if (v.type !== 'subject' && v.glyph) issue('glyph', 'Only subjects have a glyph');
  });
export type CreateContentInput = z.infer<typeof createContentSchema>;

export const updateContentSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    isEnabled: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    thumbnailUrl: httpUrl.nullable().optional(),
    glyph: glyph.nullable().optional(),
    // Kid Games added in the admin panel only (a code game's are fixed by its content):
    classLevel: classLevel.optional(),
    subject: key.optional(),
    difficulty: difficulty.optional(),
    gameType: gameType.nullable().optional(),
    // Any Kid Game:
    courseId: objectId.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });
export type UpdateContentInput = z.infer<typeof updateContentSchema>;

export const moveSchema = z.object({ direction: z.enum(['up', 'down']) }).strict();

// ------------------------------------------------------------------------------------ courses

const lesson = z
  .object({
    title,
    body: z.string().max(10_000, 'Lesson text is too long').default(''),
    url: httpUrl.nullable().optional().transform((u) => u ?? null),
  })
  .strict();

const courseFields = {
  title,
  slug: key.optional(),
  summary: description.default(''),
  // A course belongs to a class and a subject that class offers (checked against the database).
  classLevel,
  subject: key,
  thumbnailUrl: httpUrl.nullable().optional(),
  difficulty: difficulty.nullable().optional(),
  ageGroup: z.string().trim().max(40, 'Keep the age group short').nullable().optional(),
  learningObjective: z.string().trim().max(1000, 'Learning objective is too long').default(''),
  lessons: z.array(lesson).max(50, 'A course can have at most 50 lessons').default([]),
  isEnabled: z.boolean().default(true),
  isVisible: z.boolean().default(true),
};

export const createCourseSchema = z.object(courseFields).strict();
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = z
  .object({
    title: title.optional(),
    slug: key.optional(),
    summary: description.optional(),
    classLevel: classLevel.optional(),
    subject: key.optional(),
    thumbnailUrl: httpUrl.nullable().optional(),
    difficulty: difficulty.nullable().optional(),
    ageGroup: z.string().trim().max(40, 'Keep the age group short').nullable().optional(),
    learningObjective: z.string().trim().max(1000, 'Learning objective is too long').optional(),
    lessons: z.array(lesson).max(50, 'A course can have at most 50 lessons').optional(),
    isEnabled: z.boolean().optional(),
    isVisible: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

export const listCoursesQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status,
  classLevel: classLevel.optional(),
  subject: key.optional(),
  sort: z.enum(['order', 'title', 'updated', 'created']).default('order'),
  ...pageParams,
});

export const courseSlugParamSchema = z.object({ slug: key });

/** Signed-in users' course list, optionally for one class and subject. */
export const publicCoursesQuerySchema = z.object({ classLevel: classLevel.optional(), subject: key.optional() });
