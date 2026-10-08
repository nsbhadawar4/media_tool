import type { AnyBulkWriteOperation, FilterQuery } from 'mongoose';
import { ContentItem, type IContentItem } from '../models/ContentItem';
import { Course } from '../models/Course';
import { CATALOG_SEED, type CatalogSeedEntry } from '../content/catalogSeed';
import type { ContentType } from '../config/constants';
import { logger } from '../utils/logger';

/**
 * The content catalog's server side: seeding / migrating it from the code catalog, the cached
 * public view the site and app read, and the checks that keep disabled content unusable.
 *
 * The learning hierarchy is Class → Subject (a class_subject link says a class offers it) →
 * Course → Game. Something is usable only if every level above it is enabled and not archived.
 */

/**
 * Fields the code decides for code entries — a Kid Game's questions are written for one class and
 * subject and played by one mechanic, so these can't be edited — re-applied on every seed so an
 * older database is backfilled (the migration step) and they can never drift.
 */
function codeOwned(entry: CatalogSeedEntry): Partial<IContentItem> {
  switch (entry.type) {
    case 'class':
      return { classLevel: entry.classLevel ?? null };
    case 'class_subject':
      return { classLevel: entry.classLevel ?? null, subject: entry.subject ?? null };
    case 'kid_game':
      return {
        classLevel: entry.classLevel ?? null,
        subject: entry.subject ?? null,
        difficulty: entry.difficulty ?? null,
        gameType: (entry.gameType as IContentItem['gameType']) ?? null,
      };
    default:
      return {};
  }
}

let seeding: Promise<void> | null = null;

/**
 * Idempotent seed + migration, once per process:
 *  - a code entry that isn't in the database is inserted (`$setOnInsert`): never a duplicate,
 *    whatever runs it how many times, thanks to the unique { type, key } index;
 *  - an existing entry keeps everything an administrator controls (title, order, status…);
 *  - code-owned fields are (re)applied with `$set` — on a database seeded before they existed,
 *    that is the migration that fills them in.
 * Nothing is ever deleted.
 */
export function ensureCatalogSeeded(): Promise<void> {
  if (!seeding) {
    seeding = seedCatalog().then(
      () => undefined,
      (err: unknown) => {
        seeding = null; // try again on the next request
        throw err;
      },
    );
  }
  return seeding;
}

/** One run of the seed + migration; safe to run any number of times (ensureCatalogSeeded: once per process). */
export async function seedCatalog(): Promise<{ inserted: number; updated: number }> {
  const ops: AnyBulkWriteOperation<IContentItem>[] = CATALOG_SEED.map((entry) => {
    const owned = codeOwned(entry);
    const insertOnly: Record<string, unknown> = {
      type: entry.type,
      key: entry.key,
      title: entry.title,
      description: entry.description,
      order: entry.order,
      classLevel: entry.classLevel ?? null,
      subject: entry.subject ?? null,
      isEnabled: true,
      isVisible: entry.isVisible ?? true,
      source: 'code',
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // A path can't be in both $setOnInsert and $set: code-owned fields go only in $set.
    for (const field of Object.keys(owned)) delete insertOnly[field];
    return {
      updateOne: {
        filter: { type: entry.type, key: entry.key },
        update: { $setOnInsert: insertOnly, ...(Object.keys(owned).length ? { $set: owned } : {}) },
        upsert: true,
        // Otherwise Mongoose stamps updatedAt on every entry at every start, and nothing would
        // ever read as unchanged (or as last edited by an administrator).
        timestamps: false,
      },
    };
  });
  const result = await ContentItem.bulkWrite(ops, { ordered: false });
  if (result.upsertedCount) logger.info(`content catalog: seeded ${result.upsertedCount} entries`);
  if (result.modifiedCount) logger.info(`content catalog: updated code-owned fields on ${result.modifiedCount} entries`);
  return { inserted: result.upsertedCount, updated: result.modifiedCount };
}

/** What the site and the app need to know about one catalog entry. */
export interface PublicCatalogEntry {
  key: string;
  title: string;
  description: string;
  order: number;
  classLevel: number | null;
  subject: string | null;
  thumbnailUrl: string | null;
  glyph: string | null;
  difficulty: string | null;
  gameType: string | null;
  courseId: string | null;
  isEnabled: boolean;
  isVisible: boolean;
}

export interface PublicCourseEntry {
  id: string;
  slug: string;
  title: string;
  summary: string;
  classLevel: number | null;
  subject: string | null;
  thumbnailUrl: string | null;
  difficulty: string | null;
  ageGroup: string | null;
  lessonCount: number;
  order: number;
  isEnabled: boolean;
  isVisible: boolean;
}

export interface PublicCatalog {
  sections: PublicCatalogEntry[];
  classes: PublicCatalogEntry[];
  subjects: PublicCatalogEntry[];
  classSubjects: PublicCatalogEntry[];
  kidGames: PublicCatalogEntry[];
  games: PublicCatalogEntry[];
  courses: PublicCourseEntry[];
}

const GROUP: Record<ContentType, Exclude<keyof PublicCatalog, 'courses'>> = {
  section: 'sections',
  class: 'classes',
  subject: 'subjects',
  class_subject: 'classSubjects',
  kid_game: 'kidGames',
  game: 'games',
};

/** Milliseconds a cached catalog is served before it is read again (each instance has its own). */
const CACHE_MS = 30_000;
let cache: { at: number; value: PublicCatalog } | null = null;

/** Drops this instance's cached catalog — after any admin change, so the change shows at once here. */
export function invalidateCatalog(): void {
  cache = null;
}

/** Everything that isn't archived, ordered — archived entries simply don't exist for users. */
export async function getPublicCatalog(): Promise<PublicCatalog> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  await ensureCatalogSeeded();
  const [rows, courses] = await Promise.all([
    ContentItem.find({ archivedAt: null }).sort({ type: 1, classLevel: 1, subject: 1, order: 1, key: 1 }).lean<IContentItem[]>(),
    Course.find({ archivedAt: null }, { lessons: { _id: 1 }, slug: 1, title: 1, summary: 1, classLevel: 1, subject: 1, thumbnailUrl: 1, difficulty: 1, ageGroup: 1, order: 1, isEnabled: 1, isVisible: 1 })
      .sort({ order: 1, _id: 1 })
      .lean(),
  ]);
  const value: PublicCatalog = { sections: [], classes: [], subjects: [], classSubjects: [], kidGames: [], games: [], courses: [] };
  for (const r of rows) {
    value[GROUP[r.type]].push({
      key: r.key,
      title: r.title,
      description: r.description,
      order: r.order,
      classLevel: r.classLevel ?? null,
      subject: r.subject ?? null,
      thumbnailUrl: r.thumbnailUrl ?? null,
      glyph: r.glyph ?? null,
      difficulty: r.difficulty ?? null,
      gameType: r.gameType ?? null,
      courseId: r.courseId ? r.courseId.toString() : null,
      isEnabled: r.isEnabled,
      isVisible: r.isVisible,
    });
  }
  value.courses = courses.map((c) => ({
    id: c._id.toString(),
    slug: c.slug,
    title: c.title,
    summary: c.summary,
    classLevel: c.classLevel ?? null,
    subject: c.subject ?? null,
    thumbnailUrl: c.thumbnailUrl ?? null,
    difficulty: c.difficulty ?? null,
    ageGroup: c.ageGroup ?? null,
    lessonCount: c.lessons?.length ?? 0,
    order: c.order,
    isEnabled: c.isEnabled,
    isVisible: c.isVisible,
  }));
  cache = { at: Date.now(), value };
  return value;
}

