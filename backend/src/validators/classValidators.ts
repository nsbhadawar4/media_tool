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

// ------------------------------------------------------------------------------------ generator

/** What the generator analyses (nothing is saved by these requests). */
export const briefSchema = z
  .object({
    classLevel,
    title,
    subtitle: subtitle.default(''),
    description: description.default(''),
    details: details.default(''),
    learningGoal: z.string().trim().max(1000).default(''),
    targetAge: z.string().trim().max(40).default(''),
    language: z.enum(CLASS_LANGUAGES).optional(),
    curriculumType: z.enum(CURRICULUM_TYPES).optional(),
    difficulty: z.enum(CLASS_DIFFICULTIES).optional(),
  })
  .strict();

const subjectRequest = z
  .object({
    key: subjectKey,
    title: z.string().trim().min(1).max(60),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    chapterCount: z.number().int().min(1).max(15).optional(),
  })
  .strict();

export const chaptersRequestSchema = z.object({ brief: briefSchema, subjects: z.array(subjectRequest).min(1, 'Choose at least one subject').max(20) }).strict();

export const resourcesQuerySchema = z
  .object({
    subject: z.string().trim().min(1).max(80),
    topic: z.string().trim().max(80).optional(),
    classLevel: classLevel.optional(),
  })
  .strict();

const text = (max: number, label: string) => z.string().trim().max(max, label + ' is too long');
const question = z.object({ prompt: text(500, 'A question').min(1), options: z.array(text(300, 'An option')).max(8).default([]), answer: text(300, 'An answer').default('') }).strict();
const https = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => /^https:\/\/[^\s]+$/i.test(u), 'Resource links must start with https://');

export const resourceSchema = z
  .object({
    title: text(200, 'A resource title').min(1),
    author: text(120, 'An author').nullable().default(null),
    source: text(60, 'A source').min(1),
    url: https,
    type: z.enum(['book', 'image', 'link']).default('link'),
    license: text(200, 'A licence').default(''),
    thumbnailUrl: https.nullable().default(null),
  })
  .strict();

export const chapterSchema = z
  .object({
    title: text(120, 'A chapter title').min(1, 'Chapter title is required'),
    description: text(500, 'A chapter description').default(''),
    objectives: z.array(text(300, 'An objective')).max(8).default([]),
    estimatedMinutes: z.number().int().min(0).max(100000).nullable().default(null),
    difficulty: z.enum(['easy', 'medium', 'hard']).nullable().default(null),
    lessons: z.array(z.object({ title: text(120, 'A lesson title').min(1), body: text(4000, 'A lesson').default('') }).strict()).max(20).default([]),
    activities: z
      .array(
        z
          .object({
            type: z.enum(['multiple-choice', 'fill-blank', 'match-pair', 'number-problems']),
            title: text(120, 'An activity title').min(1),
            instructions: text(500, 'Instructions').default(''),
            questions: z.array(question).max(20).default([]),
          })
          .strict(),
      )
      .max(8)
      .default([]),
    quiz: z.array(question).max(20).default([]),
  })
  .strict();

/** Saves a class's generated chapters (and chosen resources) for the subjects listed. */
export const saveCurriculumSchema = z
  .object({
    subjects: z
      .array(
        z
          .object({
            key: subjectKey,
            chapters: z.array(chapterSchema).max(20, 'A subject can have up to 20 chapters'),
            resources: z.array(resourceSchema).max(12).default([]),
          })
          .strict(),
      )
      .max(20)
      .superRefine((rows, ctx) => {
        const seen = new Set<string>();
        rows.forEach((r, i) => {
          if (seen.has(r.key)) ctx.addIssue({ code: 'custom', path: [i, 'key'], message: 'This subject is listed twice' });
          seen.add(r.key);
        });
      }),
  })
  .strict();
export type SaveCurriculumInput = z.infer<typeof saveCurriculumSchema>;
export const slugParamSchema = z.object({ slug: z.string().regex(/^class-(?:[1-9]|1[0-2])$/, 'Not found') }).strict();
export const classOrderSchema = z.object({ position: z.number().int().min(1).max(100) }).strict();

/** Uploaded images are served by name: 32 hex characters and .webp, nothing else. */
export const contentImageParamSchema = z.object({ name: z.string().regex(/^[a-f0-9]{32}\.webp$/, 'Not found') }).strict();
