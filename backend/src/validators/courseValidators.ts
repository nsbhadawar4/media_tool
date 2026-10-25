import { z } from 'zod';
import { LANGUAGES, LEVELS, LIMITS, QUESTION_TYPES, questionProblems } from '../services/curriculum/course';
import { subjectKey } from './classValidators';
import { monthNeedsYear, scheduleBody } from './scheduleValidators';

/**
 * The AI Course Generator and the course editor (Admin → Manage Courses). Generation requests are
 * checked here before anything is asked of a provider; what an administrator saves is checked here
 * too — every question has to agree with its type (an mcq's answer is one of its options…) — so
 * nothing inconsistent is ever stored, whoever (or whatever) wrote it.
 */

const classLevel = z.coerce.number().int().min(1, 'Class 1–12').max(12, 'Class 1–12');
const text = (max: number, label: string) => z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);
const optional = (max: number) => z.string().trim().max(max).default('');
const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');

export const levelSubjectParamSchema = z.object({ level: classLevel, subject: subjectKey }).strict();

export const courseBriefSchema = z
  .object({
    classLevel,
    subject: z.object({ key: subjectKey, title: text(60, 'Subject') }).strict(),
    title: text(120, 'Course title'),
    description: optional(500),
    language: z.enum(LANGUAGES),
    level: z.enum(LEVELS),
    chapters: z.coerce.number().int().min(1).max(LIMITS.chapters, `At most ${LIMITS.chapters} chapters`),
    lessonsPerChapter: z.coerce.number().int().min(1).max(LIMITS.lessons, `At most ${LIMITS.lessons} lessons per chapter`),
    questionsPerLesson: z.coerce.number().int().min(1).max(LIMITS.questions, `At most ${LIMITS.questions} questions per lesson`),
    prompt: optional(2000),
    goals: optional(1000),
    include: optional(1000),
    avoid: optional(1000),
    instructions: optional(1000),
  })
  .strict();

const engine = z.enum(['ai', 'template']);
const seed = z.string().max(40).default('');
const outline = z
  .object({
    classLevel: z.number().int().optional(),
    subject: z.string().max(60).optional(),
    title: text(120, 'Course title'),
    description: z.string().trim().max(500),
    objectives: z.array(z.string().trim().max(300)).max(10),
    chapters: z.array(z.object({ title: text(120, 'Chapter title'), description: z.string().trim().max(500), lessonTitles: z.array(text(120, 'Lesson title')).min(1).max(LIMITS.lessons) }).strict()).min(1).max(LIMITS.chapters),
  })
  .strict();

export const generateOutlineSchema = z.object({ brief: courseBriefSchema, engine }).strict();
/** A generation saved as a job (resumable): the same brief, and whether it is a new version of an existing course. */
export const startGenerationJobSchema = z.object({ brief: courseBriefSchema, engine, mode: z.enum(['new', 'new-version']).default('new') }).strict();
export const generationJobParamSchema = z.object({ id: objectId }).strict();
export const currentGenerationJobQuerySchema = z.object({ classLevel, subject: subjectKey }).strict();
export const generateChapterSchema = z
  .object({ brief: courseBriefSchema, engine, outline, index: z.number().int().min(0).max(LIMITS.chapters - 1), seed })
  .strict()
  .refine((v) => v.index < v.outline.chapters.length, { message: 'No such chapter in the outline', path: ['index'] })
  // A chapter's lesson count follows the plan the administrator sees (which may have been edited).
  .transform((v) => ({ ...v, brief: { ...v.brief, lessonsPerChapter: v.outline.chapters[v.index]!.lessonTitles.length } }));
export const generateLessonSchema = z
  .object({
    brief: courseBriefSchema,
    engine,
    chapter: z.object({ title: text(120, 'Chapter title'), description: z.string().trim().max(500), lessonTitles: z.array(text(120, 'Lesson title')).min(1).max(LIMITS.lessons) }).strict(),
    index: z.number().int().min(0).max(LIMITS.lessons - 1),
    seed,
  })
  .strict()
  .refine((v) => v.index < v.chapter.lessonTitles.length, { message: 'No such lesson in the chapter', path: ['index'] });
