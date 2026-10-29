import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { Types, type FilterQuery, type PipelineStage } from 'mongoose';

import { ContentItem } from '../models/ContentItem';
import { ManualCourse, type IManualChapter, type IManualCourse } from '../models/ManualCourse';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { logActivity } from '../services/activityService';
import { ensureCatalogSeeded } from '../services/contentService';
import type { ActivityAction } from '../config/constants';
import { slugify } from '../validators/classValidators';
import type { CreateManualCourseInput, ListManualCoursesQuery, ManualChapterInput, UpdateManualCourseInput } from '../validators/manualCourseValidators';
import { findPublicClass } from './adminCurriculumController';

/**
 * Admin → Manual Courses: courses an administrator writes by hand — chapters, lessons and questions —
 * kept in their own collection (ManualCourse). Nothing here reads or writes the generated courses or
 * the AI Course Generator; the class and subject are the only things shared, and only read.
 *
 * Saving only ever changes the working copy. Publish copies it to `live` — what learners read — so a
 * published course's edits stay a draft until it is published again. Visibility is a switch on the
 * course itself and applies at once.
 *
 * Deleting moves a course to Manual Courses → Trash (restorable); only a course already in Trash can
 * be deleted for good, with DELETE typed.
 */

const userId = (req: Request) => new Types.ObjectId(req.user!.id);
const NOT_DELETED = { deletedAt: null };
const TRASHED = { deletedAt: { $ne: null } };

// ------------------------------------------------------------------------------------ class & subject

const liveFilter = { archivedAt: null, trashedAt: null };

/**
 * The class and subject a course is for, checked here — never trusted from the browser: the class must
 * exist and not be archived or in Trash, and offer the subject (its link, and the subject, live too).
 */
async function assertClassSubject(classLevel: number, subjectKey: string) {
  await ensureCatalogSeeded();
  const [cls, link, subject] = await Promise.all([
    ContentItem.findOne({ type: 'class', classLevel, ...liveFilter }),
    ContentItem.findOne({ type: 'class_subject', classLevel, subject: subjectKey, ...liveFilter }),
    ContentItem.findOne({ type: 'subject', key: subjectKey, ...liveFilter }),
  ]);
  if (!cls) throw AppError.badRequest(`There is no Class ${classLevel}`, [{ path: 'classLevel', message: 'Choose a class' }]);
  if (!link || !subject) throw AppError.badRequest(`${cls.title} does not offer this subject`, [{ path: 'subjectKey', message: 'Choose one of this class’s subjects' }]);
  return { cls, subject };
}

/** GET /manual-courses/options — the classes a course can be for, each with its own subjects. */
export const manualCourseOptions = asyncHandler(async (_req: Request, res: Response) => {
  await ensureCatalogSeeded();
  const [classes, links, subjects] = await Promise.all([
    ContentItem.find({ type: 'class', ...liveFilter }).sort({ classLevel: 1 }),
    ContentItem.find({ type: 'class_subject', ...liveFilter }).sort({ order: 1, _id: 1 }),
    ContentItem.find({ type: 'subject', ...liveFilter }),
  ]);
  const subjectByKey = new Map(subjects.map((s) => [s.key, s]));
  sendSuccess(res, {
    classes: classes.map((c) => ({
      level: c.classLevel!,
      title: c.title,
      subjects: links.filter((l) => l.classLevel === c.classLevel && l.subject && subjectByKey.has(l.subject)).map((l) => ({ key: l.subject!, title: subjectByKey.get(l.subject!)!.title })),
    })),
  });
});

// ------------------------------------------------------------------------------------ rules

interface Problem {
  path: string;
  message: string;
}

/**
 * What stops a course from being published: at least one published chapter with a published lesson;
 * every chapter and lesson titled; every question with its prompt and a valid answer.
 */
