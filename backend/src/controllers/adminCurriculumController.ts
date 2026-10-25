import type { Request, Response } from 'express';
import type { ClientSession } from 'mongoose';

import { ContentItem, type IContentItem } from '../models/ContentItem';
import { Course, type ICourse } from '../models/Course';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ensureCatalogSeeded, invalidateCatalog, nextOrder } from '../services/contentService';
import { classSubjectKey } from '../services/learningStructure';
import { auditItem } from './adminContentController';
import { CLASS_FILTER, findClass, respondWithClass, uid } from './adminClassController';
import { slugify } from '../validators/classValidators';
import { archiveUpdate } from '../services/archive';
import { academicYearOf, MONTHS_IN_ORDER } from '../services/academicCalendar';
import { sameSlot, scheduleFilterOf, scheduleOf } from '../services/courseSchedule';

/**
 * A class's curriculum, read three ways: by administrators (everything, drafts and answers included —
 * the preview), and by visitors as light summaries (a class page, a subject page) or one full chapter
 * at a time (its lessons and practice). Publishing a class (and its draft chapters) and duplicating a
 * class live here too; generating and editing courses is adminCourseController.
 *
 * Subjects are class ↔ subject links; each chapter is a Course in that class and subject.
 */

type CourseDoc = ICourse;
type Q = { type?: string | null; prompt: string; options: string[]; answer: string; difficulty?: string | null; explanation?: string };

/** A question's type: stored, or (for questions written before types existed) read from its shape. */
const typeOf = (q: Q) => q.type ?? (q.options.length === 2 && /^(true|सही)$/i.test(q.options[0] ?? '') ? 'true-false' : q.options.length ? 'mcq' : 'short-answer');
/** A question learners study from: the answer comes with it (shown on request). */
const withAnswer = (q: Q) => ({ type: typeOf(q), prompt: q.prompt, options: q.options, answer: q.answer, difficulty: q.difficulty ?? null, explanation: q.explanation ?? '' });
/** A quiz question as visitors get it: the server keeps the answer and marks the quiz. */
const quizQuestion = (q: Q) => ({ type: typeOf(q), prompt: q.prompt, options: q.options });

const questionCount = (c: CourseDoc) => (c.quiz?.length ?? 0) + c.lessons.reduce((n, l) => n + (l.questions?.length ?? 0) + (l.practice?.length ?? 0), 0) + (c.activities ?? []).reduce((n, a) => n + a.questions.length, 0);

/** A chapter in a list (class and subject pages): no lesson content, so the page stays light. */
function chapterSummary(c: CourseDoc) {
  return {
    slug: c.slug,
    title: c.title,
    description: c.summary,
    ...scheduleOf(c),
    difficulty: c.difficulty ?? null,
    estimatedMinutes: c.estimatedMinutes ?? null,
    lessonCount: c.lessons.length,
    questionCount: questionCount(c),
    lessons: c.lessons.map((l, i) => ({ number: i + 1, title: l.title })),
  };
}

