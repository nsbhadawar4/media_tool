import type { Request, Response } from 'express';
import { Types, type ClientSession } from 'mongoose';

import { ContentItem, type IContentItem } from '../models/ContentItem';
import { Course, type ICourse } from '../models/Course';
import { CourseProgress } from '../models/CourseProgress';
import { CourseGenerationJob } from '../models/CourseGenerationJob';
import { KidGameRecord } from '../models/KidGameProgress';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { logger } from '../utils/logger';
import { invalidateCatalog, nextOrder, siblingFilter } from '../services/contentService';
import { ARCHIVED_FILTER, TRASHED_FILTER, restoreFields, stateOf, transition, type LifecycleState } from '../services/archive';
import { inTransaction } from '../services/transaction';
import { getStorageProvider } from '../services/storage';
import type { ActivityAction } from '../config/constants';
import { auditCourse, auditItem } from './adminContentController';
import { LIFECYCLE_KINDS, type LifecycleKind, type LifecycleListQuery, type LifecycleRef } from '../validators/lifecycleValidators';

/**
 * Admin → Archive and Admin → Trash / Deleted (see services/archive for the states). One place for
 * every lifecycle move of classes, subjects, courses (a subject in a class), chapters, Kid Games,
 * games and sections, each checked against the entry's current state:
 *
 *   archive  ACTIVE → ARCHIVED          trash    ACTIVE → TRASHED
 *   archive/restore  ARCHIVED → ACTIVE  archive/trash  ARCHIVED → TRASHED
 *   trash/restore    TRASHED → ACTIVE   trash/delete   TRASHED → gone (typed DELETE)
 *
 * Restoring checks parents first (a chapter needs its class, subject and course) and never builds a
 * broken relationship. Forever Delete removes what depends on the entry in one transaction and
 * refuses built-in entries (the app would re-create them on its next start). Every move is logged.
 */

type Kind = LifecycleKind;
const CONTENT_TYPE: Record<Exclude<Kind, 'chapter'>, IContentItem['type']> = {
  class: 'class',
  subject: 'subject',
  course: 'class_subject',
  kid_game: 'kid_game',
  game: 'game',
  section: 'section',
};
const KIND_OF_TYPE = Object.fromEntries(Object.entries(CONTENT_TYPE).map(([k, t]) => [t, k])) as Record<string, Kind>;
export const KIND_LABEL: Record<Kind, string> = { class: 'Class', subject: 'Subject', course: 'Course', chapter: 'Chapter', kid_game: 'Kid Game', game: 'Game', section: 'Section' };
const PLACE: Record<LifecycleState, string> = { active: 'active', archived: 'in Archive', trashed: 'in Trash' };

const uid = (req: Request) => new Types.ObjectId(req.user!.id);
const IMAGE_URL = /^\/api\/content\/images\/([a-f0-9]{32}\.webp)$/;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ------------------------------------------------------------------------------------ loading

interface Loaded {
  kind: Kind;
  item?: IContentItem;
  chapter?: ICourse;
}

/** The entry an id names — only if it really is of that kind (an id can't be passed off as another kind). */
async function load(ref: LifecycleRef, session: ClientSession | null = null): Promise<Loaded> {
  if (ref.kind === 'chapter') {
    const chapter = await Course.findById(ref.id).session(session);
    if (!chapter) throw AppError.notFound('This chapter no longer exists');
    return { kind: 'chapter', chapter };
  }
  const item = await ContentItem.findOne({ _id: ref.id, type: CONTENT_TYPE[ref.kind] }).session(session);
  if (!item) throw AppError.notFound(`This ${KIND_LABEL[ref.kind].toLowerCase()} no longer exists`);
  return { kind: ref.kind, item };
}

const docOf = (l: Loaded) => (l.item ?? l.chapter)!;
const titleOf = (l: Loaded) => docOf(l).title;
const stateOfLoaded = (l: Loaded) => stateOf(docOf(l));
const modelOf = (l: Loaded) => (l.item ? ContentItem : Course) as unknown as typeof ContentItem;

