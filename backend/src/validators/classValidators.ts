import { z } from 'zod';
import { details, imageRef, subtitle } from './contentValidators';

/**
 * Manage Courses: a class with its subjects, edited as one thing. Classes are catalog entries
 * (type "class") and the subjects they offer are class ↔ subject links, so this is a view onto the
 * same data the rest of the content system manages — not a second store. Strict throughout.
 */

const classLevel = z.coerce.number().int('Use a whole number').min(1, 'Class numbers start at 1').max(12, 'Class numbers go up to 12');
export const classLevelParamSchema = z.object({ level: classLevel }).strict();

const title = z.string().trim().min(1, 'Class title is required').max(120, 'Class title is too long');
const description = z.string().trim().max(500, 'Keep the short description to 500 characters');
const subjectKey = z
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
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });
export type UpdateClassInput = z.infer<typeof updateClassSchema>;

export const classVisibilitySchema = z.object({ isVisible: z.boolean() }).strict();
export const classOrderSchema = z.object({ position: z.number().int().min(1).max(100) }).strict();

/** Uploaded images are served by name: 32 hex characters and .webp, nothing else. */
export const contentImageParamSchema = z.object({ name: z.string().regex(/^[a-f0-9]{32}\.webp$/, 'Not found') }).strict();