export function publishProblems(chapters: ManualChapterInput[] | IManualChapter[]): Problem[] {
  const problems: Problem[] = [];
  if (!chapters.length) problems.push({ path: 'chapters', message: 'Add at least one chapter' });
  else if (!chapters.some((c) => c.status === 'published' && c.lessons.some((l) => l.status === 'published'))) {
    problems.push({ path: 'chapters', message: 'Add at least one published chapter with a published lesson' });
  }
  chapters.forEach((c, ci) => {
    const at = `chapters.${ci}`;
    if (!c.title.trim()) problems.push({ path: `${at}.title`, message: 'Enter a chapter title' });
    c.lessons.forEach((l, li) => {
      const lat = `${at}.lessons.${li}`;
      if (!l.title.trim()) problems.push({ path: `${lat}.title`, message: 'Enter a lesson title' });
      l.questions.forEach((q, qi) => {
        const qat = `${lat}.questions.${qi}`;
        if (!q.prompt.trim()) problems.push({ path: `${qat}.prompt`, message: 'Enter the question' });
        if (q.type === 'mcq') {
          if (q.options.length !== 4 || q.options.some((o) => !o.trim())) problems.push({ path: `${qat}.options`, message: 'Fill in all four options' });
          else if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4) problems.push({ path: `${qat}.options`, message: 'The options must all be different' });
          else if (!q.options.includes(q.answer)) problems.push({ path: `${qat}.answer`, message: 'Choose the correct option' });
        } else if (q.type === 'true-false') {
          if (q.answer !== 'True' && q.answer !== 'False') problems.push({ path: `${qat}.answer`, message: 'Choose True or False' });
        } else if (!q.answer.trim()) problems.push({ path: `${qat}.answer`, message: 'Enter the expected answer' });
      });
    });
  });
  return problems;
}

function assertPublishable(chapters: ManualChapterInput[] | IManualChapter[]) {
  const problems = publishProblems(chapters);
  if (problems.length) throw new AppError('Finish the course before publishing it', 400, problems.slice(0, 50), 'MANUAL_COURSE_INCOMPLETE');
}

/** Answers kept to what each type allows (a true/false question has no options). */
function normalizeChapters(chapters: ManualChapterInput[]): ManualChapterInput[] {
  return chapters.map((c) => ({
    ...c,
    lessons: c.lessons.map((l) => ({
      ...l,
      questions: l.questions.map((q) => ({ ...q, options: q.type === 'mcq' ? q.options : [] })),
    })),
  }));
}

// ------------------------------------------------------------------------------------ helpers

const newUid = () => randomBytes(9).toString('base64url');

/** The same chapters with every part given a new id — for a duplicated course. */
function withNewUids(chapters: IManualChapter[]): IManualChapter[] {
  return chapters.map((c) => ({
    uid: newUid(),
    title: c.title,
    description: c.description,
    status: c.status,
    lessons: c.lessons.map((l) => ({
      uid: newUid(),
      title: l.title,
      description: l.description,
      content: l.content,
      status: l.status,
      questions: l.questions.map((q) => ({ uid: newUid(), type: q.type, prompt: q.prompt, options: [...q.options], answer: q.answer, explanation: q.explanation })),
    })),
  }));
}

/** An address for the course, unique among all manual courses (fixed once made, so links keep working). */
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title).slice(0, 80) || 'course';
  for (let n = 1; n < 1000; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await ManualCourse.exists({ slug }))) return slug;
  }
  return `${base}-${newUid()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')}`;
}

async function findCourse(id: string, filter: FilterQuery<IManualCourse> = NOT_DELETED) {
  const course = await ManualCourse.findOne({ _id: id, ...filter });
  if (!course) throw AppError.notFound('Manual course not found');
  return course;
}

/** The working copy as a live copy (same field order as the model's `live`, so they compare equal). */
const snapshot = (c: IManualCourse | { classLevel: number; subjectKey: string; title: string; description: string; chapters: IManualChapter[] }) => ({
  classLevel: c.classLevel,
  subjectKey: c.subjectKey,
  title: c.title,
  description: c.description,
  chapters: JSON.parse(JSON.stringify(c.chapters)) as IManualChapter[],
});

/** Published, with saved edits learners do not see yet. */
const hasPendingChanges = (c: IManualCourse) => c.status === 'published' && c.live !== null && JSON.stringify(snapshot(c)) !== JSON.stringify(snapshot(c.live));

const countsOf = (chapters: IManualChapter[]) => ({
  chapters: chapters.length,
  lessons: chapters.reduce((n, c) => n + c.lessons.length, 0),
  questions: chapters.reduce((n, c) => n + c.lessons.reduce((m, l) => m + l.questions.length, 0), 0),
});

