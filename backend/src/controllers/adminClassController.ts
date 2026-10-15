import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import sharp from 'sharp';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { ContentItem, type IContentItem } from '../models/ContentItem';
import { Course } from '../models/Course';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ensureCatalogSeeded, invalidateCatalog, nextOrder } from '../services/contentService';
import { classSubjectKey } from '../services/learningStructure';
import { getStorageProvider, storageFailure } from '../services/storage';
import { auditItem } from './adminContentController';
import { slugify, type CreateClassInput, type UpdateClassInput } from '../validators/classValidators';

/**
 * Manage Courses: each class with the subjects it offers, edited as one thing.
 *
 * A class is the catalog entry of type "class" (key "class-N"); the subjects it offers are its
 * class_subject links, in their order; a subject itself is a shared catalog entry. So everything
 * here reads and writes the same documents as the rest of the content system, the public catalog
 * and Kid Games — there is no second copy of a class anywhere. Admin only (adminRoutes).
 */

type Row = IContentItem;
export const uid = (req: Request) => new Types.ObjectId(req.user!.id);
export const CLASS_FILTER = { type: 'class' as const };

/** Where a class stands, in words an administrator reads on its card. */
function statusOf(c: Row): 'draft' | 'visible' | 'hidden' | 'off' | 'archived' {
  if (c.archivedAt) return 'archived';
  if (c.status === 'draft') return 'draft';
  if (!c.isEnabled) return 'off';
  return c.isVisible ? 'visible' : 'hidden';
}

interface Lookups {
  links: Row[];
  subjects: Map<string, Row>;
  games: Map<string, number>;
  /** Courses (chapters) and their lessons, per "class:subject". */
  chapters: Map<string, { n: number; lessons: number }>;
}

/** Everything the class cards need, in four queries whatever the number of classes. */
async function lookups(levels: number[]): Promise<Lookups> {
  const [links, subjects, games, courses] = await Promise.all([
    ContentItem.find({ type: 'class_subject', classLevel: { $in: levels }, archivedAt: null }).sort({ order: 1, _id: 1 }),
    ContentItem.find({ type: 'subject' }),
    // Learning games that are switched on, per class and subject.
    ContentItem.aggregate<{ _id: { l: number; s: string }; n: number }>([
      { $match: { type: 'kid_game', classLevel: { $in: levels }, archivedAt: null, isEnabled: true } },
      { $group: { _id: { l: '$classLevel', s: '$subject' }, n: { $sum: 1 } } },
    ]),
    Course.aggregate<{ _id: { l: number; s: string | null }; n: number; lessons: number }>([
      { $match: { classLevel: { $in: levels }, archivedAt: null } },
      { $group: { _id: { l: '$classLevel', s: '$subject' }, n: { $sum: 1 }, lessons: { $sum: { $size: { $ifNull: ['$lessons', []] } } } } },
    ]),
  ]);
  return {
    links,
    subjects: new Map(subjects.map((s) => [s.key, s])),
    games: new Map(games.map((g) => [`${g._id.l}:${g._id.s}`, g.n])),
    chapters: new Map(courses.map((c) => [`${c._id.l}:${c._id.s}`, { n: c.n, lessons: c.lessons }])),
  };
}