/** The audit trail: catalog entries as content_*, chapters as course_*. */
async function audit(req: Request, l: Loaded, what: 'archived' | 'trashed' | 'restored' | 'permanently_deleted', verb: string, metadata: Record<string, unknown>) {
  const meta = { kind: l.kind, ...metadata };
  if (l.item) await auditItem(req, `content_${what}` as ActivityAction, l.item, verb, meta);
  else await auditCourse(req, `course_${what}` as ActivityAction, l.chapter!, verb, meta);
}

// ------------------------------------------------------------------------------------ parents

interface Blocker {
  kind: Kind;
  id: string | null;
  title: string;
  /** archived / trashed: bring it back first (or with the item); missing: it is gone, so this can't come back. */
  reason: 'archived' | 'trashed' | 'missing';
}

/** What must be active before this entry can come back: its class, subject and (chapters) course. */
async function parentsOf(kind: Kind, classLevel: number | null, subject: string | null): Promise<Blocker[]> {
  const out: Blocker[] = [];
  if (!['course', 'chapter', 'kid_game'].includes(kind)) return out;
  const check = async (k: Kind, filter: Record<string, unknown>, fallback: string) => {
    const parent = await ContentItem.findOne(filter, { title: 1, archivedAt: 1, trashedAt: 1 });
    if (!parent) out.push({ kind: k, id: null, title: fallback, reason: 'missing' });
    else if (parent.archivedAt) out.push({ kind: k, id: String(parent._id), title: parent.title, reason: parent.trashedAt ? 'trashed' : 'archived' });
  };
  if (classLevel) await check('class', { type: 'class', classLevel }, `Class ${classLevel}`);
  if (subject) await check('subject', { type: 'subject', key: subject }, subject);
  if (kind === 'chapter' && classLevel && subject) await check('course', { type: 'class_subject', classLevel, subject }, `Class ${classLevel} · ${subject}`);
  return out;
}

const parentsOfLoaded = (l: Loaded) => (l.chapter ? parentsOf('chapter', l.chapter.classLevel, l.chapter.subject) : parentsOf(l.kind, l.item!.classLevel, l.item!.subject));

// ------------------------------------------------------------------------------------ what an entry holds

/** Plain counts of what depends on an entry — shown before restoring or deleting it. */
async function contentsOf(l: Loaded): Promise<string[]> {
  const n = (count: number, one: string, many = `${one}s`) => (count ? [`${count} ${count === 1 ? one : many}`] : []);
  if (l.chapter) {
    const [r] = await Course.aggregate<{ lessons: number; quiz: number }>([{ $match: { _id: l.chapter._id } }, { $project: { lessons: { $size: '$lessons' }, quiz: { $size: '$quiz' } } }]);
    return [...n(r?.lessons ?? 0, 'lesson'), ...n(r?.quiz ?? 0, 'quiz question')];
  }
  const it = l.item!;
  if (l.kind === 'class') {
    const [subjects, chapters, games] = await Promise.all([
      ContentItem.countDocuments({ type: 'class_subject', classLevel: it.classLevel }),
      Course.countDocuments({ classLevel: it.classLevel }),
      ContentItem.countDocuments({ type: 'kid_game', classLevel: it.classLevel }),
    ]);
    return [...n(subjects, 'subject'), ...n(chapters, 'chapter'), ...n(games, 'Kid Game')];
  }
  if (l.kind === 'subject') {
    const [classes, chapters] = await Promise.all([ContentItem.countDocuments({ type: 'class_subject', subject: it.key }), Course.countDocuments({ subject: it.key })]);
    return [...n(classes, 'class', 'classes'), ...n(chapters, 'chapter')];
  }
  if (l.kind === 'course') return n(await Course.countDocuments({ classLevel: it.classLevel, subject: it.subject }), 'chapter');
  return [];
}

