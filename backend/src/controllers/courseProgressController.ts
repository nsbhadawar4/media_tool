import type { Request, Response } from 'express';
import { Types } from 'mongoose';

import { Course } from '../models/Course';
import { CourseProgress } from '../models/CourseProgress';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { getPublicCatalog, isPairOpen } from '../services/contentService';
import { academicYearOf } from '../services/academicCalendar';
import { sameSlot } from '../services/courseSchedule';
import { findPublicChapter } from './adminCurriculumController';

/**
 * Signed-in learners' course progress: lessons started and completed, where they stopped inside a
 * lesson, chapter quizzes (marked here, on the server, which alone holds the quiz answers) and how far
 * through each class, subject and month they are. Only published, visible chapters count — the same
 * ones the class pages show. The learner is always the session's user; no request names one.
 */

const userId = (req: Request) => new Types.ObjectId(req.user!.id);

type Schedule = { academicYear?: string; month?: number; schedule?: 'unscheduled' };
const scheduleOf = (req: Request) => req.query as unknown as Schedule;

/** A chapter is in the schedule asked for: one academic year (and a month), or the unscheduled ones. */
const inSchedule = (c: { academicYear?: string | null; month?: number | null }, q: Schedule) =>
  q.schedule === 'unscheduled' ? !c.academicYear : q.academicYear ? c.academicYear === q.academicYear && (q.month === undefined || c.month === q.month) : true;

/** Lessons of the chapters learners can open, per class (counts only — lesson content isn't read). */
async function publicChapters(classLevel?: number) {
  const catalog = await getPublicCatalog();
  const classes = catalog.classes.filter((c) => c.classLevel !== null && c.isEnabled && c.isVisible && (classLevel === undefined || c.classLevel === classLevel));
  const levels = classes.map((c) => c.classLevel!);
  const chapters = await Course.find(
    { classLevel: { $in: levels }, archivedAt: null, isEnabled: true, isVisible: true, draft: { $ne: true } },
    { slug: 1, title: 1, order: 1, classLevel: 1, subject: 1, academicYear: 1, month: 1, estimatedMinutes: 1, 'lessons._id': 1, 'lessons.title': 1 },
  ).lean();
  return { catalog, classes, chapters: chapters.filter((c) => c.subject && isPairOpen(catalog, c.classLevel!, c.subject, true)) };
}
type PublicChapter = Awaited<ReturnType<typeof publicChapters>>['chapters'][number];
type Record_ = { chapterId: Types.ObjectId; lessons: Array<{ lessonId: Types.ObjectId; completedAt: Date | null; position?: number }>; updatedAt?: Date; lastAccessedAt?: Date };

