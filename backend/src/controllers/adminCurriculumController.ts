import type { Request, Response } from 'express';

import { ContentItem, type IContentItem } from '../models/ContentItem';
import { Course, type ICourse } from '../models/Course';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ensureCatalogSeeded, invalidateCatalog, nextOrder } from '../services/contentService';
import { classSubjectKey } from '../services/learningStructure';
import { getCurriculumGenerator, type ClassBrief } from '../services/curriculum';
import { findFreeResources } from '../services/curriculum/resources';
import { auditItem } from './adminContentController';
import { CLASS_FILTER, findClass, respondWithClass, uid } from './adminClassController';
import { slugify, type SaveCurriculumInput } from '../validators/classValidators';

/**
 * The Course & Class Generator (admin) and a class's curriculum as visitors read it (public).
 *
 * Generation itself saves nothing: the administrator reviews subjects and chapters first. What is
 * saved lives in the existing content: subjects are class ↔ subject links (with this class's own
 * description, difficulty, time and free resources), and each chapter is a Course in that class
 * and subject — so the signed-in app's Courses and Kid Games pages show them too.
 */

type CourseDoc = ICourse;

const withoutAnswers = (q: { prompt: string; options: string[] }) => ({ prompt: q.prompt, options: q.options });

function serializeChapter(c: CourseDoc, includeAnswers: boolean) {
  return {
    // Internal ids only for administrators; visitors get the chapter address.
    ...(includeAnswers ? { id: c._id.toString(), generated: c.generated ?? false, isVisible: c.isVisible } : {}),
    slug: c.slug,
    title: c.title,
    description: c.summary,
    objectives: c.objectives ?? [],
    estimatedMinutes: c.estimatedMinutes ?? null,
    difficulty: c.difficulty ?? null,
    lessons: c.lessons.map((l) => ({ title: l.title, body: l.body })),
    activities: (c.activities ?? []).map((a) => ({
      type: a.type,
      title: a.title,
      instructions: a.instructions,
      questions: a.questions.map((q) => (includeAnswers ? { prompt: q.prompt, options: q.options, answer: q.answer } : withoutAnswers(q))),
    })),
    quiz: (c.quiz ?? []).map((q) => (includeAnswers ? { prompt: q.prompt, options: q.options, answer: q.answer } : withoutAnswers(q))),
    resources: (c.resources ?? []).map(serializeResource),
  };
}

const serializeResource = (r: { title: string; author: string | null; source: string; url: string; type: string; license: string; thumbnailUrl: string | null }) => ({
  title: r.title,
  author: r.author ?? null,
  source: r.source,
  url: r.url,
  type: r.type,
  license: r.license,
  thumbnailUrl: r.thumbnailUrl ?? null,
});

/**
 * A class's subjects with their chapters. Admin: every linked subject and chapter, answers included.
 * Public: only what a visitor may see — listed subjects and chapters, no answers.
 */
async function curriculumOf(cls: IContentItem, audience: 'admin' | 'public') {
  const level = cls.classLevel!;
  const pub = audience === 'public';
  const [links, subjects, courses, games] = await Promise.all([
    ContentItem.find({ type: 'class_subject', classLevel: level, archivedAt: null, ...(pub ? { isEnabled: true, isVisible: true } : {}) }).sort({ order: 1, _id: 1 }),
    ContentItem.find({ type: 'subject', archivedAt: null }),
    Course.find({ classLevel: level, archivedAt: null, ...(pub ? { isEnabled: true, isVisible: true } : {}) }).sort({ order: 1, _id: 1 }),
    ContentItem.aggregate<{ _id: string; n: number }>([
      { $match: { type: 'kid_game', classLevel: level, archivedAt: null, isEnabled: true, ...(pub ? { isVisible: true } : {}) } },
      { $group: { _id: '$subject', n: { $sum: 1 } } },
    ]),
  ]);
  const subjectByKey = new Map(subjects.map((s) => [s.key, s]));
  const gamesBy = new Map(games.map((g) => [g._id, g.n]));
  return links
    .filter((l) => l.subject && (!pub || (subjectByKey.get(l.subject)?.isEnabled && subjectByKey.get(l.subject)?.isVisible)))
    .map((l) => {
      const s = subjectByKey.get(l.subject!);
      return {
        key: l.subject!,
        title: s?.title ?? l.subject!,
        // This class's own description when the generator wrote one, the shared one otherwise.
        description: (l.meta || l.resources?.length ? l.description : '') || s?.description || '',
        glyph: s?.glyph ?? null,
        difficulty: l.meta?.difficulty ?? null,
        estimatedMinutes: l.meta?.estimatedMinutes ?? null,
        games: gamesBy.get(l.subject!) ?? 0,
        ...(pub ? {} : { isVisible: l.isVisible }),
        resources: (l.resources ?? []).map(serializeResource),
        chapters: courses.filter((c) => c.subject === l.subject).map((c) => serializeChapter(c, !pub)),
      };
    });
}