/** Why an entry in Trash can't be deleted for good, or null. */
async function deleteBlockOf(l: Loaded): Promise<string | null> {
  if (l.item?.source === 'code') return 'Built into the app — it would come back on the next restart. Restore it, or leave it in Trash.';
  if (l.kind === 'subject') {
    const live = await ContentItem.find({ type: 'class_subject', subject: l.item!.key, archivedAt: null }, { classLevel: 1 }).lean();
    if (live.length) return `Still offered by ${live.map((x) => `Class ${x.classLevel}`).join(', ')} — remove it from ${live.length === 1 ? 'that class' : 'those classes'} first.`;
  }
  if (l.kind === 'class' && (await ContentItem.exists({ type: 'kid_game', classLevel: l.item!.classLevel, source: 'code' }))) {
    return 'This class has built-in Kid Games — restore it, or leave it in Trash.';
  }
  return null;
}

// ------------------------------------------------------------------------------------ listing

interface Row {
  kind: Kind;
  id: string;
  title: string;
  classLevel: number | null;
  subject: string | null;
  /** When it went to Archive / Trash, and by whom. */
  at: Date;
  by: Types.ObjectId | null;
  archivedAt: Date | null;
  archivedBy: Types.ObjectId | null;
  builtIn: boolean;
}

function placeOf(kind: Kind, classLevel: number | null, subjectTitle: string | null): { parent: string | null; location: string } {
  const cls = classLevel ? `Class ${classLevel}` : null;
  switch (kind) {
    case 'class':
      return { parent: null, location: 'Manage Courses' };
    case 'subject':
      return { parent: null, location: 'Content → Subjects' };
    case 'course':
      return { parent: cls, location: `Manage Courses → ${cls ?? 'class'}` };
    case 'chapter':
      return { parent: [cls, subjectTitle].filter(Boolean).join(' · ') || null, location: `Manage Courses → ${cls ?? 'class'}${subjectTitle ? ` → ${subjectTitle}` : ''}` };
    case 'kid_game':
      return { parent: [cls, subjectTitle].filter(Boolean).join(' · ') || null, location: 'Content → Kid Games' };
    case 'game':
      return { parent: null, location: 'Content → Games' };
    case 'section':
      return { parent: null, location: 'Content → Landing page' };
  }
}

type Counts = Record<Kind | 'all', number>;