async function titlesFor(levels: number[], subjects: string[]) {
  const [classes, subs] = await Promise.all([
    ContentItem.find({ type: 'class', classLevel: { $in: levels } }, { classLevel: 1, title: 1 }),
    ContentItem.find({ type: 'subject', key: { $in: subjects } }, { key: 1, title: 1 }),
  ]);
  return {
    classTitle: (level: number) => classes.find((c) => c.classLevel === level)?.title ?? `Class ${level}`,
    subjectTitle: (key: string) => subs.find((s) => s.key === key)?.title ?? key,
  };
}

async function serialize(course: IManualCourse) {
  const t = await titlesFor([course.classLevel], [course.subjectKey]);
  return {
    id: String(course._id),
    source: 'manual' as const,
    classLevel: course.classLevel,
    classTitle: t.classTitle(course.classLevel),
    subjectKey: course.subjectKey,
    subjectTitle: t.subjectTitle(course.subjectKey),
    title: course.title,
    description: course.description,
    slug: course.slug,
    status: course.status,
    isVisible: course.isVisible,
    revision: course.revision,
    pendingChanges: hasPendingChanges(course),
    chapters: course.chapters.map((c) => ({
      uid: c.uid,
      title: c.title,
      description: c.description,
      status: c.status,
      lessons: c.lessons.map((l) => ({
        uid: l.uid,
        title: l.title,
        description: l.description,
        content: l.content,
        status: l.status,
        questions: l.questions.map((q) => ({ uid: q.uid, type: q.type, prompt: q.prompt, options: [...q.options], answer: q.answer, explanation: q.explanation })),
      })),
    })),
    counts: countsOf(course.chapters),
    publishedAt: course.publishedAt,
    deletedAt: course.deletedAt,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}

function audit(req: Request, action: ActivityAction, course: IManualCourse, verb: string, metadata: Record<string, unknown> = {}) {
  return logActivity(req, {
    action,
    targetType: 'course',
    targetId: course._id,
    targetName: course.title,
    message: `${verb} manual course “${course.title}”`,
    metadata: { source: 'manual', classLevel: course.classLevel, subject: course.subjectKey, ...metadata },
  });
}

// ------------------------------------------------------------------------------------ list

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function listOf(req: Request, res: Response, trashed: boolean) {
  const q = req.query as unknown as ListManualCoursesQuery;
  const match: FilterQuery<IManualCourse> = trashed ? { ...TRASHED } : { ...NOT_DELETED };
  if (q.q) match.title = { $regex: escapeRegex(q.q), $options: 'i' };
  if (q.classLevel) match.classLevel = q.classLevel;
  if (q.subject) match.subjectKey = q.subject;
  if (q.status !== 'all') match.status = q.status;
  if (q.visibility !== 'all') match.isVisible = q.visibility === 'visible';
  const sort: Record<string, 1 | -1> =
    q.sort === 'title' ? { title: 1, _id: 1 } : q.sort === 'oldest' ? { [trashed ? 'deletedAt' : 'updatedAt']: 1, _id: 1 } : { [trashed ? 'deletedAt' : 'updatedAt']: -1, _id: -1 };
  // Counts are worked out in the database: a page of courses never brings their lesson texts along.
  const pipeline: PipelineStage[] = [
    { $match: match },
    { $sort: sort },
    { $skip: (q.page - 1) * q.limit },
    { $limit: q.limit },
    {
      $project: {
        classLevel: 1,
        subjectKey: 1,
        title: 1,
        slug: 1,
        status: 1,
        isVisible: 1,
        updatedAt: 1,
        createdAt: 1,
        deletedAt: 1,
        publishedAt: 1,
        pendingChanges: {
          $and: [
            { $eq: ['$status', 'published'] },
            { $ne: [{ classLevel: '$classLevel', subjectKey: '$subjectKey', title: '$title', description: '$description', chapters: '$chapters' }, '$live'] },
          ],
        },
        chapters: { $size: '$chapters' },
        lessons: { $sum: { $map: { input: '$chapters', as: 'c', in: { $size: '$$c.lessons' } } } },
        questions: {
          $sum: { $map: { input: '$chapters', as: 'c', in: { $sum: { $map: { input: '$$c.lessons', as: 'l', in: { $size: '$$l.questions' } } } } } },
        },
      },
    },
  ];
  const [rows, total] = await Promise.all([ManualCourse.aggregate(pipeline), ManualCourse.countDocuments(match)]);
  const t = await titlesFor([...new Set(rows.map((r) => r.classLevel as number))], [...new Set(rows.map((r) => r.subjectKey as string))]);
  sendSuccess(
    res,
    rows.map((r) => ({
      id: String(r._id),
      source: 'manual',
      classLevel: r.classLevel,
      classTitle: t.classTitle(r.classLevel),
      subjectKey: r.subjectKey,
      subjectTitle: t.subjectTitle(r.subjectKey),
      title: r.title,
      slug: r.slug,
      status: r.status,
      isVisible: r.isVisible,
      pendingChanges: Boolean(r.pendingChanges),
      counts: { chapters: r.chapters, lessons: r.lessons, questions: r.questions },
      publishedAt: r.publishedAt,
      deletedAt: r.deletedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    200,
    { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
  );
}

/** GET /manual-courses — manual courses only (never the generated ones), not in Trash. */
export const listManualCourses = asyncHandler(async (req: Request, res: Response) => listOf(req, res, false));

/** GET /manual-courses/trash — manual courses in Trash, most recently deleted first. */
export const listManualCourseTrash = asyncHandler(async (req: Request, res: Response) => listOf(req, res, true));

/** GET /manual-courses/stats — how many there are, for the list's summary. */
export const manualCourseStats = asyncHandler(async (_req: Request, res: Response) => {
  const [total, published, drafts, hidden, trashed] = await Promise.all([
    ManualCourse.countDocuments(NOT_DELETED),
    ManualCourse.countDocuments({ ...NOT_DELETED, status: 'published' }),
    ManualCourse.countDocuments({ ...NOT_DELETED, status: 'draft' }),
    ManualCourse.countDocuments({ ...NOT_DELETED, isVisible: false }),
    ManualCourse.countDocuments(TRASHED),
  ]);
  sendSuccess(res, { total, published, drafts, hidden, trashed });
});

// ------------------------------------------------------------------------------------ one course

/** GET /manual-courses/:id — one course in full (a course in Trash too, so it can be previewed). */
export const getManualCourse = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await serialize(await findCourse(String(req.params.id), {})));
});

/** POST /manual-courses — a new course (a draft unless published straight away, when it qualifies). */
export const createManualCourse = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateManualCourseInput;
  await assertClassSubject(body.classLevel, body.subjectKey);
  const chapters = normalizeChapters(body.chapters);
  const publish = body.status === 'published';
  if (publish) assertPublishable(chapters);
  const course = await ManualCourse.create({
    classLevel: body.classLevel,
    subjectKey: body.subjectKey,
    title: body.title,
    description: body.description,
    slug: await uniqueSlug(body.title),
    status: body.status,
    isVisible: body.isVisible,
    chapters,
    live: publish ? snapshot({ ...body, chapters } as Parameters<typeof snapshot>[0]) : null,
    publishedAt: publish ? new Date() : null,
    createdBy: userId(req),
    updatedBy: userId(req),
  });
  await audit(req, 'manual_course_created', course, 'Created', countsOf(course.chapters));
  sendSuccess(res, await serialize(course), 201, undefined, 'Course saved successfully.');
});

