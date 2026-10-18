import type { Request, Response } from 'express';
import { Types } from 'mongoose';

import { Course } from '../models/Course';
import { CourseProgress } from '../models/CourseProgress';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { getPublicCatalog, isPairOpen } from '../services/contentService';
import { findPublicChapter } from './adminCurriculumController';

/**
 * Signed-in learners' course progress: lessons started and completed, chapter quizzes (marked here,
 * on the server, which alone holds the quiz answers) and how far through each class they are. Only
 * published, visible chapters count — the same ones the class pages show.
 */

const userId = (req: Request) => new Types.ObjectId(req.user!.id);

/** Lessons of the chapters learners can open, per class (counts only — lesson content isn't read). */
async function publicChapters(classLevel?: number) {
  const catalog = await getPublicCatalog();
  const classes = catalog.classes.filter((c) => c.classLevel !== null && c.isEnabled && c.isVisible && (classLevel === undefined || c.classLevel === classLevel));
  const levels = classes.map((c) => c.classLevel!);
  const chapters = await Course.find({ classLevel: { $in: levels }, archivedAt: null, isEnabled: true, isVisible: true, draft: { $ne: true } }, { slug: 1, classLevel: 1, subject: 1, 'lessons._id': 1 }).lean();
  return { classes, chapters: chapters.filter((c) => c.subject && isPairOpen(catalog, c.classLevel!, c.subject, true)) };
}

function summarise(chapters: Awaited<ReturnType<typeof publicChapters>>['chapters'], records: Array<{ chapterId: Types.ObjectId; lessons: Array<{ lessonId: Types.ObjectId; completedAt: Date | null }> }>) {
  const byChapter = new Map(records.map((r) => [String(r.chapterId), r]));
  let lessons = 0;
  let completed = 0;
  for (const c of chapters) {
    const ids = new Set(c.lessons.map((l) => String(l._id)));
    lessons += ids.size;
    const r = byChapter.get(String(c._id));
    if (r) completed += r.lessons.filter((l) => l.completedAt && ids.has(String(l.lessonId))).length;
  }
  return { lessons, completed, percent: lessons ? Math.round((completed / lessons) * 100) : 0 };
}

/** GET /api/progress/classes — progress in every class the learner can see. */
export const classesProgress = asyncHandler(async (req: Request, res: Response) => {
  const { classes, chapters } = await publicChapters();
  const records = await CourseProgress.find({ userId: userId(req) }, { chapterId: 1, lessons: 1 }).lean();
  sendSuccess(
    res,
    classes.map((c) => ({ slug: c.key, classLevel: c.classLevel, ...summarise(chapters.filter((x) => x.classLevel === c.classLevel), records) })),
  );
});

/** GET /api/progress/classes/:slug — one class: the whole, and each chapter's lessons (by number) and quiz. */
export const classProgress = asyncHandler(async (req: Request, res: Response) => {
  const level = Number(/^class-(\d{1,2})$/.exec(String(req.params.slug))?.[1]);
  const { classes, chapters } = await publicChapters(level);
  if (!classes.length) throw AppError.notFound('Class not found');
  const records = await CourseProgress.find({ userId: userId(req), classLevel: level }).lean();
  const byChapter = new Map(records.map((r) => [String(r.chapterId), r]));
  sendSuccess(res, {
    slug: req.params.slug,
    ...summarise(chapters, records),
    chapters: chapters.map((c) => {
      const r = byChapter.get(String(c._id));
      const numberOf = new Map(c.lessons.map((l, i) => [String(l._id), i + 1]));
      const done = (r?.lessons ?? []).filter((l) => l.completedAt && numberOf.has(String(l.lessonId))).map((l) => numberOf.get(String(l.lessonId))!);
      const started = (r?.lessons ?? []).filter((l) => numberOf.has(String(l.lessonId))).map((l) => numberOf.get(String(l.lessonId))!);
      return {
        subject: c.subject,
        chapter: c.slug,
        lessonCount: c.lessons.length,
        completedLessons: done.sort((a, b) => a - b),
        startedLessons: started.sort((a, b) => a - b),
        completed: c.lessons.length > 0 && done.length === c.lessons.length,
        quiz: r?.quiz ? { best: r.quiz.best, last: r.quiz.last, attempts: r.quiz.attempts, total: r.quiz.total } : null,
      };
    }),
  });
});