/** How many entries are in one state, by kind (the stat cards and the sidebar badges). */
async function countsIn(state: 'archived' | 'trashed'): Promise<Counts> {
  const filter = state === 'archived' ? ARCHIVED_FILTER : TRASHED_FILTER;
  const [byType, chapters] = await Promise.all([
    ContentItem.aggregate<{ _id: string; n: number }>([{ $match: { ...filter, type: { $in: Object.values(CONTENT_TYPE) } } }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
    Course.countDocuments(filter),
  ]);
  const counts = Object.fromEntries(LIFECYCLE_KINDS.map((k) => [k, 0])) as Counts;
  for (const t of byType) counts[KIND_OF_TYPE[t._id]!] = t.n;
  counts.chapter = chapters;
  counts.all = LIFECYCLE_KINDS.reduce((sum, k) => sum + counts[k], 0);
  return counts;
}

/** GET /api/admin/lifecycle/summary — how many entries are in Archive and in Trash (the sidebar badges). */
export const lifecycleSummary = asyncHandler(async (_req: Request, res: Response) => {
  const [archive, trash] = await Promise.all([countsIn('archived'), countsIn('trashed')]);
  sendSuccess(res, { archive, trash });
});

/** The Archive or Trash list: searched, filtered, sorted and paged. */
async function listIn(state: 'archived' | 'trashed', q: LifecycleListQuery) {
  const stateFilter = state === 'archived' ? ARCHIVED_FILTER : TRASHED_FILTER;
  const text = q.q.trim();
  const textFilter = text ? { $or: [{ title: { $regex: escapeRegex(text), $options: 'i' } }, ...(Types.ObjectId.isValid(text) && text.length === 24 ? [{ _id: new Types.ObjectId(text) }] : [])] } : {};
  const byFilter = state === 'trashed' && q.by ? { trashedBy: new Types.ObjectId(q.by) } : {};
  const wanted: readonly Kind[] = q.type === 'all' ? LIFECYCLE_KINDS : [q.type];
  const contentKinds = wanted.filter((k): k is Exclude<Kind, 'chapter'> => k !== 'chapter');
  const wantChapters = wanted.includes('chapter');
  const fields = { title: 1, classLevel: 1, subject: 1, archivedAt: 1, archivedBy: 1, trashedAt: 1, trashedBy: 1, updatedBy: 1 };

  const [items, chapters, subjects] = await Promise.all([
    contentKinds.length
      ? ContentItem.find({ $and: [{ type: { $in: contentKinds.map((k) => CONTENT_TYPE[k]) } }, stateFilter, textFilter, byFilter] }, { ...fields, type: 1, source: 1 })
          .limit(5000)
          .lean<IContentItem[]>()
      : Promise.resolve([] as IContentItem[]),
    wantChapters
      ? Course.find({ $and: [stateFilter, textFilter, byFilter] }, fields)
          .limit(5000)
          .lean<ICourse[]>()
      : Promise.resolve([] as ICourse[]),
    ContentItem.find({ type: 'subject' }, { key: 1, title: 1 }).lean<Array<{ key: string; title: string }>>(),
  ]);
  const subjectTitle = new Map(subjects.map((s) => [s.key, s.title]));
  const toRow = (kind: Kind, d: IContentItem | ICourse, builtIn: boolean): Row => ({
    kind,
    id: String(d._id),
    title: d.title,
    classLevel: d.classLevel,
    subject: d.subject,
    at: (state === 'trashed' ? d.trashedAt : d.archivedAt)!,
    // Entries archived before "archived by" was kept: whoever last changed them is who archived them.
    by: state === 'trashed' ? (d.trashedBy ?? null) : (d.archivedBy ?? d.updatedBy ?? null),
    archivedAt: state === 'trashed' && d.archivedBy ? d.archivedAt : null,
    archivedBy: state === 'trashed' ? (d.archivedBy ?? null) : null,
    builtIn,
  });
  let rows: Row[] = [...items.map((it) => toRow(KIND_OF_TYPE[it.type]!, it, it.source === 'code')), ...chapters.map((c) => toRow('chapter', c, false))];
  if (q.from) rows = rows.filter((r) => r.at >= new Date(q.from!));
  if (q.to) rows = rows.filter((r) => r.at <= new Date(q.to!));
  const byName = (a: Row, b: Row) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
  rows.sort(q.sort === 'oldest' ? (a, b) => a.at.getTime() - b.at.getTime() : q.sort === 'name' ? byName : q.sort === 'name_desc' ? (a, b) => byName(b, a) : (a, b) => b.at.getTime() - a.at.getTime());

  const total = rows.length;
  const page = rows.slice((q.page - 1) * q.limit, q.page * q.limit);
  // Trash's "Deleted by" filter: everyone who deleted something now in Trash.
  const deleterIds =
    state === 'trashed' ? [...new Set([...(await ContentItem.distinct('trashedBy', TRASHED_FILTER)), ...(await Course.distinct('trashedBy', TRASHED_FILTER))].filter(Boolean).map(String))] : [];
  const people = await User.find({ _id: { $in: [...page.flatMap((r) => [r.by, r.archivedBy]).filter(Boolean), ...deleterIds] } }, { name: 1, email: 1 }).lean();
  const who = new Map(people.map((p) => [String(p._id), p.name || p.email || 'Administrator']));
  const nameOf = (id: Types.ObjectId | null) => (id ? (who.get(String(id)) ?? 'Former administrator') : null);

  const out = await Promise.all(
    page.map(async (r) => {
      const loaded = await load({ kind: r.kind, id: r.id });
      const [blockers, contains, deleteBlock] = await Promise.all([parentsOfLoaded(loaded), contentsOf(loaded), state === 'trashed' ? deleteBlockOf(loaded) : Promise.resolve(null)]);
      return {
        kind: r.kind,
        id: r.id,
        title: r.title,
        ...placeOf(r.kind, r.classLevel, r.subject ? (subjectTitle.get(r.subject) ?? r.subject) : null),
        state,
        at: r.at,
        by: nameOf(r.by),
        /** Trash only: it was archived before it was deleted (when, by whom). */
        archivedAt: r.archivedAt,
        archivedBy: nameOf(r.archivedBy),
        builtIn: r.builtIn,
        contains,
        restoreBlockedBy: blockers,
        deleteBlock,
      };
    }),
  );
  return {
    items: out,
    total,
    page: q.page,
    limit: q.limit,
    pages: Math.max(1, Math.ceil(total / q.limit)),
    counts: await countsIn(state),
    ...(state === 'trashed' ? { deleters: deleterIds.map((id) => ({ id, name: who.get(id) ?? 'Former administrator' })) } : {}),
  };
}

/** GET /api/admin/archive */
export const listArchive = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await listIn('archived', req.query as unknown as LifecycleListQuery));
});

