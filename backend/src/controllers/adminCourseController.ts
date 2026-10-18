import type { Request, Response } from 'express';
import { Types, type ClientSession } from 'mongoose';

import { ContentItem, type IContentItem } from '../models/ContentItem';
import { Course, type ICourse, type IContentSource } from '../models/Course';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ensureCatalogSeeded, invalidateCatalog, nextOrder } from '../services/contentService';
import { classSubjectKey } from '../services/learningStructure';
import {
  AiProviderError,
  GenerationValidationError,
  engineStatus,
  generateChapter,
  generateLesson,
  generateOutline,
  generateQuestions,
  type CourseBrief,
  type CourseOutline,
  type Engine,
} from '../services/curriculum';
import { auditItem } from './adminContentController';
import { findClass, uid } from './adminClassController';
import { chapterSlug, publishDraftChapters, serializeChapter } from './adminCurriculumController';
import { slugify } from '../validators/classValidators';
import { inTransaction } from '../services/transaction';
import type { SaveCourseInput } from '../validators/courseValidators';

/**
 * Admin → Manage Courses: the AI Course Generator and the course editor. A course is one subject
 * of one class (Class 1 → Hindi); its chapters are Course documents in that class and subject, and
 * its details live on the class ↔ subject link.
 *
 * Generating saves nothing — it returns validated content for the administrator to review and edit.
 * Saving stores it as drafts (or publishes it, when asked); an existing course is never replaced
 * without the administrator choosing a new version, and nothing is ever deleted: chapters an edit
 * leaves out are archived, and a new version archives the earlier generated chapters only once it
 * is published.
 */

// ------------------------------------------------------------------------------------ generation

/** Provider and validation failures as clear, safe API errors (never a key, a stack or a raw reply). */
export function generationError(err: unknown): never {
  if (err instanceof AiProviderError) {
    const status = { not_configured: 503, timeout: 504, rate_limited: 429, refused: 422, truncated: 422, malformed: 502, auth: 502, upstream: 502 }[err.code];
    // A rate limit says how long to wait (when the provider did), so the admin page can retry on time.
    const details = err.code === 'rate_limited' ? { retryAfterSeconds: err.retryAfterMs ? Math.ceil(err.retryAfterMs / 1000) : null } : undefined;
    throw new AppError(err.message, status, details, `AI_${err.code.toUpperCase()}`);
  }
  if (err instanceof GenerationValidationError) throw new AppError('The generated content did not pass validation, so nothing was used. Please regenerate.', 422, err.problems.slice(0, 10).map((message) => ({ path: 'content', message })), 'AI_INVALID');
  throw err;
}

export const courseEngine = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, engineStatus());
});

export const generateCourseOutline = asyncHandler(async (req: Request, res: Response) => {
  const { brief, engine } = req.body as { brief: CourseBrief; engine: Engine };
  try {
    sendSuccess(res, await generateOutline(brief, engine));
  } catch (err) {
    generationError(err);
  }
});

export const generateCourseChapter = asyncHandler(async (req: Request, res: Response) => {
  const { brief, engine, outline, index, seed } = req.body as { brief: CourseBrief; engine: Engine; outline: CourseOutline; index: number; seed: string };
  try {
    sendSuccess(res, await generateChapter(brief, outline, index, engine, seed));
  } catch (err) {
    generationError(err);
  }
});

export const generateCourseLesson = asyncHandler(async (req: Request, res: Response) => {
  const { brief, engine, chapter, index, seed } = req.body as { brief: CourseBrief; engine: Engine; chapter: { title: string; description: string; lessonTitles: string[] }; index: number; seed: string };
  try {
    sendSuccess(res, await generateLesson({ ...brief, lessonsPerChapter: chapter.lessonTitles.length }, chapter, index, engine, seed));
  } catch (err) {
    generationError(err);
  }
});

export const generateCourseQuestions = asyncHandler(async (req: Request, res: Response) => {
  const { brief, engine, chapterTitle, lessonIndex, lesson, count, seed } = req.body as {
    brief: CourseBrief;
    engine: Engine;
    chapterTitle: string;
    lessonIndex: number;
    lesson: { title: string; explanation: string };
    count: number;
    seed: string;
  };
  try {
    sendSuccess(res, await generateQuestions(brief, { chapterTitle, lessonIndex, lesson }, count, engine, seed));
  } catch (err) {
    generationError(err);
  }
});

