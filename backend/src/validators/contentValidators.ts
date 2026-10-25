import { z } from 'zod';
import { CONTENT_TYPES, DIFFICULTIES, FIXED_CONTENT_TYPES, GAME_TYPES } from '../config/constants';
import { academicYearField, monthField, monthNeedsYear, scheduleBody, scheduleFilter } from './scheduleValidators';

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
  /** Arcade games and Kid Games: in the home page block or not. */
  landing: z.enum(['on', 'off']).optional(),
  featured: z.enum(['yes', 'no']).optional(),
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

/** An image an administrator uploaded (served by GET /api/content/images/:name). */
export const CONTENT_IMAGE_PATH = /^\/api\/content\/images\/[a-f0-9]{32}\.webp$/;
/** An entry's picture: a web link, or one of the uploaded images. */
export const imageRef = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => CONTENT_IMAGE_PATH.test(u) || /^https?:\/\/[^\s]+$/i.test(u), 'Upload an image or enter a link starting with https://')
  .refine((u) => CONTENT_IMAGE_PATH.test(u) || httpUrl.safeParse(u).success, 'Enter a full link, starting with https://');
export const subtitle = z.string().trim().max(60, 'Keep the display title to 60 characters');
export const details = z.string().trim().max(2000, 'Keep the description to 2000 characters');

const difficulty = z.enum(DIFFICULTIES);
const gameType = z.enum(GAME_TYPES);
const glyph = z.string().trim().max(12, 'Keep it short (12 characters)');

export const createContentSchema = z
  .object({
    type: z.enum(CONTENT_TYPES),
    /** Classes and class ↔ subject links get theirs from the class number / subject instead. */
    key: key.optional(),
    title,
    /** Classes only. */
    subtitle: subtitle.optional(),
    description: description.default(''),
    /** Classes only. */
    details: details.optional(),
    classLevel: classLevel.optional(),
    subject: key.optional(),
    thumbnailUrl: imageRef.nullable().optional(),
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
    // Dashboard blocks and header links are defined by code: switch, order and rename them instead.
    if (FIXED_CONTENT_TYPES.includes(v.type)) issue('type', 'Dashboard blocks and navigation links come from the app and can’t be added');
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
    if (v.type !== 'class' && (v.subtitle || v.details)) issue('subtitle', 'Only classes have a display title and details');
  });
export type CreateContentInput = z.infer<typeof createContentSchema>;

export const updateContentSchema = z
  .object({
    title: title.optional(),
    /** Classes only. */
    subtitle: subtitle.optional(),
    description: description.optional(),
    /** Classes only. */
    details: details.optional(),
    isEnabled: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    /** Feature sections, arcade games and Kid Games (checked per type by the controller). */
    showOnLanding: z.boolean().optional(),
    /** Arcade games and Kid Games. */
    featured: z.boolean().optional(),
    thumbnailUrl: imageRef.nullable().optional(),
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

/**
 * One change applied to many arcade games or Kid Games at once: either the ones picked by id, or
 * every live one in a class and/or subject ("Class 1 → disable all", "Hindi → enable all").
 */
export const bulkUpdateSchema = z
  .object({
    ids: z.array(objectId).min(1).max(500).optional(),
    scope: z
      .object({
        type: z.enum(['game', 'kid_game']),
        classLevel: classLevel.optional(),
        subject: key.optional(),
      })
      .strict()
      .optional(),
    patch: z
      .object({
        isEnabled: z.boolean().optional(),
        isVisible: z.boolean().optional(),
        showOnLanding: z.boolean().optional(),
        featured: z.boolean().optional(),
      })
      .strict()
      .refine((p) => Object.values(p).some((x) => x !== undefined), { message: 'Nothing to change' }),
  })
  .strict()
  .refine((v) => Boolean(v.ids) !== Boolean(v.scope), { message: 'Pick the entries, or a class / subject — one of the two' })
  .refine((v) => !v.scope || v.scope.type === 'kid_game' || (v.scope.classLevel === undefined && v.scope.subject === undefined), {
    message: 'Only Kid Games are grouped by class and subject',
  });
export type BulkUpdateInput = z.infer<typeof bulkUpdateSchema>;

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

export const createCourseSchema = z
  .object({ ...courseFields, ...scheduleBody })
  .strict()
  .superRefine((v, ctx) => monthNeedsYear(v, ctx));
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
    ...scheduleBody,
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
  ...scheduleFilter,
  sort: z.enum(['order', 'title', 'updated', 'created']).default('order'),
  ...pageParams,
});

/** Schedules several chapters at once (the way to map existing, unscheduled chapters). null clears. */
export const scheduleCoursesSchema = z
  .object({
    ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id')).min(1, 'Pick at least one course').max(200, 'Up to 200 at a time'),
    academicYear: academicYearField.nullable(),
    month: z.number().int().min(1, 'Choose a month from 1 to 12').max(12, 'Choose a month from 1 to 12').nullable().default(null),
  })
  .strict()
  .superRefine((v, ctx) => monthNeedsYear(v, ctx));
export type ScheduleCoursesInput = z.infer<typeof scheduleCoursesSchema>;

/** Learning statistics, for a year, a month, a class and a subject — any of them. */
export const courseStatsQuerySchema = z.object({ classLevel: classLevel.optional(), subject: key.optional(), academicYear: academicYearField.optional(), month: monthField.optional(), schedule: z.enum(['scheduled', 'unscheduled']).optional() });

export const courseSlugParamSchema = z.object({ slug: key });

/** Signed-in users' course list, optionally for one class and subject. */
export const publicCoursesQuerySchema = z.object({ classLevel: classLevel.optional(), subject: key.optional() });