/**
 * PATCH /manual-courses/:id — saves the whole working copy (a draft: it may be incomplete). Learners keep
 * seeing the published copy until Publish. Refused (409) when it was saved elsewhere since this copy
 * was loaded. Visibility applies at once.
 */
export const updateManualCourse = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateManualCourseInput;
  const current = await findCourse(String(req.params.id));
  await assertClassSubject(body.classLevel, body.subjectKey);
  const chapters = normalizeChapters(body.chapters);
  const course = await ManualCourse.findOneAndUpdate(
    { _id: current._id, ...NOT_DELETED, revision: body.revision },
    {
      $set: { classLevel: body.classLevel, subjectKey: body.subjectKey, title: body.title, description: body.description, isVisible: body.isVisible, chapters, updatedBy: userId(req) },
      $inc: { revision: 1 },
    },
    { new: true, runValidators: true },
  );
  if (!course) throw new AppError('This course was changed somewhere else since you opened it. Reload it to see the latest version.', 409, undefined, 'MANUAL_COURSE_STALE');
  await audit(req, 'manual_course_updated', course, 'Updated', countsOf(course.chapters));
  sendSuccess(res, await serialize(course), 200, undefined, 'Course saved successfully.');
});

/**
 * Publish: checks the working copy and makes it the live copy (also when already published — that is
 * how saved edits reach learners). Unpublish: removes the live copy; the course is a draft again.
 */