/** Publishing needs at least one visible subject, and something to learn in each of them. */
async function assertPublishable(level: number) {
  const links = await ContentItem.find({ type: 'class_subject', classLevel: level, archivedAt: null, isVisible: true });
  if (!links.length) throw AppError.badRequest('Add at least one subject before publishing', [{ path: 'subjects', message: 'No subjects' }]);
  const empty: string[] = [];
  for (const l of links) {
    const [chapters, games] = await Promise.all([
      Course.countDocuments({ classLevel: level, subject: l.subject, archivedAt: null }),
      ContentItem.countDocuments({ type: 'kid_game', classLevel: level, subject: l.subject, archivedAt: null }),
    ]);
    if (!chapters && !games) empty.push((await ContentItem.findOne({ type: 'subject', key: l.subject }))?.title ?? l.subject!);
  }
  if (empty.length) {
    throw AppError.badRequest(`Add at least one chapter to ${empty.join(', ')} before publishing`, empty.map((t) => ({ path: 'chapters', message: `${t} has no chapters` })));
  }
}

/** A course address for a chapter: "c6-science-plants", unique across all courses. */
async function chapterSlug(level: number, subject: string, title: string, index: number, taken: Set<string>): Promise<string> {
  const base = `c${level}-${subject}`.slice(0, 40).replace(/-+$/, '');
  const words = slugify(title).slice(0, 20).replace(/-+$/, '');
  const stem = `${base}-${words || `ch${index + 1}`}`;
  for (let n = 1; n < 100; n++) {
    const slug = (n === 1 ? stem : `${stem}-${n}`).slice(0, 63).replace(/-+$/, '');
    if (!taken.has(slug) && !(await Course.exists({ slug }))) {
      taken.add(slug);
      return slug;
    }
  }
  throw AppError.conflict('Could not name a chapter — try a different title');
}

// ------------------------------------------------------------------------------------ generation

export const suggestSubjects = asyncHandler(async (req: Request, res: Response) => {
  const brief = req.body as ClassBrief;
  const generator = getCurriculumGenerator();
  const suggestions = await generator.suggestSubjects(brief);
  // Subjects that already exist keep their shared name (the generator never renames them).
  const existing = new Map((await ContentItem.find({ type: 'subject', key: { $in: suggestions.map((s) => s.key) } })).map((s) => [s.key, s]));
  sendSuccess(res, {
    generator: generator.name,
    subjects: suggestions.map((s) => ({ ...s, title: existing.get(s.key)?.title ?? s.title, existing: existing.has(s.key) })),
  });
});

export const buildChapters = asyncHandler(async (req: Request, res: Response) => {
  const { brief, subjects } = req.body as { brief: ClassBrief; subjects: Array<{ key: string; title: string; difficulty?: 'easy' | 'medium' | 'hard'; chapterCount?: number }> };
  const generator = getCurriculumGenerator();
  const out = [];
  for (const subject of subjects) out.push({ key: subject.key, chapters: await generator.buildChapters(brief, subject) });
  sendSuccess(res, { generator: generator.name, subjects: out });
});

export const searchResources = asyncHandler(async (req: Request, res: Response) => {
  const { subject, topic, classLevel } = req.query as unknown as { subject: string; topic?: string; classLevel?: number };
  sendSuccess(res, await findFreeResources(subject, { topic, classLevel: classLevel === undefined ? undefined : Number(classLevel) }));
});

// ------------------------------------------------------------------------------------ a class's curriculum

export const getClassCurriculum = asyncHandler(async (req: Request, res: Response) => {
  const cls = await findClass(Number(req.params.level));
  sendSuccess(res, { subjects: await curriculumOf(cls, 'admin') });
});