function summarise(chapters: PublicChapter[], records: Record_[]) {
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

/** Chapters taught in the same slot (year + month, or all unscheduled together), in subject order: the numbering learners see. */
const siblingsOf = (chapters: PublicChapter[], c: PublicChapter) =>
  chapters.filter((x) => x.classLevel === c.classLevel && x.subject === c.subject && sameSlot(x, c)).sort((a, b) => a.order - b.order);

/** First lesson of the chapter the learner has not completed (0-based), or -1. */
function nextLessonIndex(chapter: PublicChapter, record: Record_ | undefined): number {
  const done = new Set((record?.lessons ?? []).filter((l) => l.completedAt).map((l) => String(l.lessonId)));
  return chapter.lessons.findIndex((l) => !done.has(String(l._id)));
}

/** "Continue": the chapter, lesson and in-lesson step to pick up, with class and subject so it never loses its context. */
function continueTarget(c: PublicChapter, record: Record_ | undefined, ctx: { classes: Array<{ key: string; title: string; classLevel: number | null }>; chapters: PublicChapter[]; subjects: Array<{ key: string; title: string }> }) {
  const next = nextLessonIndex(c, record);
  if (next === -1) return null;
  const cls = ctx.classes.find((x) => x.classLevel === c.classLevel)!;
  const subject = ctx.subjects.find((x) => x.key === c.subject);
  const lesson = c.lessons[next]!;
  const stored = record?.lessons.find((l) => String(l.lessonId) === String(lesson._id));
  const done = (record?.lessons ?? []).filter((l) => l.completedAt && c.lessons.some((x) => String(x._id) === String(l.lessonId))).length;
  return {
    class: { slug: cls.key, title: cls.title },
    subject: { key: c.subject!, title: subject?.title ?? c.subject! },
    chapter: { slug: c.slug, title: c.title, number: siblingsOf(ctx.chapters, c).findIndex((x) => String(x._id) === String(c._id)) + 1 },
    lesson: next + 1,
    lessonTitle: lesson.title,
    lessonCount: c.lessons.length,
    completedLessons: done,
    /** The step inside the lesson where the learner stopped (0 = the start). */
    position: stored && !stored.completedAt ? (stored.position ?? 0) : 0,
    academicYear: c.academicYear ?? null,
    month: c.month ?? null,
  };
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

/**
 * GET /api/progress/continue — where to pick up: the chapter the learner touched last that is still
 * open to them (published, visible, in a visible class and subject), and its first lesson not yet
 * completed. Optional ?class, ?subject and a schedule narrow it to one class, subject or month — so a
 * subject card resumes that subject's own lesson (falling back to the first unfinished chapter of it,
 * even one not started). Null when there is nothing to continue.
 */
export const continueLearning = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as unknown as Schedule & { class?: string; subject?: string };
  const level = q.class ? Number(/^class-(\d{1,2})$/.exec(q.class)?.[1]) : undefined;
  const { classes, chapters, catalog } = await publicChapters(level);
  const scoped = chapters.filter((c) => (!q.subject || c.subject === q.subject) && inSchedule(c, q));
  const records = await CourseProgress.find({ userId: userId(req), chapterId: { $in: scoped.map((c) => c._id) } }, { chapterId: 1, lessons: 1, updatedAt: 1, lastAccessedAt: 1 })
    .sort({ updatedAt: -1 })
    .limit(25)
    .lean();
  const ctx = { classes, chapters, subjects: catalog.subjects };
  const byId = new Map(scoped.map((c) => [String(c._id), c]));
  for (const r of records) {
    const chapter = byId.get(String(r.chapterId));
    if (!chapter || !chapter.lessons.length) continue; // hidden, archived or deleted since: never suggested
    const target = continueTarget(chapter, r, ctx);
    if (target) return sendSuccess(res, target);
  }
  // Scoped to a subject or month and the learner has finished everything they touched: offer the next unfinished chapter.
  if (q.subject || q.academicYear || q.schedule) {
    const touched = new Map((await CourseProgress.find({ userId: userId(req), chapterId: { $in: scoped.map((c) => c._id) } }, { chapterId: 1, lessons: 1 }).lean()).map((r) => [String(r.chapterId), r]));
    for (const c of [...scoped].sort((a, b) => (a.academicYear ?? '~').localeCompare(b.academicYear ?? '~') || (a.month ?? 99) - (b.month ?? 99) || a.order - b.order)) {
      if (!c.lessons.length) continue;
      const target = continueTarget(c, touched.get(String(c._id)), ctx);
      if (target) return sendSuccess(res, { ...target, fresh: !touched.has(String(c._id)) });
    }
  }
  sendSuccess(res, null);
});

/**
 * GET /api/progress/classes/:slug — one class: the whole, each chapter's lessons (by number) and quiz,
 * and the progress of each subject. With a schedule (?academicYear[&month] or ?schedule=unscheduled) only
 * that month's chapters count, so a month's percentage is that month's lessons and nothing else.
 */