/**
 * A website section is ON: it exists (not archived), is enabled and is visible. Some sections also
 * stand for an area of the app — "kid-games" (Kid Games and its courses) and "games" (the arcade) —
 * and switching one OFF closes that area too.
 */
export function isSectionOn(catalog: PublicCatalog, key: string): boolean {
  const section = catalog.sections.find((s) => s.key === key);
  return Boolean(section?.isEnabled && section.isVisible);
}

/**
 * A class offers a subject, and the class, the subject and that link are all enabled — inside a
 * Kid Games area that is switched on.
 */
export function isPairAvailable(catalog: PublicCatalog, classLevel: number, subject: string): boolean {
  if (!isSectionOn(catalog, 'kid-games')) return false;
  const cls = catalog.classes.find((c) => c.classLevel === classLevel);
  const subj = catalog.subjects.find((s) => s.key === subject);
  const link = catalog.classSubjects.find((l) => l.classLevel === classLevel && l.subject === subject);
  return Boolean(cls?.isEnabled && subj?.isEnabled && link?.isEnabled);
}

/**
 * Whether a Kid Game may be played: it, its class, its subject, the class ↔ subject link and its
 * course (if it has one) all exist, aren't archived and are enabled. Checked on the server when a
 * result is saved, so switching anything above a game off means its progress stops being recorded,
 * whatever the browser shows.
 */
export async function isKidGamePlayable(gameId: string, classLevel: number, subject: string): Promise<boolean> {
  const catalog = await getPublicCatalog();
  const game = catalog.kidGames.find((g) => g.key === gameId);
  if (!game?.isEnabled || !isPairAvailable(catalog, classLevel, subject)) return false;
  if (game.courseId) return Boolean(catalog.courses.find((c) => c.id === game.courseId)?.isEnabled);
  return true;
}

/**
 * The siblings an entry is ordered among: Kid Games within their class + subject, a class's
 * subject links within that class, everything else by type.
 */
export function siblingFilter(item: Pick<IContentItem, 'type' | 'classLevel' | 'subject'>): FilterQuery<IContentItem> {
  if (item.type === 'kid_game') return { type: item.type, classLevel: item.classLevel, subject: item.subject };
  if (item.type === 'class_subject') return { type: item.type, classLevel: item.classLevel };
  return { type: item.type };
}

/** The next free position among an entry's siblings. */
export async function nextOrder(filter: FilterQuery<IContentItem>): Promise<number> {
  const last = await ContentItem.findOne(filter, { order: 1 }).sort({ order: -1 }).lean<{ order: number } | null>();
  return (last?.order ?? 0) + 1;
}