// ------------------------------------------------------------------------------------ reading

/** The class in the address (Classes 1–5 are seeded on first use, as everywhere in Manage Courses). */
async function classFor(req: Request) {
  await ensureCatalogSeeded();
  return findClass(Number(req.params.level));
}

const statusOf = (c: ICourse) => (c.draft ? 'draft' : c.isVisible ? 'published' : 'hidden');

async function courseOf(cls: IContentItem, subjectKey: string) {
  const level = cls.classLevel!;
  const [subject, link, chapters] = await Promise.all([
    ContentItem.findOne({ type: 'subject', key: subjectKey }),
    ContentItem.findOne({ type: 'class_subject', classLevel: level, subject: subjectKey, archivedAt: null }),
    Course.find({ classLevel: level, subject: subjectKey, archivedAt: null }).sort({ order: 1, _id: 1 }),
  ]);
  return {
    class: { level, slug: cls.key, title: cls.title, status: cls.status === 'draft' ? 'draft' : 'published', isVisible: cls.isVisible && cls.isEnabled },
    subject: { key: subjectKey, title: subject?.title ?? subjectKey, glyph: subject?.glyph ?? null, exists: Boolean(subject && !subject.archivedAt) },
    /** The class offers the subject (and whether learners can see it there). */
    offered: Boolean(link),
    isVisible: link?.isVisible ?? false,
    course: {
      title: link?.course?.title || (subject ? `${subject.title} — ${cls.title}` : ''),
      description: link?.description ?? '',
      objectives: link?.course?.objectives ?? [],
      language: link?.course?.language ?? null,
      level: link?.course?.level ?? null,
      source: link?.course?.source ?? null,
    },
    counts: {
      chapters: chapters.length,
      published: chapters.filter((c) => statusOf(c) === 'published').length,
      drafts: chapters.filter((c) => c.draft).length,
      hidden: chapters.filter((c) => statusOf(c) === 'hidden').length,
    },
    chapters: chapters.map((c) => ({ ...serializeChapter(c, 'admin'), status: statusOf(c) })),
  };
}

export const getCourse = asyncHandler(async (req: Request, res: Response) => {
  const cls = await classFor(req);
  sendSuccess(res, await courseOf(cls, String(req.params.subject)));
});

// ------------------------------------------------------------------------------------ saving

type Audit = () => Promise<unknown>;

/**
 * The class offers the subject: link it (creating the subject if it is new), bringing back an
 * archived link. Writes go in the save's transaction; audit entries are returned, to be written
 * only once it has committed.
 */
async function ensureLink(req: Request, cls: IContentItem, key: string, title: string | undefined, session: ClientSession | null, audits: Audit[]): Promise<IContentItem> {
  const level = cls.classLevel!;
  let subject = await ContentItem.findOne({ type: 'subject', key }).session(session);
  if (!subject) {
    if (!title) throw AppError.badRequest(`There is no subject “${key}”`, [{ path: 'subjectTitle', message: 'Name the new subject' }]);
    if (slugify(title) !== key) throw AppError.badRequest('The subject name and its key do not match', [{ path: 'subjectTitle', message: 'Mismatched subject' }]);
    const [created] = await ContentItem.create([{ type: 'subject', key, title, description: '', order: await nextOrder({ type: 'subject' }), source: 'admin', createdBy: uid(req), updatedBy: uid(req) }], { session });
    subject = created!;
    audits.push(() => auditItem(req, 'content_created', created!, 'Created'));
  } else if (subject.archivedAt) {
    subject.archivedAt = null;
    subject.updatedBy = uid(req);
    await subject.save({ session });
  }
  let link = await ContentItem.findOne({ type: 'class_subject', classLevel: level, subject: key }).session(session);
  if (!link) {
    const [added] = await ContentItem.create(
      [
        {
          type: 'class_subject',
          key: classSubjectKey(level, key),
          title: `Class ${level} · ${subject.title}`,
          classLevel: level,
          subject: key,
          order: await nextOrder({ type: 'class_subject', classLevel: level, archivedAt: null }),
          isVisible: true,
          source: 'admin',
          createdBy: uid(req),
          updatedBy: uid(req),
        },
      ],
      { session },
    );
    link = added!;
    audits.push(() => auditItem(req, 'content_created', added!, 'Added'));
  } else if (link.archivedAt) {
    link.archivedAt = null;
    link.order = await nextOrder({ type: 'class_subject', classLevel: level, archivedAt: null });
  }
  return link;
}