/** A whole chapter. Admin: ids, status and every answer. Public: lesson answers (to study), never quiz answers. */
export function serializeChapter(c: CourseDoc, audience: 'admin' | 'public') {
  const admin = audience === 'admin';
  return {
    ...(admin ? { id: c._id.toString(), generated: c.generated ?? false, draft: c.draft ?? false, isVisible: c.isVisible, source: c.source ?? null } : {}),
    ...chapterSummary(c),
    objectives: c.objectives ?? [],
    summary: c.recap ?? '',
    lessons: c.lessons.map((l, i) => ({
      ...(admin ? { id: String((l as unknown as { _id: unknown })._id) } : {}),
      number: i + 1,
      title: l.title,
      // Older lessons have a body only: it is the lesson's explanation.
      explanation: l.body,
      examples: l.examples ?? [],
      keyPoints: l.keyPoints ?? [],
      questions: (l.questions ?? []).map(withAnswer),
      practice: (l.practice ?? []).map(withAnswer),
      estimatedMinutes: l.estimatedMinutes ?? null,
    })),
    activities: (c.activities ?? []).map((a) => ({ type: a.type, title: a.title, instructions: a.instructions, questions: a.questions.map(withAnswer) })),
    quiz: (c.quiz ?? []).map((q) => (admin ? withAnswer(q) : quizQuestion(q))),
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
 * A class's subjects with their chapters. Admin: every linked subject and every chapter in full
 * (drafts and answers included). Public: listed subjects and published, visible chapters, as summaries.
 */
/** A schedule to read a class through: one academic year (and a month in it), or only the chapters not scheduled yet. */
export type ScheduleQuery = { academicYear?: string; month?: number; schedule?: 'unscheduled' };
const isScheduled = (q?: ScheduleQuery) => Boolean(q && (q.academicYear || q.month || q.schedule));

async function curriculumOf(cls: IContentItem, audience: 'admin' | 'public', onlySubject?: string, when?: ScheduleQuery) {
  const level = cls.classLevel!;
  const pub = audience === 'public';
  // One subject: still read through this class's own link, so a subject the class doesn't offer is never returned.
  const subjectFilter = onlySubject ? { subject: onlySubject } : {};
  const [links, subjects, courses, games] = await Promise.all([
    ContentItem.find({ type: 'class_subject', classLevel: level, archivedAt: null, ...subjectFilter, ...(pub ? { isEnabled: true, isVisible: true } : {}) }).sort({ order: 1, _id: 1 }),
    ContentItem.find({ type: 'subject', archivedAt: null }),
    Course.find({ classLevel: level, archivedAt: null, ...subjectFilter, ...scheduleFilterOf(when ?? {}), ...(pub ? { isEnabled: true, isVisible: true, draft: { $ne: true } } : {}) }).sort({ order: 1, _id: 1 }),
    ContentItem.aggregate<{ _id: string; n: number }>([
      { $match: { type: 'kid_game', classLevel: level, archivedAt: null, isEnabled: true, ...subjectFilter, ...(pub ? { isVisible: true } : {}) } },
      { $group: { _id: '$subject', n: { $sum: 1 } } },
    ]),
  ]);
  const subjectByKey = new Map(subjects.map((s) => [s.key, s]));
  const gamesBy = new Map(games.map((g) => [g._id, g.n]));
  const scoped = isScheduled(when);
  return links
    .filter((l) => l.subject && (!pub || (subjectByKey.get(l.subject)?.isEnabled && subjectByKey.get(l.subject)?.isVisible)))
    // Through a schedule only subjects with something published in it are listed — never an empty card.
    .filter((l) => !scoped || courses.some((c) => c.subject === l.subject))
    .map((l) => {
      const s = subjectByKey.get(l.subject!);
      return {
        key: l.subject!,
        title: s?.title ?? l.subject!,
        // How this class describes the subject ("A–Z, phonics…" for Class 1 English), else the shared text.
        description: l.description || s?.description || '',
        glyph: s?.glyph ?? null,
        difficulty: l.meta?.difficulty ?? null,
        estimatedMinutes: l.meta?.estimatedMinutes ?? null,
        // Games are not scheduled: a month's page doesn't count them.
        games: scoped ? 0 : (gamesBy.get(l.subject!) ?? 0),
        ...(pub ? {} : { isVisible: l.isVisible }),
        course: l.course ? { title: l.course.title, objectives: l.course.objectives ?? [], language: l.course.language ?? null, level: l.course.level ?? null, ...(pub ? {} : { source: l.course.source ?? null }) } : null,
        resources: (l.resources ?? []).map(serializeResource),
        chapters: courses.filter((c) => c.subject === l.subject).map((c) => (pub ? chapterSummary(c) : serializeChapter(c, 'admin'))),
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
export async function chapterSlug(level: number, subject: string, title: string, index: number, taken: Set<string>): Promise<string> {
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

// ------------------------------------------------------------------------------------ a class's curriculum

export const getClassCurriculum = asyncHandler(async (req: Request, res: Response) => {
  const cls = await findClass(Number(req.params.level));
  sendSuccess(res, { subjects: await curriculumOf(cls, 'admin') });
});

/**
 * Publishes a class's draft chapters (or one subject's). In a subject with drafts from a new version
 * of its course, the earlier generated chapters are archived (restorable — never deleted) and the
 * drafts take their place; a single chapter added as a draft simply goes live. Chapters written by
 * hand are never archived here. Returns how many chapters went live.
 */
export async function publishDraftChapters(req: Request, level: number, subject?: string, session: ClientSession | null = null): Promise<number> {
  const drafts = await Course.find({ classLevel: level, draft: true, archivedAt: null, ...(subject ? { subject } : {}) }).session(session);
  if (!drafts.length) return 0;
  const replacing = [...new Set(drafts.filter((d) => d.supersedes !== false).map((d) => d.subject))];
  if (replacing.length) {
    await Course.updateMany({ classLevel: level, subject: { $in: replacing }, generated: true, draft: { $ne: true }, archivedAt: null }, archiveUpdate(uid(req)), { session: session ?? undefined });
  }
  await Course.updateMany({ _id: { $in: drafts.map((d) => d._id) } }, { $set: { draft: false, isVisible: true, updatedBy: uid(req) } }, { session: session ?? undefined });
  return drafts.length;
}

/** Draft ↔ published. Publishing checks there is something to learn in every visible subject. */
export const setClassStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as { status: 'draft' | 'published' };
  const cls = await findClass(Number(req.params.level));
  if (cls.archivedAt) throw AppError.conflict('Restore this class first');
  if (status === 'published') await assertPublishable(cls.classLevel!);
  const was = cls.status ?? 'published';
  // Publishing also publishes the class's draft chapters (also how a published class's new ones go live).
  const chapters = status === 'published' ? await publishDraftChapters(req, cls.classLevel!) : 0;
  cls.status = status;
  if (status === 'published') cls.isEnabled = true;
  cls.updatedBy = uid(req);
  await cls.save();
  invalidateCatalog();
  if (chapters) await auditItem(req, 'content_updated', cls, 'Published the generated chapters of', { chapters });
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

/** A published, visible, switched-on class by its address (class-N), or a 404. */
export async function findPublicClass(slug: string): Promise<IContentItem> {
  await ensureCatalogSeeded();
  const cls = await ContentItem.findOne({ ...CLASS_FILTER, key: slug, archivedAt: null, isEnabled: true, isVisible: true, status: { $ne: 'draft' } });
  if (!cls) throw AppError.notFound('Class not found');
  return cls;
}

/** What visitors may read about a class: no ids, nothing an administrator keeps to themselves. */
const publicClassFields = (cls: IContentItem) => ({
  classLevel: cls.classLevel,
  slug: cls.key,
  title: cls.title,
  subtitle: cls.subtitle ?? '',
  description: cls.description,
  details: cls.details ?? '',
  image: cls.thumbnailUrl ?? null,
  profile: cls.profile ? { learningGoal: cls.profile.learningGoal, targetAge: cls.profile.targetAge, language: cls.profile.language, difficulty: cls.profile.difficulty } : null,
});

/** /api/content/classes/:slug/curriculum — a published, visible class as visitors read it. */
export const publicClassCurriculum = asyncHandler(async (req: Request, res: Response) => {
  const cls = await findPublicClass(String(req.params.slug));
  res.setHeader('Cache-Control', 'no-cache');
  sendSuccess(res, { class: publicClassFields(cls), subjects: await curriculumOf(cls, 'public', undefined, req.query as ScheduleQuery) });
});

/**
 * /api/content/classes/:slug/schedule — which academic years and months have published content in this
 * class, with what each holds (subjects, chapters, lessons, minutes), and what is not scheduled yet.
 * Counts only: it is what the year / month picker is drawn from, so it never offers an empty month.
 */
export const publicClassSchedule = asyncHandler(async (req: Request, res: Response) => {
  const cls = await findPublicClass(String(req.params.slug));
  const subjects = await curriculumOf(cls, 'public');
  const slots = new Map<string, { academicYear: string | null; month: number | null; subjects: Set<string>; chapters: number; lessons: number; minutes: number }>();
  for (const s of subjects) {
    for (const c of s.chapters) {
      const key = `${c.academicYear ?? ''}|${c.month ?? ''}`;
      const slot = slots.get(key) ?? { academicYear: c.academicYear, month: c.month, subjects: new Set<string>(), chapters: 0, lessons: 0, minutes: 0 };
      slot.subjects.add(s.key);
      slot.chapters += 1;
      slot.lessons += c.lessonCount;
      slot.minutes += c.estimatedMinutes ?? 0;
      slots.set(key, slot);
    }
  }
  const row = (x: { subjects: Set<string>; chapters: number; lessons: number; minutes: number }) => ({ subjects: x.subjects.size, chapters: x.chapters, lessons: x.lessons, minutes: x.minutes });
  const years = [...new Set([...slots.values()].map((x) => x.academicYear).filter((y): y is string => Boolean(y)))].sort();
  res.setHeader('Cache-Control', 'no-cache');
  sendSuccess(res, {
    currentYear: academicYearOf(new Date()),
    currentMonth: new Date().getMonth() + 1,
    // The class as a whole (every chapter, scheduled or not), so its page needs no second read for its headline figures.
    totals: { subjects: subjects.length, chapters: subjects.reduce((n, s) => n + s.chapters.length, 0), games: subjects.reduce((n, s) => n + s.games, 0) },
    years: years.map((year) => {
      const inYear = [...slots.values()].filter((x) => x.academicYear === year);
      return {
        academicYear: year,
        // Whole-year chapters (a year with no month) are listed under month null.
        months: [...MONTHS_IN_ORDER, null].flatMap((m) => {
          const slot = inYear.find((x) => x.month === m);
          return slot ? [{ month: m, ...row(slot) }] : [];
        }),
        ...row({ subjects: new Set(inYear.flatMap((x) => [...x.subjects])), chapters: inYear.reduce((n, x) => n + x.chapters, 0), lessons: inYear.reduce((n, x) => n + x.lessons, 0), minutes: inYear.reduce((n, x) => n + x.minutes, 0) }),
      };
    }),
    unscheduled: (() => {
      const open = [...slots.values()].filter((x) => !x.academicYear);
      return row({ subjects: new Set(open.flatMap((x) => [...x.subjects])), chapters: open.reduce((n, x) => n + x.chapters, 0), lessons: open.reduce((n, x) => n + x.lessons, 0), minutes: open.reduce((n, x) => n + x.minutes, 0) });
    })(),
  });
});

/**
 * /api/content/classes/:slug/subjects/:subject — one subject as this class teaches it: its chapters
 * (lessons, practice and quiz without answers) and resources. The class and the subject both come
 * from the address, so the pair is checked here: a subject the class doesn't offer, or one that is
 * hidden or switched off in it, is a 404 — never another class's subject of the same name.
 */
export const publicClassSubject = asyncHandler(async (req: Request, res: Response) => {
  const cls = await findPublicClass(String(req.params.slug));
  const [subject] = await curriculumOf(cls, 'public', String(req.params.subject), req.query as ScheduleQuery);
  if (!subject) throw AppError.notFound('Subject not found in this class');
  res.setHeader('Cache-Control', 'no-cache');
  sendSuccess(res, { class: publicClassFields(cls), subject });
});

/**
 * /api/content/classes/:slug/subjects/:subject/chapters/:chapter — one chapter in full (its lessons with
 * their questions and practice, and its quiz without answers), checked to belong to this class and
 * subject and to be published and visible, with the subject's other chapters for previous / next.
 */
/** A published, visible chapter by its address — under the same checks as its page — or a 404. */
export async function findPublicChapter(slug: string, subjectKey: string, chapterSlug: string) {
  const cls = await findPublicClass(slug);
  const [subject] = await curriculumOf(cls, 'public', subjectKey);
  if (!subject) throw AppError.notFound('Subject not found in this class');
  const course = await Course.findOne({ classLevel: cls.classLevel, subject: subject.key, slug: chapterSlug, archivedAt: null, isEnabled: true, isVisible: true, draft: { $ne: true } });
  if (!course) throw AppError.notFound('Chapter not found in this subject');
  return { cls, subject, course };
}

export const publicChapter = asyncHandler(async (req: Request, res: Response) => {
  const { cls, subject, course } = await findPublicChapter(String(req.params.slug), String(req.params.subject), String(req.params.chapter));
  res.setHeader('Cache-Control', 'no-cache');
  sendSuccess(res, {
    class: publicClassFields(cls),
    subject: { key: subject.key, title: subject.title, glyph: subject.glyph },
    chapter: serializeChapter(course, 'public'),
    // Previous / next and "chapter N of M" stay inside the month this chapter is taught in.
    chapters: subject.chapters.filter((c) => sameSlot(c, course)).map((c) => ({ slug: c.slug, title: c.title })),
  });
});