export const classProgress = asyncHandler(async (req: Request, res: Response) => {
  const level = Number(/^class-(\d{1,2})$/.exec(String(req.params.slug))?.[1]);
  const q = scheduleOf(req);
  const { classes, chapters: all, catalog } = await publicChapters(level);
  if (!classes.length) throw AppError.notFound('Class not found');
  const chapters = all.filter((c) => inSchedule(c, q));
  const records = await CourseProgress.find({ userId: userId(req), classLevel: level }).lean();
  const byChapter = new Map(records.map((r) => [String(r.chapterId), r]));
  const subjects = [...new Set(chapters.map((c) => c.subject!))].map((key) => {
    const own = chapters.filter((c) => c.subject === key);
    return { subject: key, title: catalog.subjects.find((s) => s.key === key)?.title ?? key, chapters: own.length, ...summarise(own, records) };
  });
  sendSuccess(res, {
    slug: req.params.slug,
    academicYear: q.academicYear ?? null,
    month: q.month ?? null,
    ...summarise(chapters, records),
    subjects,
    chapters: chapters.map((c) => {
      const r = byChapter.get(String(c._id));
      const numberOf = new Map(c.lessons.map((l, i) => [String(l._id), i + 1]));
      const done = (r?.lessons ?? []).filter((l) => l.completedAt && numberOf.has(String(l.lessonId))).map((l) => numberOf.get(String(l.lessonId))!);
      const started = (r?.lessons ?? []).filter((l) => numberOf.has(String(l.lessonId))).map((l) => numberOf.get(String(l.lessonId))!);
      // Where the learner stopped inside each unfinished lesson (lesson number → step), so reopening resumes there.
      const positions: Record<string, number> = {};
      for (const l of r?.lessons ?? []) if (!l.completedAt && l.position && numberOf.has(String(l.lessonId))) positions[String(numberOf.get(String(l.lessonId)))] = l.position;
      const nextIndex = nextLessonIndex(c, r);
      return {
        subject: c.subject,
        chapter: c.slug,
        academicYear: c.academicYear ?? null,
        month: c.month ?? null,
        lessonCount: c.lessons.length,
        completedLessons: done.sort((a, b) => a - b),
        startedLessons: started.sort((a, b) => a - b),
        positions,
        nextLesson: nextIndex === -1 ? null : nextIndex + 1,
        completed: c.lessons.length > 0 && done.length === c.lessons.length,
        quiz: r?.quiz ? { best: r.quiz.best, last: r.quiz.last, attempts: r.quiz.attempts, total: r.quiz.total } : null,
      };
    }),
  });
});

/**
 * GET /api/progress/overview — the dashboard: this academic month's progress and subjects (or, when
 * nothing is scheduled in it yet, everything the learner can study), the chapters they touched most
 * recently, and where to continue. Every figure is counted from the records, none is stored.
 */
export const progressOverview = asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();
  const q = req.query as unknown as { academicYear?: string; month?: number };
  const academicYear = q.academicYear ?? academicYearOf(now);
  const month = q.month ?? now.getMonth() + 1;
  const { classes, chapters, catalog } = await publicChapters();
  const records = await CourseProgress.find({ userId: userId(req) }, { chapterId: 1, lessons: 1, updatedAt: 1, lastAccessedAt: 1 }).sort({ updatedAt: -1 }).lean();
  const byChapter = new Map(records.map((r) => [String(r.chapterId), r]));
  const ctx = { classes, chapters, subjects: catalog.subjects };

  const thisMonth = chapters.filter((c) => c.academicYear === academicYear && c.month === month);
  const inYear = chapters.filter((c) => c.academicYear === academicYear);
  const scope: 'month' | 'all' = thisMonth.length ? 'month' : 'all';
  const shown = scope === 'month' ? thisMonth : chapters;

  const groups = new Map<string, PublicChapter[]>();
  for (const c of shown) groups.set(`${c.classLevel}|${c.subject}`, [...(groups.get(`${c.classLevel}|${c.subject}`) ?? []), c]);
  const subjects = [...groups.values()]
    .map((own) => {
      const first = own[0]!;
      const cls = classes.find((x) => x.classLevel === first.classLevel)!;
      return {
        class: { slug: cls.key, title: cls.title },
        subject: { key: first.subject!, title: catalog.subjects.find((s) => s.key === first.subject)?.title ?? first.subject! },
        academicYear: scope === 'month' ? academicYear : null,
        month: scope === 'month' ? month : null,
        chapters: own.length,
        ...summarise(own, records),
        continue: (() => {
          const hit = [...own].sort((a, b) => a.order - b.order).map((c) => ({ c, t: continueTarget(c, byChapter.get(String(c._id)), ctx) })).find((x) => x.t);
          return hit?.t ?? null;
        })(),
      };
    })
    // Subjects the learner has started come first, then by class and name.
    .sort((a, b) => Number(b.completed > 0) - Number(a.completed > 0) || a.class.slug.localeCompare(b.class.slug, undefined, { numeric: true }) || a.subject.title.localeCompare(b.subject.title));

  const open = new Map(chapters.map((c) => [String(c._id), c]));
  const recent = records
    .filter((r) => open.has(String(r.chapterId)))
    .slice(0, 5)
    .map((r) => {
      const c = open.get(String(r.chapterId))!;
      const cls = classes.find((x) => x.classLevel === c.classLevel)!;
      const s = summarise([c], [r]);
      return {
        class: { slug: cls.key, title: cls.title },
        subject: { key: c.subject!, title: catalog.subjects.find((x) => x.key === c.subject)?.title ?? c.subject! },
        chapter: { slug: c.slug, title: c.title },
        academicYear: c.academicYear ?? null,
        month: c.month ?? null,
        lessonCount: s.lessons,
        completedLessons: s.completed,
        percent: s.percent,
        nextLesson: (() => {
          const i = nextLessonIndex(c, r);
          return i === -1 ? null : i + 1;
        })(),
        lastAccessedAt: r.lastAccessedAt ?? r.updatedAt ?? null,
      };
    });

  let resume = null;
  for (const r of records) {
    const c = open.get(String(r.chapterId));
    const target = c && c.lessons.length ? continueTarget(c, r, ctx) : null;
    if (target) {
      resume = target;
      break;
    }
  }
  // Everything started is finished: suggest the next unfinished chapter instead of nothing.
  let fresh = false;
  if (!resume) {
    for (const c of [...shown].sort((a, b) => (a.academicYear ?? '~').localeCompare(b.academicYear ?? '~') || (a.month ?? 99) - (b.month ?? 99) || a.order - b.order)) {
      const target = c.lessons.length ? continueTarget(c, byChapter.get(String(c._id)), ctx) : null;
      if (target) {
        resume = target;
        fresh = !byChapter.has(String(c._id));
        break;
      }
    }
  }
  sendSuccess(res, { academicYear, month, scope, monthProgress: summarise(thisMonth, records), yearProgress: summarise(inYear, records), subjects, recent, continue: resume ? { ...resume, fresh } : null });
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