async function setStatus(req: Request, res: Response, status: 'draft' | 'published') {
  const course = await findCourse(String(req.params.id));
  const changed = status === 'published' ? course.status !== 'published' || hasPendingChanges(course) : course.status !== 'draft';
  if (status === 'published') {
    await assertClassSubject(course.classLevel, course.subjectKey);
    assertPublishable(course.chapters);
  }
  if (changed) {
    course.status = status;
    course.live = status === 'published' ? snapshot(course) : null;
    if (status === 'published') course.publishedAt = new Date();
    course.updatedBy = userId(req);
    course.revision += 1;
    await course.save();
    await audit(req, status === 'published' ? 'manual_course_published' : 'manual_course_unpublished', course, status === 'published' ? 'Published' : 'Unpublished');
  }
  sendSuccess(res, await serialize(course), 200, undefined, status === 'published' ? 'Course published' : 'Course unpublished — it is a draft again');
}

/**
 * PATCH /manual-courses/:id/visibility — show or hide the course for learners, at once (not content:
 * it never publishes or discards edits).
 */
export const setManualCourseVisibility = asyncHandler(async (req: Request, res: Response) => {
  const course = await findCourse(String(req.params.id));
  const { isVisible } = req.body as { isVisible: boolean };
  if (course.isVisible !== isVisible) {
    course.isVisible = isVisible;
    course.updatedBy = userId(req);
    course.revision += 1;
    await course.save();
    await audit(req, 'manual_course_updated', course, isVisible ? 'Showed' : 'Hid', { isVisible });
  }
  sendSuccess(res, await serialize(course), 200, undefined, isVisible ? 'Course visible to learners' : 'Course hidden from learners');
});

/** POST /manual-courses/:id/publish */
export const publishManualCourse = asyncHandler(async (req: Request, res: Response) => setStatus(req, res, 'published'));
/** POST /manual-courses/:id/unpublish */
export const unpublishManualCourse = asyncHandler(async (req: Request, res: Response) => setStatus(req, res, 'draft'));

/** POST /manual-courses/:id/duplicate — a draft copy, with new ids for every part. */
export const duplicateManualCourse = asyncHandler(async (req: Request, res: Response) => {
  const source = await findCourse(String(req.params.id));
  const title = `Copy of ${source.title}`.slice(0, 160);
  const copy = await ManualCourse.create({
    classLevel: source.classLevel,
    subjectKey: source.subjectKey,
    title,
    description: source.description,
    slug: await uniqueSlug(title),
    status: 'draft',
    isVisible: source.isVisible,
    chapters: withNewUids(source.chapters),
    createdBy: userId(req),
    updatedBy: userId(req),
  });
  await audit(req, 'manual_course_duplicated', copy, 'Duplicated', { from: String(source._id) });
  sendSuccess(res, await serialize(copy), 201, undefined, 'Course duplicated as a draft');
});

// ------------------------------------------------------------------------------------ trash

/** DELETE /manual-courses/:id — to Manual Courses → Trash (learners stop seeing it; restorable). */
export const trashManualCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await findCourse(String(req.params.id));
  course.deletedAt = new Date();
  course.deletedBy = userId(req);
  await course.save();
  await audit(req, 'manual_course_trashed', course, 'Moved to Trash');
  sendSuccess(res, { id: String(course._id) }, 200, undefined, 'Course moved to Trash');
});

/** POST /manual-courses/:id/restore — back from Trash, as it was. */
export const restoreManualCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await findCourse(String(req.params.id), TRASHED);
  course.deletedAt = null;
  course.deletedBy = null;
  course.updatedBy = userId(req);
  await course.save();
  await audit(req, 'manual_course_restored', course, 'Restored');
  sendSuccess(res, await serialize(course), 200, undefined, 'Course restored');
});