/** GET /api/admin/trash */
export const listTrash = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await listIn('trashed', req.query as unknown as LifecycleListQuery));
});

// ------------------------------------------------------------------------------------ moves

interface Outcome {
  kind: Kind;
  id: string;
  title: string | null;
  ok: boolean;
  /** ARCHIVED, TRASHED, RESTORED, DELETED, NOT_FOUND, WRONG_STATE, PARENT_ARCHIVED, PARENT_MISSING, BUILT_IN, IN_USE, FAILED */
  code: string;
  message: string;
  blockers?: Blocker[];
  removed?: Record<string, number>;
}

const fail = (ref: LifecycleRef, title: string | null, code: string, message: string, extra: Partial<Outcome> = {}): Outcome => ({
  kind: ref.kind,
  id: ref.id,
  title,
  ok: false,
  code,
  message,
  ...extra,
});

/** Why a move isn't allowed from this state, in the admin's words. */
function wrongState(title: string, state: LifecycleState, move: 'archive' | 'trash' | 'restore-archive' | 'restore-trash' | 'archive-to-trash' | 'delete'): string {
  if (move === 'delete') return state === 'archived' ? `${title} is in Archive — move it to Trash first.` : `${title} is active — move it to Trash first.`;
  if (move === 'restore-archive') return state === 'trashed' ? `${title} is in Trash — restore it from Trash / Deleted.` : `${title} is not archived.`;
  if (move === 'restore-trash') return state === 'archived' ? `${title} is in Archive — restore it from Archive.` : `${title} is not in Trash.`;
  if (move === 'archive-to-trash') return `${title} is not in Archive (it is ${PLACE[state]}).`;
  return `${title} is already ${PLACE[state]}.`;
}

/** ACTIVE → ARCHIVED or ACTIVE → TRASHED, one entry, atomically (only while it is still active). */
async function removeFromActive(req: Request, ref: LifecycleRef, to: 'archived' | 'trashed'): Promise<Outcome> {
  let l: Loaded;
  try {
    l = await load(ref);
  } catch {
    return fail(ref, null, 'NOT_FOUND', 'It no longer exists.');
  }
  const title = titleOf(l);
  const state = stateOfLoaded(l);
  if (state !== 'active') return fail(ref, title, 'WRONG_STATE', wrongState(title, state, to === 'archived' ? 'archive' : 'trash'));
  const by = uid(req);
  const at = new Date();
  const set =
    to === 'archived' ? { archivedAt: at, archivedBy: by, trashedAt: null, trashedBy: null, updatedBy: by } : { archivedAt: at, archivedBy: null, trashedAt: at, trashedBy: by, updatedBy: by };
  const done = await modelOf(l).updateOne({ _id: docOf(l)._id, archivedAt: null }, { $set: set });
  if (!done.modifiedCount) return fail(ref, title, 'WRONG_STATE', `${title} was just changed by someone else — refresh and try again.`);
  await audit(req, l, to, to === 'archived' ? 'Archived' : 'Moved to Trash', transition('active', to));
  return { kind: ref.kind, id: ref.id, title, ok: true, code: to === 'archived' ? 'ARCHIVED' : 'TRASHED', message: to === 'archived' ? `${title} archived.` : `${title} moved to Trash.` };
}