/**
 * POST /api/progress/lessons — a lesson started, left part-way (`position`), or completed (with the
 * learner's score). Saved the moment it happens, never at the end of a course. Atomic updates, so
 * simultaneous reports never conflict, and one record per user and chapter however often it is opened.
 */
export const lessonProgress = asyncHandler(async (req: Request, res: Response) => {
  const { class: slug, subject, chapter, lesson, event, position, score } = req.body as {
    class: string;
    subject: string;
    chapter: string;
    lesson: number;
    event: 'start' | 'position' | 'complete';
    position?: number;
    score?: number;
  };
  const { course } = await findPublicChapter(slug, subject, chapter);
  const target = course.lessons[lesson - 1];
  if (!target) throw AppError.notFound('Lesson not found in this chapter');
  const { _id } = await recordFor(req, course);
  const now = new Date();
  await CourseProgress.updateOne(
    { _id, 'lessons.lessonId': { $ne: target._id } },
    { $push: { lessons: { lessonId: target._id, startedAt: now, completedAt: event === 'complete' ? now : null, position: 0, attempts: 0, score: null, lastAccessedAt: now } } },
  );
  const mine = { arrayFilters: [{ 'l.lessonId': target._id }] };
  if (event === 'complete') {
    await CourseProgress.updateOne({ _id, lessons: { $elemMatch: { lessonId: target._id, completedAt: null } } }, { $set: { 'lessons.$.completedAt': now } });
    await CourseProgress.updateOne(
      { _id },
      { $set: { 'lessons.$[l].position': 0, 'lessons.$[l].lastAccessedAt': now }, $inc: { 'lessons.$[l].attempts': 1 }, ...(score !== undefined ? { $max: { 'lessons.$[l].score': score } } : {}) },
      mine,
    );
  } else {
    await CourseProgress.updateOne(
      { _id },
      // A step is only remembered for a lesson still being learned (a finished one reopens from its start).
      { $set: { 'lessons.$[l].lastAccessedAt': now, ...(event === 'position' ? { 'lessons.$[l].position': position ?? 0 } : {}) } },
      event === 'position' ? { arrayFilters: [{ 'l.lessonId': target._id, 'l.completedAt': null }] } : mine,
    );
  }
  await CourseProgress.updateOne({ _id }, { $set: { lastLessonId: target._id, lastAccessedAt: now } });
  const record = (await CourseProgress.findById(_id, { lessons: 1 }).lean())!;
  const ids = new Set(course.lessons.map((l) => String(l._id)));
  const done = record.lessons.filter((l) => l.completedAt && ids.has(String(l.lessonId))).length;
  const mineNow = record.lessons.find((l) => String(l.lessonId) === String(target._id));
  sendSuccess(res, {
    lesson,
    completed: Boolean(mineNow?.completedAt),
    position: mineNow?.completedAt ? 0 : (mineNow?.position ?? 0),
    score: mineNow?.score ?? null,
    attempts: mineNow?.attempts ?? 0,
    chapterCompleted: done === ids.size,
    completedLessons: done,
    lessonCount: ids.size,
  });
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