type ChapterInput = SaveCourseInput['chapters'][number];

function chapterFields(c: ChapterInput, existing: ICourse | null) {
  const lessons = c.lessons.map((l) => {
    // A lesson keeps its id across edits (progress is recorded against it); an unknown id is not trusted.
    const keep = l.id && existing?.lessons.some((x) => String(x._id) === l.id);
    return {
      ...(keep ? { _id: new Types.ObjectId(l.id) } : {}),
      title: l.title,
      body: l.explanation,
      url: null,
      examples: l.examples,
      keyPoints: l.keyPoints,
      questions: l.questions,
      practice: l.practice,
      estimatedMinutes: l.estimatedMinutes,
    };
  });
  const minutes = c.lessons.reduce((n, l) => n + (l.estimatedMinutes ?? 0), 0);
  return {
    title: c.title,
    summary: c.description,
    recap: c.summary,
    objectives: c.objectives,
    learningObjective: c.objectives[0] ?? '',
    difficulty: c.difficulty,
    estimatedMinutes: minutes ? minutes + (c.quiz.length ? 10 : 0) : (existing?.estimatedMinutes ?? null),
    lessons,
    quiz: c.quiz,
  };
}

const stateOf = (status: ChapterInput['status']) => ({ draft: status === 'draft', isVisible: status === 'published' });

/**
 * Saves a course — all of it or none of it: every write happens in one transaction, so a failure
 * part-way (the database going away, a bad record) leaves the course exactly as it was.
 */
export const saveCourse = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as SaveCourseInput;
  const subjectKey = String(req.params.subject);
  const cls = await classFor(req);
  if (cls.archivedAt) throw AppError.conflict('Restore this class before changing its courses');
  const level = cls.classLevel!;

  const outcome = await inTransaction(async (session) => {
    const audits: Audit[] = [];
    const existing = await Course.find({ classLevel: level, subject: subjectKey, archivedAt: null }).sort({ order: 1, _id: 1 }).session(session);
    // Duplicate protection: a first course can't be saved over one that exists.
    if (input.mode === 'new' && existing.length) {
      const subject = await ContentItem.findOne({ type: 'subject', key: subjectKey });
      throw new AppError(`A ${subject?.title ?? subjectKey} course already exists for ${cls.title}.`, 409, { chapters: existing.length }, 'COURSE_EXISTS');
    }
    const link = await ensureLink(req, cls, subjectKey, input.subjectTitle, session, audits);
    const source: IContentSource = { kind: input.source.kind, provider: input.source.provider, model: input.source.model, at: new Date() };
    const taken = new Set<string>();
    let created = 0;
    let updated = 0;
    let archived = 0;

    if (input.mode === 'edit') {
      const byId = new Map(existing.map((c) => [String(c._id), c]));
      for (const c of input.chapters) if (c.id && !byId.has(c.id)) throw AppError.badRequest('A chapter does not belong to this course', [{ path: 'chapters', message: `Unknown chapter ${c.id}` }]);
      const kept = new Set(input.chapters.map((c) => c.id).filter(Boolean));
      for (const c of existing) {
        if (kept.has(String(c._id))) continue;
        c.archivedAt = new Date();
        c.updatedBy = uid(req);
        await c.save({ session });
        archived++;
      }
      for (const [i, c] of input.chapters.entries()) {
        const doc = c.id ? byId.get(c.id)! : null;
        if (doc) {
          doc.set({ ...chapterFields(c, doc), ...stateOf(c.status), order: i + 1, updatedBy: uid(req) });
          // A draft that is now published or hidden is published on its own (it replaces nothing).
          if (!doc.draft) doc.supersedes = false;
          await doc.save({ session });
          updated++;
        } else {
          await Course.create(
            [
              {
                ...chapterFields(c, null),
                ...stateOf(c.status),
                slug: await chapterSlug(level, subjectKey, c.title, i, taken),
                classLevel: level,
                subject: subjectKey,
                generated: source.kind !== 'manual',
                supersedes: false,
                source,
                order: i + 1,
                isEnabled: true,
                createdBy: uid(req),
                updatedBy: uid(req),
              },
            ],
            { session },
          );
          created++;
        }
      }
    } else {
      // A new course or a new version: drafts, until published. Earlier unpublished versions are replaced.
      await Course.deleteMany({ classLevel: level, subject: subjectKey, draft: true, supersedes: { $ne: false }, archivedAt: null }, { session: session ?? undefined });
      const after = await Course.countDocuments({ classLevel: level, subject: subjectKey, archivedAt: null }).session(session);
      for (const [i, c] of input.chapters.entries()) {
        await Course.create(
          [
            {
              ...chapterFields(c, null),
              slug: await chapterSlug(level, subjectKey, c.title, i, taken),
              classLevel: level,
              subject: subjectKey,
              generated: source.kind !== 'manual',
              draft: true,
              supersedes: true,
              isVisible: false,
              source,
              order: after + i + 1,
              isEnabled: true,
              createdBy: uid(req),
              updatedBy: uid(req),
            },
          ],
          { session },
        );
        created++;
      }
    }

    link.description = input.course.description;
    link.course = { title: input.course.title, objectives: input.course.objectives, language: input.course.language, level: input.course.level, source: input.mode === 'edit' ? (link.course?.source ?? null) : source };
    link.updatedBy = uid(req);
    let published = 0;
    if (input.publish) {
      published = await publishDraftChapters(req, level, subjectKey, session);
      link.isVisible = true;
    }
    await link.save({ session });
    return { link, audits, counts: { mode: input.mode, created, updated, archived, published, source: source.kind } };
  });

  invalidateCatalog();
  for (const audit of outcome.audits) await audit();
  await auditItem(req, 'content_updated', outcome.link, input.mode === 'edit' ? 'Edited the course' : input.mode === 'new-version' ? 'Saved a new version of the course' : 'Created the course', outcome.counts);
  sendSuccess(res, await courseOf(cls, subjectKey), input.mode === 'edit' ? 200 : 201, undefined, input.publish ? 'Course published' : input.mode === 'edit' ? 'Course saved' : 'Course saved as a draft');
});