/** ARCHIVED → TRASHED: it keeps when and by whom it was archived. */
async function archiveToTrash(req: Request, ref: LifecycleRef): Promise<Outcome> {
  let l: Loaded;
  try {
    l = await load(ref);
  } catch {
    return fail(ref, null, 'NOT_FOUND', 'It no longer exists.');
  }
  const title = titleOf(l);
  const state = stateOfLoaded(l);
  if (state !== 'archived') return fail(ref, title, 'WRONG_STATE', wrongState(title, state, 'archive-to-trash'));
  const by = uid(req);
  const done = await modelOf(l).updateOne({ _id: docOf(l)._id, ...ARCHIVED_FILTER }, { $set: { trashedAt: new Date(), trashedBy: by, updatedBy: by } });
  if (!done.modifiedCount) return fail(ref, title, 'WRONG_STATE', `${title} was just changed by someone else — refresh and try again.`);
  await audit(req, l, 'trashed', 'Moved from Archive to Trash', transition('archived', 'trashed'));
  return { kind: ref.kind, id: ref.id, title, ok: true, code: 'TRASHED', message: `${title} moved to Trash.` };
}

/**
 * ARCHIVED → ACTIVE (from: archived) or TRASHED → ACTIVE (from: trashed), atomically. With parents:
 * an archived or trashed parent is restored first (from wherever it is); a missing one blocks it.
 */
async function restoreOne(req: Request, ref: LifecycleRef, from: LifecycleState | 'any', withParents: boolean, depth = 0): Promise<Outcome> {
  let l: Loaded;
  try {
    l = await load(ref);
  } catch {
    return fail(ref, null, 'NOT_FOUND', 'It no longer exists.');
  }
  const title = titleOf(l);
  const state = stateOfLoaded(l);
  if (state === 'active' || (from !== 'any' && state !== from)) return fail(ref, title, 'WRONG_STATE', wrongState(title, state, from === 'trashed' ? 'restore-trash' : 'restore-archive'));

  const blockers = await parentsOfLoaded(l);
  const missing = blockers.filter((b) => b.reason === 'missing');
  if (missing.length)
    return fail(ref, title, 'PARENT_MISSING', `${missing.map((b) => b.title).join(' and ')} no longer ${missing.length === 1 ? 'exists' : 'exist'}, so ${title} can't be restored.`, { blockers });
  if (blockers.length) {
    if (!withParents || depth > 3) {
      return fail(
        ref,
        title,
        'PARENT_ARCHIVED',
        `Parent content is currently ${blockers.some((b) => b.reason === 'trashed') ? 'in Trash' : 'archived'} (${blockers.map((b) => `${KIND_LABEL[b.kind]} ${b.title}`).join(', ')}). Restore the parent first?`,
        { blockers },
      );
    }
    for (const b of blockers) {
      const parent = await restoreOne(req, { kind: b.kind, id: b.id! }, 'any', true, depth + 1);
      if (!parent.ok && parent.code !== 'WRONG_STATE') return { ...parent, kind: ref.kind, id: ref.id, title, message: `Could not restore ${b.title}: ${parent.message}` };
    }
  }

  const by = uid(req);
  const stateFilter = state === 'trashed' ? TRASHED_FILTER : ARCHIVED_FILTER;
  // Back at the end of its siblings, so it never collides with what was reordered meanwhile.
  const order = l.item
    ? await nextOrder({ ...siblingFilter(l.item), archivedAt: null })
    : ((await Course.findOne({ archivedAt: null }, { order: 1 }).sort({ order: -1 }).lean<{ order: number } | null>())?.order ?? 0) + 1;
  const done = await modelOf(l).updateOne({ _id: docOf(l)._id, ...stateFilter }, { $set: { ...restoreFields(by), order } });
  if (!done.modifiedCount) return fail(ref, title, 'WRONG_STATE', `${title} was already restored.`);
  await audit(req, l, 'restored', state === 'trashed' ? 'Restored from Trash' : 'Restored from Archive', { ...transition(state, 'active'), from: state === 'trashed' ? 'trash' : 'archive' });
  return { kind: ref.kind, id: ref.id, title, ok: true, code: 'RESTORED', message: 'Item restored successfully.' };
}

// ------------------------------------------------------------------------------------ forever delete