function serializeClass(c: Row, position: number | null, look: Lookups) {
  const level = c.classLevel!;
  const subjects = look.links
    .filter((l) => l.classLevel === level && l.subject)
    .map((l) => {
      const s = look.subjects.get(l.subject!);
      return {
        key: l.subject!,
        title: s?.title ?? l.subject!,
        /** The shared subject's description (the class editor edits this one). */
        description: s?.description ?? '',
        /** This class's own description of the subject, if the generator wrote one. */
        classDescription: l.meta || l.resources?.length ? l.description : '',
        glyph: s?.glyph ?? null,
        isVisible: l.isVisible,
        /** The subject is switched on (it can be switched off for every class at once elsewhere). */
        isAvailable: Boolean(s && !s.archivedAt && s.isEnabled && l.isEnabled),
        games: look.games.get(`${level}:${l.subject}`) ?? 0,
        chapters: look.chapters.get(`${level}:${l.subject}`)?.n ?? 0,
        lessons: look.chapters.get(`${level}:${l.subject}`)?.lessons ?? 0,
        difficulty: l.meta?.difficulty ?? null,
        estimatedMinutes: l.meta?.estimatedMinutes ?? null,
        resources: l.resources?.length ?? 0,
      };
    });
  const allChapters = [...look.chapters.entries()].filter(([k]) => k.startsWith(`${level}:`)).map(([, v]) => v);
  return {
    id: c._id.toString(),
    classLevel: level,
    slug: c.key,
    title: c.title,
    subtitle: c.subtitle ?? '',
    description: c.description,
    details: c.details ?? '',
    image: c.thumbnailUrl ?? null,
    isVisible: c.isVisible,
    isEnabled: c.isEnabled,
    status: statusOf(c),
    published: c.status !== 'draft',
    profile: c.profile
      ? { learningGoal: c.profile.learningGoal, targetAge: c.profile.targetAge, language: c.profile.language, curriculumType: c.profile.curriculumType, difficulty: c.profile.difficulty }
      : null,
    position,
    builtIn: c.source === 'code',
    subjects,
    counts: {
      subjects: subjects.length,
      visibleSubjects: subjects.filter((s) => s.isVisible && s.isAvailable).length,
      games: subjects.reduce((n, s) => n + s.games, 0),
      courses: allChapters.reduce((n, v) => n + v.n, 0),
      chapters: allChapters.reduce((n, v) => n + v.n, 0),
      lessons: allChapters.reduce((n, v) => n + v.lessons, 0),
    },
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    archivedAt: c.archivedAt,
  };
}

/** The live classes in display order (what "position" counts). */
export const liveClasses = () => ContentItem.find({ ...CLASS_FILTER, archivedAt: null }).sort({ order: 1, _id: 1 });

export async function findClass(level: number): Promise<Row> {
  const c = await ContentItem.findOne({ ...CLASS_FILTER, classLevel: level });
  if (!c) throw AppError.notFound(`There is no Class ${level}`);
  return c;
}

export async function respondWithClass(res: Response, c: Row, status = 200, message?: string) {
  const live = await liveClasses();
  const index = live.findIndex((x) => x._id.equals(c._id));
  sendSuccess(res, serializeClass(c, index === -1 ? null : index + 1, await lookups([c.classLevel!])), status, undefined, message);
}

/** Puts a class at a 1-based position among the live classes and renumbers them all 1…n. */
export async function placeClass(c: Row, position: number, req: Request): Promise<{ from: number; to: number } | null> {
  const all = await liveClasses();
  const from = all.findIndex((x) => x._id.equals(c._id)) + 1;
  const others = all.filter((x) => !x._id.equals(c._id)).map((x) => ({ id: x._id, order: x.order }));
  const to = Math.min(Math.max(1, position), others.length + 1);
  others.splice(to - 1, 0, { id: c._id, order: Number.NaN });
  const writes = others
    .map((x, i) => ({ ...x, next: i + 1 }))
    .filter((x) => x.order !== x.next)
    .map((x) => ({ updateOne: { filter: { _id: x.id }, update: { $set: { order: x.next, ...(x.id.equals(c._id) ? { updatedBy: uid(req) } : {}) } } } }));
  if (writes.length) await ContentItem.bulkWrite(writes);
  c.order = to;
  return from === to ? null : { from, to };
}

// ------------------------------------------------------------------------------------ subjects

type SubjectRow = NonNullable<UpdateClassInput['subjects']>[number];

/**
 * Makes a class offer exactly these subjects, in this order. Subjects are shared by every class,
 * so a new name creates (or brings back) a subject, and a changed name or description changes it
 * everywhere. Links the list leaves out are archived — restorable, and nothing else is lost.
 */