/** Publishes the subject's drafts (a new version replaces the earlier generated chapters) and shows the subject — in one transaction. */
export const publishCourse = asyncHandler(async (req: Request, res: Response) => {
  const cls = await classFor(req);
  const subjectKey = String(req.params.subject);
  const link = await ContentItem.findOne({ type: 'class_subject', classLevel: cls.classLevel, subject: subjectKey, archivedAt: null });
  if (!link) throw AppError.notFound(`${cls.title} doesn't offer this subject`);
  const live = await Course.countDocuments({ classLevel: cls.classLevel, subject: subjectKey, archivedAt: null });
  if (!live) throw AppError.badRequest('Add or generate at least one chapter before publishing', [{ path: 'chapters', message: 'No chapters' }]);
  const was = link.isVisible;
  const published = await inTransaction(async (session) => {
    const n = await publishDraftChapters(req, cls.classLevel!, subjectKey, session);
    const fresh = (await ContentItem.findById(link._id).session(session))!;
    fresh.isVisible = true;
    fresh.updatedBy = uid(req);
    await fresh.save({ session });
    return n;
  });
  invalidateCatalog();
  await auditItem(req, 'content_shown', link, 'Published the course', { chapters: published, previous: was });
  sendSuccess(res, await courseOf(cls, subjectKey), 200, undefined, 'Course published');
});

/** Hides the subject in this class (its chapters stay as they are, for administrators). */
export const unpublishCourse = asyncHandler(async (req: Request, res: Response) => {
  const cls = await classFor(req);
  const subjectKey = String(req.params.subject);
  const link = await ContentItem.findOne({ type: 'class_subject', classLevel: cls.classLevel, subject: subjectKey, archivedAt: null });
  if (!link) throw AppError.notFound(`${cls.title} doesn't offer this subject`);
  link.isVisible = false;
  link.updatedBy = uid(req);
  await link.save();
  invalidateCatalog();
  await auditItem(req, 'content_hidden', link, 'Unpublished the course');
  sendSuccess(res, await courseOf(cls, subjectKey), 200, undefined, 'Course hidden');
});