export const generateQuestionsSchema = z
  .object({
    brief: courseBriefSchema,
    engine,
    chapterTitle: text(120, 'Chapter title'),
    lessonIndex: z.number().int().min(0).max(LIMITS.lessons - 1),
    lesson: z.object({ title: text(120, 'Lesson title'), explanation: z.string().max(6000) }).strict(),
    count: z.number().int().min(1).max(LIMITS.questions),
    seed,
  })
  .strict();

// ------------------------------------------------------------------------------------ saving

const question = z
  .object({
    type: z.enum(QUESTION_TYPES),
    prompt: text(500, 'Question'),
    options: z.array(text(300, 'Option')).max(8).default([]),
    answer: text(300, 'Answer'),
    difficulty: z.enum(['easy', 'medium', 'hard']).nullable().default(null),
    explanation: z.string().trim().max(500).default(''),
  })
  .strict()
  .superRefine((q, ctx) => {
    for (const problem of questionProblems(q, 'question')) ctx.addIssue({ code: 'custom', message: problem.replace(/^question: /, '') });
  });

const lesson = z
  .object({
    id: objectId.optional(),
    title: text(120, 'Lesson title'),
    explanation: z.string().max(10_000).default(''),
    examples: z.array(text(500, 'Example')).max(12).default([]),
    keyPoints: z.array(text(300, 'Key point')).max(12).default([]),
    questions: z.array(question).max(LIMITS.questions * 2).default([]),
    practice: z.array(question).max(10).default([]),
    estimatedMinutes: z.number().int().min(0).max(1000).nullable().default(null),
  })
  .strict();

const chapter = z
  .object({
    id: objectId.optional(),
    title: text(120, 'Chapter title'),
    description: z.string().trim().max(500).default(''),
    /** The chapter's closing summary. */
    summary: z.string().trim().max(1500).default(''),
    objectives: z.array(text(300, 'Objective')).max(10).default([]),
    difficulty: z.enum(['easy', 'medium', 'hard']).nullable().default(null),
    /** Draft: admins only. Published: learners see it. Hidden: published but not shown. */
    status: z.enum(['draft', 'published', 'hidden']),
    /** When in the academic year it is taught. Left out = unchanged; null = not scheduled. */
    ...scheduleBody,
    lessons: z.array(lesson).max(20).default([]),
    quiz: z.array(question).max(30).default([]),
  })
  .strict()
  .superRefine((c, ctx) => monthNeedsYear(c, ctx));

/**
 * Saving a course (one subject of one class):
 *  - new          a first course for the subject — refused (409) if the subject already has chapters;
 *  - new-version  a new version of an existing course, saved as drafts that replace the earlier
 *                 generated chapters only when published;
 *  - edit         the course as it stands: chapters with an id are updated in place, new ones added,
 *                 and chapters left out are archived (restorable).
 */
export const saveCourseSchema = z
  .object({
    mode: z.enum(['new', 'new-version', 'edit']),
    subjectTitle: text(60, 'Subject').optional(),
    course: z
      .object({
        title: text(120, 'Course title'),
        description: z.string().trim().max(500).default(''),
        objectives: z.array(text(300, 'Objective')).max(10).default([]),
        language: z.enum(LANGUAGES).nullable().default(null),
        level: z.enum(LEVELS).nullable().default(null),
      })
      .strict(),
    chapters: z.array(chapter).max(50, 'A course can have at most 50 chapters'),
    /** Who wrote it: the generator's label is kept with what is saved. */
    source: z.object({ kind: z.enum(['ai', 'template', 'manual']), provider: z.string().max(40).nullable().default(null), model: z.string().max(80).nullable().default(null) }).strict().default({ kind: 'manual', provider: null, model: null }),
    publish: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode !== 'edit') {
      if (!v.chapters.length) ctx.addIssue({ code: 'custom', path: ['chapters'], message: 'Add at least one chapter' });
      v.chapters.forEach((c, i) => {
        if (c.id || c.lessons.some((l) => l.id)) ctx.addIssue({ code: 'custom', path: ['chapters', i, 'id'], message: 'A new course has no existing chapters' });
      });
    }
    const ids = v.chapters.map((c) => c.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['chapters'], message: 'A chapter is listed twice' });
  });
export type SaveCourseInput = z.infer<typeof saveCourseSchema>;