export async function syncSubjects(req: Request, level: number, rows: SubjectRow[], mode: 'shared' | 'class' = 'shared'): Promise<void> {
  const links = await ContentItem.find({ type: 'class_subject', classLevel: level });
  const keep = new Set<string>();

  for (const [i, row] of rows.entries()) {
    const key = row.key ?? slugify(row.title);
    keep.add(key);

    // The subject itself.
    let subject = await ContentItem.findOne({ type: 'subject', key });
    if (!subject) {
      // The generator names new subjects by their library key ("science"); the editor never invents keys.
      if (row.key && mode === 'shared') throw AppError.badRequest(`There is no subject “${row.key}”`, [{ path: `subjects.${i}.key`, message: 'Unknown subject' }]);
      subject = await ContentItem.create({
        type: 'subject',
        key,
        title: row.title,
        description: row.description,
        glyph: row.glyph ?? null,
        order: await nextOrder({ type: 'subject' }),
        source: 'admin',
        createdBy: uid(req),
        updatedBy: uid(req),
      });
      await auditItem(req, 'content_created', subject, 'Created');
    } else if (mode === 'class') {
      // The generator leaves a shared subject as it is (other classes show it); only bring it back.
      if (subject.archivedAt) {
        subject.archivedAt = null;
        subject.order = await nextOrder({ type: 'subject', archivedAt: null });
        subject.updatedBy = uid(req);
        await subject.save();
        await auditItem(req, 'content_restored', subject, 'Restored');
      }
    } else {
      const edited: string[] = [];
      if (subject.archivedAt) {
        subject.archivedAt = null;
        subject.order = await nextOrder({ type: 'subject', archivedAt: null });
        await auditItem(req, 'content_restored', subject, 'Restored');
      }
      if (row.title !== subject.title) edited.push('title');
      if (row.description !== subject.description) edited.push('description');
      if (row.glyph !== undefined && (row.glyph ?? null) !== (subject.glyph ?? null)) edited.push('glyph');
      subject.title = row.title;
      subject.description = row.description;
      if (row.glyph !== undefined) subject.glyph = row.glyph ?? null;
      if (subject.isModified()) {
        subject.updatedBy = uid(req);
        await subject.save();
        if (edited.length) await auditItem(req, 'content_updated', subject, 'Updated', { fields: edited });
      }
    }

    // Its link to this class, at this position.
    const link = links.find((l) => l.subject === key);
    if (!link) {
      const created = await ContentItem.create({
        type: 'class_subject',
        key: classSubjectKey(level, key),
        title: `Class ${level} · ${subject.title}`,
        classLevel: level,
        subject: key,
        order: i + 1,
        isVisible: row.isVisible,
        ...(mode === 'class' ? { description: row.description } : {}),
        meta: linkMeta(row),
        source: 'admin',
        createdBy: uid(req),
        updatedBy: uid(req),
      });
      await auditItem(req, 'content_created', created, 'Added');
      continue;
    }
    const wasArchived = Boolean(link.archivedAt);
    const wasVisible = link.isVisible;
    link.archivedAt = null;
    link.order = i + 1;
    link.isVisible = row.isVisible;
    if (mode === 'class') link.description = row.description;
    if (row.difficulty !== undefined || row.estimatedMinutes !== undefined) link.meta = linkMeta(row, link.meta);
    if (link.isModified()) {
      link.updatedBy = uid(req);
      await link.save();
      if (wasArchived) await auditItem(req, 'content_restored', link, 'Added back');
      else if (wasVisible !== link.isVisible) await auditItem(req, link.isVisible ? 'content_shown' : 'content_hidden', link, link.isVisible ? 'Showed' : 'Hid');
    }
  }

  for (const link of links) {
    if (link.archivedAt || keep.has(link.subject!)) continue;
    link.archivedAt = new Date();
    link.updatedBy = uid(req);
    await link.save();
    await auditItem(req, 'content_archived', link, 'Removed');
  }
}

/** A link's difficulty and time, from an editor row (unset fields keep what was there). */
function linkMeta(row: SubjectRow, prev?: IContentItem['meta']): IContentItem['meta'] {
  const difficulty = row.difficulty !== undefined ? row.difficulty : (prev?.difficulty ?? null);
  const estimatedMinutes = row.estimatedMinutes !== undefined ? row.estimatedMinutes : (prev?.estimatedMinutes ?? null);
  return difficulty === null && estimatedMinutes === null ? null : { difficulty, estimatedMinutes };
}

// ------------------------------------------------------------------------------------ handlers

