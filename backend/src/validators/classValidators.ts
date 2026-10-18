import { z } from 'zod';
import { details, imageRef, subtitle } from './contentValidators';
import { CLASS_DIFFICULTIES, CLASS_LANGUAGES, CURRICULUM_TYPES } from '../services/curriculum/types';

/**
 * Manage Courses: a class with its subjects, edited as one thing. Classes are catalog entries
 * (type "class") and the subjects they offer are class ↔ subject links, so this is a view onto the
 * same data the rest of the content system manages — not a second store. Strict throughout.
 */

const classLevel = z.coerce.number().int('Use a whole number').min(1, 'Class numbers start at 1').max(12, 'Class numbers go up to 12');
export const classLevelParamSchema = z.object({ level: classLevel }).strict();

const title = z.string().trim().min(1, 'Class title is required').max(120, 'Class title is too long');
const description = z.string().trim().max(500, 'Keep the short description to 500 characters');
export const subjectKey = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'Invalid subject');

/** One subject row in the editor; its position in the list is its order in the class. */
const subjectRow = z
  .object({
    /** An existing subject. Left out for a new one, whose key is made from its name. */
    key: subjectKey.optional(),
    title: z.string().trim().min(1, 'Subject name is required').max(60, 'Subject name is too long'),
    description: z.string().trim().max(500, 'Subject description is too long').default(''),
    glyph: z.string().trim().max(12, 'Keep the subject mark short (12 characters)').nullable().optional(),
    /** Listed in this class (hidden subjects stay linked, just not shown). */
    isVisible: z.boolean().default(true),
    /** This subject's difficulty and expected time in this class. */
    difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
    estimatedMinutes: z.number().int().min(0).max(100000).nullable().optional(),
  })
  .strict();

const subjects = z
  .array(subjectRow)
  .max(20, 'A class can offer up to 20 subjects')
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, i) => {
      const id = row.key ?? slugify(row.title);
      if (!id) ctx.addIssue({ code: 'custom', path: [i, 'title'], message: 'Use letters or numbers in the subject name' });
      else if (seen.has(id)) ctx.addIssue({ code: 'custom', path: [i, 'title'], message: 'This subject is already in the list' });
      seen.add(id);
    });
  });

/** A subject name as a key: "Computer Science" → "computer-science". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/** What the Course & Class Generator records about a class. */
export const profileSchema = z
  .object({
    learningGoal: z.string().trim().max(1000, 'Keep the learning goal to 1000 characters').default(''),
    targetAge: z.string().trim().max(40, 'Keep the target age short').default(''),
    language: z.enum(CLASS_LANGUAGES).nullable().default(null),
    curriculumType: z.enum(CURRICULUM_TYPES).nullable().default(null),
    difficulty: z.enum(CLASS_DIFFICULTIES).nullable().default(null),
  })
  .strict();

/**
 * shared (default, the class editor): a subject's name and description are the shared subject's,
 * changed everywhere. class (the generator): existing subjects are left as they are and the
 * description is this class's own, kept on its link.
 */
const subjectMode = z.enum(['shared', 'class']).default('shared');

export const listClassesQuerySchema = z.object({ status: z.enum(['live', 'archived', 'all']).default('live') }).strict();

export const createClassSchema = z
  .object({
    classLevel,
    title,
    subtitle: subtitle.default(''),
    description: description.default(''),
    details: details.default(''),
    image: imageRef.nullable().default(null),
    isVisible: z.boolean().default(true),
    /** 1-based place among the classes; the end when left out. */
    position: z.number().int().min(1).max(100).optional(),
    subjects: subjects.default([]),
    subjectMode,
    profile: profileSchema.nullable().optional(),
    /** A draft is shown only in Manage Courses until it is published. */
    status: z.enum(['draft', 'published']).default('published'),
  })
  .strict();
export type CreateClassInput = z.infer<typeof createClassSchema>;

/** The class number is fixed once created: games, links and every learner's progress hang off it. */
export const updateClassSchema = z
  .object({
    title: title.optional(),
    subtitle: subtitle.optional(),
    description: description.optional(),
    details: details.optional(),
    image: imageRef.nullable().optional(),
    isVisible: z.boolean().optional(),
    position: z.number().int().min(1).max(100).optional(),
    /** The full list, in order: subjects left out are taken off this class (their links archived). */
    subjects: subjects.optional(),
    subjectMode,
    profile: profileSchema.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });
export type UpdateClassInput = z.infer<typeof updateClassSchema>;

export const classVisibilitySchema = z.object({ isVisible: z.boolean() }).strict();
export const classStatusSchema = z.object({ status: z.enum(['draft', 'published']) }).strict();
export const duplicateClassSchema = z.object({ classLevel: classLevel.optional() }).strict();

const classSlug = z.string().regex(/^class-(?:[1-9]|1[0-2])$/, 'Not found');
export const slugParamSchema = z.object({ slug: classSlug }).strict();
/** One subject of one class: both come from the address, and the server checks they belong together. */
export const classSubjectParamSchema = z.object({ slug: classSlug, subject: subjectKey }).strict();
/** One chapter of one subject of one class, by their addresses. */
export const classChapterParamSchema = z.object({ slug: classSlug, subject: subjectKey, chapter: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'Not found') }).strict();
export const classOrderSchema = z.object({ position: z.number().int().min(1).max(100) }).strict();

/** Uploaded images are served by name: 32 hex characters and .webp, nothing else. */
export const contentImageParamSchema = z.object({ name: z.string().regex(/^[a-f0-9]{32}\.webp$/, 'Not found') }).strict();