/** Removes an entry in Trash and everything that depends on it, in the caller's transaction. Returns what went. */
async function removeWithDependents(l: Loaded, session: ClientSession | null): Promise<{ removed: Record<string, number>; images: string[] }> {
  const s = { session: session ?? undefined };
  const removed: Record<string, number> = {};
  const images: string[] = [];
  const add = (k: string, n: number) => n && (removed[k] = (removed[k] ?? 0) + n);

  const dropChapters = async (filter: Record<string, unknown>) => {
    const ids = (await Course.find(filter, { _id: 1 }).session(session).lean()).map((c) => c._id);
    if (!ids.length) return;
    add('progress', (await CourseProgress.deleteMany({ chapterId: { $in: ids } }, s)).deletedCount);
    await ContentItem.updateMany({ courseId: { $in: ids } }, { $set: { courseId: null } }, s);
    add('chapters', (await Course.deleteMany({ _id: { $in: ids } }, s)).deletedCount);
  };
  const dropItems = async (filter: Record<string, unknown>, label: string) => {
    const docs = await ContentItem.find(filter, { key: 1, type: 1, thumbnailUrl: 1 }).session(session).lean();
    if (!docs.length) return;
    const games = docs.filter((d) => d.type === 'kid_game').map((d) => d.key);
    if (games.length) add('kidGameProgress', (await KidGameRecord.deleteMany({ gameId: { $in: games } }, s)).deletedCount);
    images.push(...docs.map((d) => d.thumbnailUrl ?? '').filter((u) => IMAGE_URL.test(u)));
    add(label, (await ContentItem.deleteMany({ _id: { $in: docs.map((d) => d._id) } }, s)).deletedCount);
  };

  if (l.chapter) {
    // Only while it is still in Trash.
    await dropChapters({ _id: l.chapter._id, ...TRASHED_FILTER });
    return { removed, images };
  }
  const it = l.item!;
  if (l.kind === 'class') {
    await dropChapters({ classLevel: it.classLevel });
    await dropItems({ type: 'class_subject', classLevel: it.classLevel }, 'courses');
    await dropItems({ type: 'kid_game', classLevel: it.classLevel, source: 'admin' }, 'kidGames');
    add('generationJobs', (await CourseGenerationJob.deleteMany({ classLevel: it.classLevel }, s)).deletedCount);
  } else if (l.kind === 'subject') {
    await dropChapters({ subject: it.key });
    await dropItems({ type: 'class_subject', subject: it.key }, 'courses');
    await dropItems({ type: 'kid_game', subject: it.key, source: 'admin' }, 'kidGames');
    add('generationJobs', (await CourseGenerationJob.deleteMany({ subjectKey: it.key }, s)).deletedCount);
  } else if (l.kind === 'course') {
    await dropChapters({ classLevel: it.classLevel, subject: it.subject });
    add('generationJobs', (await CourseGenerationJob.deleteMany({ classLevel: it.classLevel, subjectKey: it.subject }, s)).deletedCount);
  }
  // The entry itself — only while it is still in Trash (never an active or archived entry, never twice).
  await dropItems({ _id: it._id, ...TRASHED_FILTER }, 'self');
  return { removed, images };
}

/** Uploaded pictures nothing uses any more are removed from storage too (after the database commit). */
async function dropUnusedImages(urls: string[]) {
  for (const url of [...new Set(urls)]) {
    if (await ContentItem.exists({ thumbnailUrl: url })) continue;
    const name = IMAGE_URL.exec(url)![1];
    await getStorageProvider()
      .delete(`content/images/${name}`)
      .catch((err: unknown) => logger.warn(`trash: could not remove image ${name} from storage: ${err instanceof Error ? err.message : String(err)}`));
  }
}