export const listClasses = asyncHandler(async (req: Request, res: Response) => {
  await ensureCatalogSeeded();
  const { status } = req.query as { status: 'live' | 'archived' | 'all' };
  const filter = status === 'archived' ? { archivedAt: { $ne: null } } : status === 'live' ? { archivedAt: null } : {};
  const [rows, live] = await Promise.all([ContentItem.find({ ...CLASS_FILTER, ...filter }).sort({ order: 1, _id: 1 }), liveClasses()]);
  const look = await lookups(rows.map((r) => r.classLevel!));
  const position = new Map(live.map((c, i) => [c._id.toString(), i + 1]));
  sendSuccess(
    res,
    rows.map((r) => serializeClass(r, position.get(r._id.toString()) ?? null, look)),
  );
});

export const getClass = asyncHandler(async (req: Request, res: Response) => {
  await ensureCatalogSeeded();
  await respondWithClass(res, await findClass(Number(req.params.level)));
});

export const createClass = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as CreateClassInput;
  await ensureCatalogSeeded();
  const existing = await ContentItem.findOne({ ...CLASS_FILTER, classLevel: input.classLevel });
  if (existing) {
    throw AppError.conflict(
      existing.archivedAt ? `Class ${input.classLevel} is archived — restore it instead of adding it again` : `Class ${input.classLevel} already exists`,
    );
  }
  const c = await ContentItem.create({
    type: 'class',
    key: `class-${input.classLevel}`,
    title: input.title,
    subtitle: input.subtitle,
    description: input.description,
    details: input.details,
    thumbnailUrl: input.image,
    classLevel: input.classLevel,
    order: await nextOrder({ ...CLASS_FILTER, archivedAt: null }),
    isEnabled: true,
    isVisible: input.isVisible,
    status: input.status,
    profile: input.profile ?? null,
    source: 'admin',
    createdBy: uid(req),
    updatedBy: uid(req),
  }).catch((err: unknown) => {
    if ((err as { code?: number }).code === 11000) throw AppError.conflict(`Class ${input.classLevel} already exists`);
    throw err;
  });
  if (input.position !== undefined) await placeClass(c, input.position, req);
  await syncSubjects(req, input.classLevel, input.subjects, input.subjectMode);
  invalidateCatalog();
  await auditItem(req, 'content_created', c, input.status === 'draft' ? 'Created draft' : 'Created', { subjects: input.subjects.length, status: input.status });
  await respondWithClass(res, c, 201, 'Class created');
});

export const updateClass = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as UpdateClassInput;
  const c = await findClass(Number(req.params.level));
  if (c.archivedAt) throw AppError.conflict('Restore this class before changing it');

  const fields = { title: 'title', subtitle: 'subtitle', description: 'description', details: 'details', image: 'thumbnailUrl' } as const;
  const edited: string[] = [];
  for (const [from, to] of Object.entries(fields) as [keyof typeof fields, (typeof fields)[keyof typeof fields]][]) {
    if (input[from] === undefined) continue;
    if ((c[to] ?? null) !== (input[from] ?? null)) edited.push(from);
    (c as unknown as Record<string, unknown>)[to] = input[from];
  }
  if (input.profile !== undefined) {
    c.profile = input.profile;
    edited.push('profile');
  }
  const wasVisible = c.isVisible && c.isEnabled;
  if (input.isVisible !== undefined) {
    c.isVisible = input.isVisible;
    // Showing a class switched off elsewhere switches it back on too: "Visible" means visible.
    if (input.isVisible) c.isEnabled = true;
  }
  c.updatedBy = uid(req);
  await c.save();
  const moved = input.position !== undefined ? await placeClass(c, input.position, req) : null;
  if (input.subjects) await syncSubjects(req, c.classLevel!, input.subjects, input.subjectMode);
  invalidateCatalog();

  if (edited.length || input.subjects) await auditItem(req, 'content_updated', c, 'Updated', { fields: input.subjects ? [...edited, 'subjects'] : edited });
  const isVisible = c.isVisible && c.isEnabled;
  if (isVisible !== wasVisible) await auditItem(req, isVisible ? 'content_shown' : 'content_hidden', c, isVisible ? 'Showed' : 'Hid', { field: 'isVisible', previous: wasVisible, next: isVisible });
  if (moved) await auditItem(req, 'content_reordered', c, 'Moved', { previousPosition: moved.from, position: moved.to }, ` from position ${moved.from} to position ${moved.to}`);
  await respondWithClass(res, c, 200, 'Class saved');
});