/**
 * The learner's record for this chapter, created on first use. A lesson page can report twice at once
 * (refresh, two tabs): both upserts may race on the unique index, so a duplicate-key loser just reads it.
 */
async function recordFor(req: Request, course: { _id: Types.ObjectId; classLevel: number | null; subject: string | null }) {
  const filter = { userId: userId(req), chapterId: course._id };
  const create = () =>
    CourseProgress.findOneAndUpdate(filter, { $setOnInsert: { ...filter, classLevel: course.classLevel, subject: course.subject, lessons: [], quiz: null } }, { upsert: true, new: true });
  try {
    return await create();
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    return create();
  }
}

/** POST /api/progress/lessons — a lesson started or completed. Atomic updates, so simultaneous reports never conflict. */
export const lessonProgress = asyncHandler(async (req: Request, res: Response) => {
  const { class: slug, subject, chapter, lesson, event } = req.body as { class: string; subject: string; chapter: string; lesson: number; event: 'start' | 'complete' };
  const { course } = await findPublicChapter(slug, subject, chapter);
  const target = course.lessons[lesson - 1];
  if (!target) throw AppError.notFound('Lesson not found in this chapter');
  const { _id } = await recordFor(req, course);
  const now = new Date();
  await CourseProgress.updateOne({ _id, 'lessons.lessonId': { $ne: target._id } }, { $push: { lessons: { lessonId: target._id, startedAt: now, completedAt: event === 'complete' ? now : null } } });
  if (event === 'complete') {
    await CourseProgress.updateOne({ _id, lessons: { $elemMatch: { lessonId: target._id, completedAt: null } } }, { $set: { 'lessons.$.completedAt': now } });
  }
  const record = (await CourseProgress.findById(_id, { lessons: 1 }).lean())!;
  const ids = new Set(course.lessons.map((l) => String(l._id)));
  const done = record.lessons.filter((l) => l.completedAt && ids.has(String(l.lessonId))).length;
  sendSuccess(res, { lesson, completed: Boolean(record.lessons.find((l) => String(l.lessonId) === String(target._id))?.completedAt), chapterCompleted: done === ids.size, completedLessons: done, lessonCount: ids.size });
});

/** Answers compare without case, extra spaces or a final full stop ("Delhi." = "delhi"). */
const norm = (s: string) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.।!]+$/, '').trim();

/** POST /api/progress/quiz — marks a chapter's quiz here (the answers never leave the server before) and keeps the best score. */
export const quizProgress = asyncHandler(async (req: Request, res: Response) => {
  const { class: slug, subject, chapter, answers } = req.body as { class: string; subject: string; chapter: string; answers: string[] };
  const { course } = await findPublicChapter(slug, subject, chapter);
  const quiz = course.quiz ?? [];
  if (!quiz.length) throw AppError.badRequest('This chapter has no quiz');
  if (answers.length !== quiz.length) throw AppError.badRequest(`Answer all ${quiz.length} questions`, [{ path: 'answers', message: 'Wrong number of answers' }]);
  const results = quiz.map((q, i) => ({ correct: norm(answers[i] ?? '') === norm(q.answer), answer: q.answer, explanation: q.explanation ?? '' }));
  const correct = results.filter((r) => r.correct).length;
  const score = Math.round((correct / quiz.length) * 100);
  const { _id } = await recordFor(req, course);
  // One atomic update: two submissions at once both count, and the best score is never lost.
  const record = (await CourseProgress.findOneAndUpdate(
    { _id },
    [{ $set: { quiz: { best: { $max: [score, { $ifNull: ['$quiz.best', 0] }] }, last: score, attempts: { $add: [{ $ifNull: ['$quiz.attempts', 0] }, 1] }, total: quiz.length, at: '$$NOW' } } }],
    { new: true, projection: { quiz: 1 } },
  ).lean())!;
  sendSuccess(res, { correct, total: quiz.length, score, best: record.quiz!.best, attempts: record.quiz!.attempts, results });
});