/** TRASHED → gone. The only way anything is removed for good. */
async function foreverDelete(req: Request, ref: LifecycleRef): Promise<Outcome> {
  let l: Loaded;
  try {
    l = await load(ref);
  } catch {
    return fail(ref, null, 'NOT_FOUND', 'It no longer exists (it may already be deleted).');
  }
  const title = titleOf(l);
  const state = stateOfLoaded(l);
  if (state !== 'trashed') return fail(ref, title, 'WRONG_STATE', wrongState(title, state, 'delete'));
  const block = await deleteBlockOf(l);
  if (block) return fail(ref, title, l.item?.source === 'code' ? 'BUILT_IN' : 'IN_USE', block);

  let result: { removed: Record<string, number>; images: string[] };
  try {
    result = await inTransaction(async (session) => {
      // Re-read inside the transaction: still there, still in Trash.
      const fresh = await load(ref, session);
      if (stateOfLoaded(fresh) !== 'trashed') throw AppError.conflict(`${title} is no longer in Trash`);
      return removeWithDependents(fresh, session);
    });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error(`trash: forever delete of ${ref.kind} ${ref.id} failed`, err);
    return fail(
      ref,
      title,
      err instanceof AppError && err.statusCode === 404 ? 'NOT_FOUND' : 'FAILED',
      err instanceof AppError ? err.message : 'The database refused the deletion; nothing was removed.',
    );
  }
  if (l.item && !result.removed.self) return fail(ref, title, 'NOT_FOUND', `${title} was already deleted.`);
  if (l.chapter && !result.removed.chapters) return fail(ref, title, 'NOT_FOUND', `${title} was already deleted.`);
  await dropUnusedImages(result.images);
  const { self: _self, ...dependents } = result.removed;
  if (l.chapter) dependents.chapters = (dependents.chapters ?? 1) - 1; // the chapter itself is not a dependent
  if (!dependents.chapters) delete dependents.chapters;
  await audit(req, l, 'permanently_deleted', 'Permanently deleted', { ...transition('trashed', 'deleted'), removed: dependents });
  return { kind: ref.kind, id: ref.id, title, ok: true, code: 'DELETED', message: 'Item permanently deleted.', removed: dependents };
}

// ------------------------------------------------------------------------------------ endpoints

/** One entry: a 409 (or 404) when the move isn't allowed, else the outcome. */
function single(res: Response, outcome: Outcome) {
  if (!outcome.ok) throw outcome.code === 'NOT_FOUND' ? AppError.notFound(outcome.message) : AppError.conflict(outcome.message);
  invalidateCatalog();
  sendSuccess(res, outcome, 200, undefined, outcome.message);
}

/** Many entries, one at a time (a parent restored for one is then active for the next); each result says what happened. */
async function many(req: Request, res: Response, run: (ref: LifecycleRef) => Promise<Outcome>, label: string) {
  const { items } = req.body as { items: LifecycleRef[] };
  const results: Outcome[] = [];
  for (const ref of items) results.push(await run(ref));
  const done = results.filter((r) => r.ok).length;
  if (done) invalidateCatalog();
  sendSuccess(res, { results, done, failed: results.length - done }, 200, undefined, done ? `${done} ${label}` : 'Nothing changed');
}

/** POST /api/admin/archive — ACTIVE → ARCHIVED. */
export const archiveItem = asyncHandler(async (req: Request, res: Response) => single(res, await removeFromActive(req, req.body as LifecycleRef, 'archived')));
/** POST /api/admin/trash — ACTIVE → TRASHED (Delete). */
export const trashItem = asyncHandler(async (req: Request, res: Response) => single(res, await removeFromActive(req, req.body as LifecycleRef, 'trashed')));
/** POST /api/admin/archive/restore — ARCHIVED → ACTIVE. */
export const restoreFromArchive = asyncHandler(async (req: Request, res: Response) =>
  many(req, res, (ref) => restoreOne(req, ref, 'archived', (req.body as { withParents: boolean }).withParents), 'restored'),
);
/** POST /api/admin/archive/trash — ARCHIVED → TRASHED. */
export const moveArchiveToTrash = asyncHandler(async (req: Request, res: Response) => many(req, res, (ref) => archiveToTrash(req, ref), 'moved to Trash'));
/** POST /api/admin/trash/restore — TRASHED → ACTIVE. */
export const restoreFromTrash = asyncHandler(async (req: Request, res: Response) =>
  many(req, res, (ref) => restoreOne(req, ref, 'trashed', (req.body as { withParents: boolean }).withParents), 'restored'),
);
/** POST /api/admin/trash/delete — TRASHED → gone (confirm: "DELETE"). */
export const foreverDeleteFromTrash = asyncHandler(async (req: Request, res: Response) => many(req, res, (ref) => foreverDelete(req, ref), 'permanently deleted'));