/**
 * Saves chapters (and chosen free resources) for the listed subjects of a class. A subject's
 * earlier generated chapters are replaced; chapters written by hand in Lesson courses are kept.
 */
export const saveClassCurriculum = asyncHandler(async (req: Request, res: Response) => {
  const { subjects } = req.body as SaveCurriculumInput;
  const cls = await findClass(Number(req.params.level));
  if (cls.archivedAt) throw AppError.conflict('Restore this class before changing it');
  const level = cls.classLevel!;
  const links = await ContentItem.find({ type: 'class_subject', classLevel: level, archivedAt: null });

  const missing = subjects.filter((s) => !links.some((l) => l.subject === s.key));
  if (missing.length) {
    throw AppError.badRequest(`Class ${level} doesn't offer ${missing.map((m) => m.key).join(', ')}`, missing.map((m) => ({ path: 'subjects', message: `${m.key} is not in this class` })));
  }

  const taken = new Set<string>();
  let chapters = 0;
  for (const subject of subjects) {
    // Earlier generated chapters go; any a Kid Game points at is archived instead of removed.
    const old = await Course.find({ classLevel: level, subject: subject.key, generated: true, archivedAt: null });
    for (const course of old) {
      if (await ContentItem.exists({ type: 'kid_game', courseId: course._id })) {
        course.archivedAt = new Date();
        await course.save();
      } else {
        await course.deleteOne();
      }
    }
    const handWritten = await Course.countDocuments({ classLevel: level, subject: subject.key, archivedAt: null });
    for (const [i, ch] of subject.chapters.entries()) {
      await Course.create({
        title: ch.title,
        slug: await chapterSlug(level, subject.key, ch.title, i, taken),
        summary: ch.description,
        classLevel: level,
        subject: subject.key,
        difficulty: ch.difficulty,
        ageGroup: cls.profile?.targetAge || null,
        learningObjective: ch.objectives[0] ?? '',
        objectives: ch.objectives,
        estimatedMinutes: ch.estimatedMinutes,
        lessons: ch.lessons.map((l) => ({ title: l.title, body: l.body, url: null })),
        activities: ch.activities,
        quiz: ch.quiz,
        generated: true,
        order: handWritten + i + 1,
        isEnabled: true,
        isVisible: true,
        createdBy: uid(req),
        updatedBy: uid(req),
      });
      chapters++;
    }
    const link = links.find((l) => l.subject === subject.key)!;
    link.resources = subject.resources;
    link.updatedBy = uid(req);
    await link.save();
  }
  cls.updatedBy = uid(req);
  cls.markModified('updatedAt');
  await cls.save();
  invalidateCatalog();
  await auditItem(req, 'content_updated', cls, 'Generated the curriculum of', { subjects: subjects.map((s) => s.key), chapters });
  sendSuccess(res, { subjects: await curriculumOf(cls, 'admin') }, 200, undefined, 'Curriculum saved');
});

/** Draft ↔ published. Publishing checks there is something to learn in every visible subject. */
export const setClassStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as { status: 'draft' | 'published' };
  const cls = await findClass(Number(req.params.level));
  if (cls.archivedAt) throw AppError.conflict('Restore this class first');
  if (status === 'published') await assertPublishable(cls.classLevel!);
  const was = cls.status ?? 'published';
  cls.status = status;
  if (status === 'published') cls.isEnabled = true;
  cls.updatedBy = uid(req);
  await cls.save();
  invalidateCatalog();
  if (was !== status) await auditItem(req, status === 'published' ? 'content_shown' : 'content_hidden', cls, status === 'published' ? 'Published' : 'Moved to draft', { field: 'status', previous: was, next: status });
  await respondWithClass(res, cls, 200, status === 'published' ? 'Class published' : 'Saved as draft');
});

/**
 * Copies a class into a new draft — details, picture, subjects (with their order, descriptions and
 * resources) and chapters — under the next free number unless one is given. Never published.
 */
