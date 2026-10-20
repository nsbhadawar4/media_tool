import { z } from 'zod';
import { MANUAL_QUESTION_TYPES } from '../models/ManualCourse';
import { subjectKey } from './classValidators';

/**
 * Admin → Manual Courses. A draft may be incomplete (untitled chapters, unanswered questions); the
 * course itself always needs its class, subject and title. Publishing checks the rest on the server
 * (adminManualCourseController.publishProblems), whatever the browser says.
 */
export const MANUAL_LIMITS = { chapters: 50, lessons: 50, questions: 50 } as const;

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Not found');
const partUid = z.string().regex(/^[A-Za-z0-9_-]{6,64}$/, 'Invalid id');
const text = (max: number) => z.string().max(max, `At most ${max} characters`).default('');
const status = z.enum(['draft', 'published']).default('published');

const question = z
  .object({
    uid: partUid,
    type: z.enum(MANUAL_QUESTION_TYPES),
    prompt: text(2000),
    options: z.array(z.string().max(300, 'At most 300 characters')).max(4, 'At most four options').default([]),
    answer: text(1000),
    explanation: text(2000),
  })
  .strict();

const lesson = z
  .object({
    uid: partUid,
    title: text(160),
    description: text(1000),
    content: text(20000),
    status,
    questions: z.array(question).max(MANUAL_LIMITS.questions, `At most ${MANUAL_LIMITS.questions} questions in a lesson`).default([]),
  })
  .strict();

const chapter = z
  .object({
    uid: partUid,
    title: text(160),
    description: text(1000),
    status,
    lessons: z.array(lesson).max(MANUAL_LIMITS.lessons, `At most ${MANUAL_LIMITS.lessons} lessons in a chapter`).default([]),
  })
  .strict();

export type ManualChapterInput = z.infer<typeof chapter>;

const courseFields = {
  classLevel: z.number({ message: 'Choose a class' }).int().min(1, 'Choose a class').max(12, 'Choose a class'),
  subjectKey: z.string({ message: 'Choose a subject' }).trim().min(1, 'Choose a subject').pipe(subjectKey),
  title: z.string({ message: 'Enter a title' }).trim().min(1, 'Enter a title').max(160, 'At most 160 characters'),
  description: text(2000),
  isVisible: z.boolean().default(true),
  chapters: z.array(chapter).max(MANUAL_LIMITS.chapters, `At most ${MANUAL_LIMITS.chapters} chapters`).default([]),
};

/** Every part of a course has its own id — a paste or a duplicate never brings one along twice. */
function uniqueUids(body: { chapters: ManualChapterInput[] }, ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  const check = (id: string, path: (string | number)[]) => {
    if (seen.has(id)) ctx.addIssue({ code: 'custom', path, message: 'This part is listed twice' });
    seen.add(id);
  };
  body.chapters.forEach((c, ci) => {
    check(c.uid, ['chapters', ci, 'uid']);
    c.lessons.forEach((l, li) => {
      check(l.uid, ['chapters', ci, 'lessons', li, 'uid']);
      l.questions.forEach((q, qi) => check(q.uid, ['chapters', ci, 'lessons', li, 'questions', qi, 'uid']));
    });
  });
}

export const createManualCourseSchema = z
  .object({ ...courseFields, status: z.enum(['draft', 'published']).default('draft') })
  .strict()
  .superRefine(uniqueUids);
export type CreateManualCourseInput = z.infer<typeof createManualCourseSchema>;

/** A save sends the whole course, and the revision it was based on (an older one is refused). */
export const updateManualCourseSchema = z
  .object({ ...courseFields, revision: z.number().int().min(1) })
  .strict()
  .superRefine(uniqueUids);
export type UpdateManualCourseInput = z.infer<typeof updateManualCourseSchema>;

export const manualCourseIdParamSchema = z.object({ id: objectId }).strict();

export const listManualCoursesQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(''),
    classLevel: z.coerce.number().int().min(1).max(12).optional(),
    subject: subjectKey.optional(),
    status: z.enum(['all', 'draft', 'published']).default('all'),
    visibility: z.enum(['all', 'visible', 'hidden']).default('all'),
    sort: z.enum(['recent', 'oldest', 'title']).default('recent'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type ListManualCoursesQuery = z.infer<typeof listManualCoursesQuerySchema>;

/** Permanent delete asks for the word itself, on the server too — not just a button. */
export const permanentDeleteManualCourseSchema = z.object({ confirm: z.literal('DELETE', { message: 'Type DELETE to confirm' }) }).strict();

/** Learners: a manual course by its address under its class and subject. */
export const publicManualCourseParamSchema = z
  .object({
    slug: z.string().regex(/^class-(?:[1-9]|1[0-2])$/, 'Not found'),
    subject: subjectKey,
    course: z.string().regex(/^[a-z0-9][a-z0-9-]{0,90}$/, 'Not found'),
  })
  .strict();
export const publicManualCoursesParamSchema = publicManualCourseParamSchema.omit({ course: true });