export const setClassVisibility = asyncHandler(async (req: Request, res: Response) => {
  const { isVisible } = req.body as { isVisible: boolean };
  const c = await findClass(Number(req.params.level));
  if (c.archivedAt) throw AppError.conflict('Restore this class before showing or hiding it');
  const was = c.isVisible && c.isEnabled;
  c.isVisible = isVisible;
  if (isVisible) c.isEnabled = true;
  c.updatedBy = uid(req);
  await c.save();
  invalidateCatalog();
  if (was !== isVisible) await auditItem(req, isVisible ? 'content_shown' : 'content_hidden', c, isVisible ? 'Showed' : 'Hid', { field: 'isVisible', previous: was, next: isVisible });
  await respondWithClass(res, c, 200, isVisible ? 'Class is visible' : 'Class hidden');
});

export const setClassOrder = asyncHandler(async (req: Request, res: Response) => {
  const { position } = req.body as { position: number };
  const c = await findClass(Number(req.params.level));
  if (c.archivedAt) throw AppError.conflict('Archived classes have no position');
  const moved = await placeClass(c, position, req);
  invalidateCatalog();
  if (moved) await auditItem(req, 'content_reordered', c, 'Moved', { previousPosition: moved.from, position: moved.to }, ` from position ${moved.from} to position ${moved.to}`);
  await respondWithClass(res, c, 200, 'Order saved');
});

/** "Delete" archives: the class leaves every page, and everything linked to it stays restorable. */
export const archiveClass = asyncHandler(async (req: Request, res: Response) => {
  const c = await findClass(Number(req.params.level));
  if (c.archivedAt) throw AppError.conflict('This class is already archived');
  c.archivedAt = new Date();
  c.updatedBy = uid(req);
  await c.save();
  invalidateCatalog();
  await auditItem(req, 'content_archived', c, 'Archived');
  await respondWithClass(res, c, 200, 'Class archived');
});

export const restoreClass = asyncHandler(async (req: Request, res: Response) => {
  const c = await findClass(Number(req.params.level));
  if (!c.archivedAt) throw AppError.conflict('This class is not archived');
  c.archivedAt = null;
  c.order = await nextOrder({ ...CLASS_FILTER, archivedAt: null });
  c.updatedBy = uid(req);
  await c.save();
  invalidateCatalog();
  await auditItem(req, 'content_restored', c, 'Restored');
  await respondWithClass(res, c, 200, 'Class restored');
});

// ------------------------------------------------------------------------------------ images

const IMAGE_PREFIX = 'content/images/';

/**
 * A class picture: re-encoded through sharp (so what is stored is a real image, whatever the
 * client claimed), cropped 4:3 to 1200×900 WebP, and kept in the app's storage under a random name.
 */
export const uploadContentImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw AppError.badRequest('Choose an image to upload');
  let webp: Buffer;
  try {
    webp = await sharp(req.file.buffer, { animated: false }).rotate().resize(1200, 900, { fit: 'cover', position: 'attention' }).webp({ quality: 80 }).toBuffer();
  } catch {
    throw AppError.badRequest('That file could not be read as an image');
  }
  const name = `${crypto.randomBytes(16).toString('hex')}.webp`;
  await fs.mkdir(env.tmpDir, { recursive: true });
  const temp = path.join(env.tmpDir, `class-${name}`);
  await fs.writeFile(temp, webp);
  try {
    await getStorageProvider().upload({ key: `${IMAGE_PREFIX}${name}`, sourcePath: temp, contentType: 'image/webp' });
  } catch (err) {
    throw storageFailure('save the image', err);
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
  sendSuccess(res, { url: `/api/content/images/${name}`, width: 1200, height: 900 }, 201, undefined, 'Image uploaded');
});

/** Public: an uploaded content image. Named by random bytes and never changed, so cached for good. */
export const serveContentImage = asyncHandler(async (req: Request, res: Response) => {
  const key = `${IMAGE_PREFIX}${req.params.name}`;
  const provider = getStorageProvider();
  const result = await provider.getObjectStream(key).catch(() => {
    throw AppError.notFound('Image not found');
  });
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Content-Length', result.totalSize);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  result.stream.on('error', () => res.destroy());
  result.stream.pipe(res);
});