export const duplicateClass = asyncHandler(async (req: Request, res: Response) => {
  await ensureCatalogSeeded();
  const source = await findClass(Number(req.params.level));
  const requested = (req.body as { classLevel?: number }).classLevel;
  const used = new Set((await ContentItem.find(CLASS_FILTER, { classLevel: 1 })).map((c) => c.classLevel));
  let level = requested;
  if (level === undefined) {
    for (let n = source.classLevel! + 1; n <= 12 && level === undefined; n++) if (!used.has(n)) level = n;
    for (let n = 1; n <= 12 && level === undefined; n++) if (!used.has(n)) level = n;
  }
  if (level === undefined) throw AppError.conflict('All class numbers from 1 to 12 are in use');
  if (used.has(level)) throw AppError.conflict(`Class ${level} already exists (it may be archived)`);

  const oldTitle = source.title.trim();
  const title = oldTitle === `Class ${source.classLevel}` ? `Class ${level}` : oldTitle.replace(new RegExp(`\\bClass ${source.classLevel}\\b`), `Class ${level}`);
  const copy = await ContentItem.create({
    type: 'class',
    key: `class-${level}`,
    title: title === oldTitle ? `${oldTitle} (copy)`.slice(0, 120) : title,
    subtitle: source.subtitle ?? '',
    description: source.description,
    details: source.details ?? '',
    thumbnailUrl: source.thumbnailUrl ?? null,
    classLevel: level,
    order: await nextOrder({ ...CLASS_FILTER, archivedAt: null }),
    isEnabled: true,
    isVisible: true,
    status: 'draft',
    profile: source.profile ?? null,
    source: 'admin',
    createdBy: uid(req),
    updatedBy: uid(req),
  });

  const links = await ContentItem.find({ type: 'class_subject', classLevel: source.classLevel, archivedAt: null }).sort({ order: 1, _id: 1 });
  for (const l of links) {
    const subjectTitle = (await ContentItem.findOne({ type: 'subject', key: l.subject }))?.title ?? l.subject!;
    await ContentItem.create({
      type: 'class_subject',
      key: classSubjectKey(level, l.subject!),
      title: `Class ${level} · ${subjectTitle}`,
      description: l.description,
      classLevel: level,
      subject: l.subject,
      order: l.order,
      isEnabled: l.isEnabled,
      isVisible: l.isVisible,
      meta: l.meta ?? null,
      resources: l.resources ?? [],
      source: 'admin',
      createdBy: uid(req),
      updatedBy: uid(req),
    });
  }
  const taken = new Set<string>();
  const courses = await Course.find({ classLevel: source.classLevel, archivedAt: null }).sort({ subject: 1, order: 1 });
  for (const [i, c] of courses.entries()) {
    const plain = c.toObject() as unknown as Record<string, unknown>;
    delete plain._id;
    delete plain.createdAt;
    delete plain.updatedAt;
    await Course.create({
      ...plain,
      lessons: c.lessons.map((l) => ({ title: l.title, body: l.body, url: l.url })),
      slug: await chapterSlug(level, c.subject ?? 'course', c.title, i, taken),
      classLevel: level,
      createdBy: uid(req),
      updatedBy: uid(req),
    });
  }
  invalidateCatalog();
  await auditItem(req, 'content_created', copy, 'Duplicated', { from: source.classLevel, to: level, chapters: courses.length });
  await respondWithClass(res, copy, 201, `Draft Class ${level} created — review it before publishing`);
});

// ------------------------------------------------------------------------------------ public

/** /api/content/classes/:slug/curriculum — a published, visible class as visitors read it. */
export const publicClassCurriculum = asyncHandler(async (req: Request, res: Response) => {
  await ensureCatalogSeeded();
  const cls = await ContentItem.findOne({ ...CLASS_FILTER, key: req.params.slug, archivedAt: null, isEnabled: true, isVisible: true, status: { $ne: 'draft' } });
  if (!cls) throw AppError.notFound('Class not found');
  res.setHeader('Cache-Control', 'no-cache');
  sendSuccess(res, {
    class: {
      classLevel: cls.classLevel,
      slug: cls.key,
      title: cls.title,
      subtitle: cls.subtitle ?? '',
      description: cls.description,
      details: cls.details ?? '',
      image: cls.thumbnailUrl ?? null,
      profile: cls.profile ? { learningGoal: cls.profile.learningGoal, targetAge: cls.profile.targetAge, language: cls.profile.language, difficulty: cls.profile.difficulty } : null,
    },
    subjects: await curriculumOf(cls, 'public'),
  });
});