/** DELETE /manual-courses/:id/permanent — only from Trash, with DELETE typed. Cannot be undone. */
export const deleteManualCourseForever = asyncHandler(async (req: Request, res: Response) => {
  const course = await findCourse(String(req.params.id), TRASHED);
  await ManualCourse.deleteOne({ _id: course._id, ...TRASHED });
  await audit(req, 'manual_course_permanently_deleted', course, 'Permanently deleted');
  sendSuccess(res, { id: String(course._id) }, 200, undefined, 'Course permanently deleted');
});

// ------------------------------------------------------------------------------------ learners

/** The subject, as this (public) class offers it to learners — or a 404. */
async function publicSubject(classLevel: number, subjectKey: string) {
  const [link, subject] = await Promise.all([
    ContentItem.findOne({ type: 'class_subject', classLevel, subject: subjectKey, ...liveFilter, isEnabled: true, isVisible: true }),
    ContentItem.findOne({ type: 'subject', key: subjectKey, ...liveFilter, isEnabled: true, isVisible: true }),
  ]);
  if (!link || !subject) throw AppError.notFound('Subject not found in this class');
  return subject;
}

const PUBLIC = { ...NOT_DELETED, status: 'published', isVisible: true, live: { $ne: null } };

/** A course as learners read it: its live copy's published chapters and lessons; no ids of ours, no authors. */
function publicCourse(course: IManualCourse) {
  const live = course.live!;
  const chapters = live.chapters
    .filter((c) => c.status === 'published')
    .map((c) => ({
      title: c.title,
      description: c.description,
      lessons: c.lessons
        .filter((l) => l.status === 'published')
        .map((l) => ({
          title: l.title,
          description: l.description,
          content: l.content,
          questions: l.questions.map((q) => ({ type: q.type, prompt: q.prompt, options: [...q.options], answer: q.answer, explanation: q.explanation })),
        })),
    }))
    .filter((c) => c.lessons.length > 0);
  return { slug: course.slug, title: live.title, description: live.description, updatedAt: course.publishedAt ?? course.updatedAt, chapters };
}

/** GET /api/content/classes/:slug/subjects/:subject/manual-courses — that subject's manual courses. */
export async function loadPublicManualCourses(slug: string, subjectKey: string) {
  const cls = await findPublicClass(slug);
  await publicSubject(cls.classLevel!, subjectKey);
  const courses = await ManualCourse.find({ ...PUBLIC, 'live.classLevel': cls.classLevel, 'live.subjectKey': subjectKey })
    .sort({ publishedAt: -1, _id: -1 })
    .limit(50);
  return (
    courses
      .map(publicCourse)
      .filter((c) => c.chapters.length > 0)
      .map((c) => ({
        slug: c.slug,
        title: c.title,
        description: c.description,
        chapters: c.chapters.length,
        lessons: c.chapters.reduce((n, ch) => n + ch.lessons.length, 0),
      }))
  );
}

export const publicManualCourses = asyncHandler(async (req: Request, res: Response) => {
  const data = await loadPublicManualCourses(String(req.params.slug), String(req.params.subject));
  res.setHeader('Cache-Control', 'no-cache');
  sendSuccess(res, data);
});

/** GET /api/content/classes/:slug/subjects/:subject/manual-courses/:course — one in full. */
export async function loadPublicManualCourse(slug: string, subjectKey: string, courseSlug: string) {
  const cls = await findPublicClass(slug);
  const subject = await publicSubject(cls.classLevel!, subjectKey);
  const course = await ManualCourse.findOne({ ...PUBLIC, 'live.classLevel': cls.classLevel, 'live.subjectKey': subject.key, slug: courseSlug });
  const view = course && publicCourse(course);
  if (!view || !view.chapters.length) throw AppError.notFound('Course not found');
  return { class: { slug: cls.key, title: cls.title, classLevel: cls.classLevel }, subject: { key: subject.key, title: subject.title }, course: view };
}

export const publicManualCourse = asyncHandler(async (req: Request, res: Response) => {
  const data = await loadPublicManualCourse(String(req.params.slug), String(req.params.subject), String(req.params.course));
  res.setHeader('Cache-Control', 'no-cache');
  sendSuccess(res, data);
});
