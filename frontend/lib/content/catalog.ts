import { ALL_GAMES, CLASS_INFO, CLASS_LEVELS, SUBJECTS, SUBJECT_INFO } from '../kid-games/catalog';
import { GAMES, type GameMeta } from '../../components/games/games';
import type { ClassLevel, LearningGame, Subject } from '../kid-games/types';
import type { CatalogCourse, CatalogEntry, PublicCatalog } from '../api/content';
import { isSectionOn } from './sections';

/**
 * The code catalog seen through the admin-managed one: what is listed, in which order, under
 * which title, and what can be opened or played.
 *
 * The learning hierarchy is Class → Subject (a class offers it) → Course → Game, and rules apply
 * at every level (enabled = usable, visible = listed):
 *  - something disabled, or archived (absent from the catalog), can't be opened or played — nor can
 *    anything under it;
 *  - something hidden is left out of lists, but still opens from a direct link;
 *  - a Kid Game needs its class, subject, the class ↔ subject link and its course (if any) enabled
 *    to be played, and all of them visible to be listed.
 * Classes and subjects that exist only in the database (e.g. a "Class 6" or "Science" an
 * administrator added) are included: they carry courses, even before any game is built for them.
 * With no catalog (still loading, or the API unreachable) the code catalog applies unchanged.
 */

export interface ClassView {
  level: number;
  key: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  /** Classes 1–5: the app has games and artwork for them. */
  isCode: boolean;
}

export interface SubjectView {
  key: string;
  title: string;
  description: string;
  glyph: string | null;
  thumbnailUrl: string | null;
  isCode: boolean;
}

export interface ResolvedCatalog {
  /** True once the server's catalog is applied (false: code defaults). */
  fromServer: boolean;
  /** Listed classes, in order — code and database-only alike. */
  classViews: ClassView[];
  /** A class that can be opened (enabled, maybe hidden), by its URL slug "class-N". */
  classBySlug(slug: string): ClassView | null;
  /** Subjects listed in a class, in order. */
  subjectsFor(level: number): SubjectView[];
  /** A subject that can be opened (enabled, maybe hidden). */
  subjectView(key: string): SubjectView | null;
  /** The class, the subject and the link between them are all enabled. */
  isPairAvailable(level: number, subject: string): boolean;
  /** Listed courses, in order; optionally one class and subject. */
  coursesFor(level?: number, subject?: string): CatalogCourse[];
  /** Listed Kid Games that belong to a course. */
  gamesInCourse(courseId: string): LearningGame[];

  /** Code classes listed (for filters that work on code games). */
  classes: ClassLevel[];
  /** Code subjects listed. */
  subjects: Subject[];
  isClassAvailable(level: number): boolean;
  isSubjectAvailable(subject: string): boolean;
  isGamePlayable(id: string): boolean;
  /** Kid Games to list, in order, with administrator titles; optionally one class / subject. */
  listedGames(level?: number, subject?: string): LearningGame[];
  /** A Kid Game with the administrator's title and description applied. */
  applyGame(game: LearningGame): LearningGame;
  arcadeGames: GameMeta[];
  isArcadePlayable(slug: string): boolean;
  applyArcade(game: GameMeta): GameMeta;
  /** A website section is ON — some also stand for an app area ("games", "kid-games"); see sections.ts. */
  isSectionOn(key: string): boolean;
}

const byKey = <T extends { key: string }>(entries: T[]) => new Map(entries.map((e) => [e.key, e]));
const isCodeLevel = (level: number) => (CLASS_LEVELS as readonly number[]).includes(level);
const isCodeSubject = (key: string) => (SUBJECTS as readonly string[]).includes(key);

function codeClassView(level: ClassLevel): ClassView {
  return { level, key: CLASS_INFO[level].slug, title: `Class ${level}`, description: CLASS_INFO[level].tagline, thumbnailUrl: null, isCode: true };
}
function codeSubjectView(subject: Subject): SubjectView {
  const info = SUBJECT_INFO[subject];
  return { key: subject, title: info.name, description: info.native, glyph: info.glyph, thumbnailUrl: null, isCode: true };
}
const levelFromSlug = (slug: string) => {
  const match = /^class-(\d{1,2})$/.exec(slug);
  return match ? Number(match[1]) : null;
};

function codeDefaults(): ResolvedCatalog {
  const listedGames = (level?: number, subject?: string) => ALL_GAMES.filter((g) => (!level || g.classLevel === level) && (!subject || g.subject === subject));
  return {
    fromServer: false,
    classViews: CLASS_LEVELS.map(codeClassView),
    classBySlug: (slug) => {
      const level = levelFromSlug(slug);
      return level && isCodeLevel(level) ? codeClassView(level as ClassLevel) : null;
    },
    subjectsFor: (level) => (isCodeLevel(level) ? SUBJECTS.map(codeSubjectView) : []),
    subjectView: (key) => (isCodeSubject(key) ? codeSubjectView(key as Subject) : null),
    isPairAvailable: (level, subject) => isCodeLevel(level) && isCodeSubject(subject),
    coursesFor: () => [],
    gamesInCourse: () => [],
    classes: [...CLASS_LEVELS],
    subjects: [...SUBJECTS],
    isClassAvailable: isCodeLevel,
    isSubjectAvailable: isCodeSubject,
    isGamePlayable: (id) => ALL_GAMES.some((g) => g.id === id),
    listedGames,
    applyGame: (game) => game,
    arcadeGames: [...GAMES],
    isArcadePlayable: (slug) => GAMES.some((g) => g.slug === slug),
    applyArcade: (game) => game,
    isSectionOn: (key) => isSectionOn(null, key),
  };
}

export function resolveCatalog(catalog: PublicCatalog | null | undefined): ResolvedCatalog {
  if (!catalog) return codeDefaults();

  const classes = new Map(catalog.classes.filter((c) => c.classLevel !== null).map((c) => [c.classLevel!, c]));
  const subjects = byKey(catalog.subjects);
  const links = new Map(catalog.classSubjects.map((l) => [`${l.classLevel}:${l.subject}`, l]));
  const kidGames = byKey(catalog.kidGames);
  const arcade = byKey(catalog.games);
  const courses = new Map(catalog.courses.map((c) => [c.id, c]));

  const isClassAvailable = (level: number) => Boolean(classes.get(level)?.isEnabled);
  const isSubjectAvailable = (subject: string) => Boolean(subjects.get(subject)?.isEnabled);
  const link = (level: number, subject: string) => links.get(`${level}:${subject}`);
  const isPairAvailable = (level: number, subject: string) => isClassAvailable(level) && isSubjectAvailable(subject) && Boolean(link(level, subject)?.isEnabled);
  const isPairListed = (level: number, subject: string) =>
    isPairAvailable(level, subject) && Boolean(classes.get(level)?.isVisible && subjects.get(subject)?.isVisible && link(level, subject)?.isVisible);

  const courseAvailable = (c: CatalogCourse | undefined) => Boolean(c && c.isEnabled && c.classLevel !== null && c.subject !== null && isPairAvailable(c.classLevel, c.subject));
  const courseListed = (c: CatalogCourse | undefined) => courseAvailable(c) && Boolean(c!.isVisible && isPairListed(c!.classLevel!, c!.subject!));

  const isGamePlayable = (id: string) => {
    const game = ALL_GAMES.find((g) => g.id === id);
    const entry = kidGames.get(id);
    if (!game || !entry?.isEnabled || !isPairAvailable(game.classLevel, game.subject)) return false;
    return entry.courseId ? courseAvailable(courses.get(entry.courseId)) : true;
  };
  const isGameListed = (game: LearningGame) => {
    const entry = kidGames.get(game.id)!;
    return isGamePlayable(game.id) && entry.isVisible && isPairListed(game.classLevel, game.subject) && (!entry.courseId || courseListed(courses.get(entry.courseId)));
  };
  const applyGame = (game: LearningGame): LearningGame => {
    const entry = kidGames.get(game.id);
    return entry ? { ...game, title: entry.title, description: entry.description || game.description } : game;
  };
  const subjectOrder = (s: string) => subjects.get(s)?.order ?? 0;
  const classOrder = (l: number) => classes.get(l)?.order ?? l;

  const listed = ALL_GAMES.filter(isGameListed)
    .sort(
      (a, b) =>
        classOrder(a.classLevel) - classOrder(b.classLevel) ||
        subjectOrder(a.subject) - subjectOrder(b.subject) ||
        kidGames.get(a.id)!.order - kidGames.get(b.id)!.order,
    )
    .map(applyGame);

  const toClassView = (entry: CatalogEntry): ClassView => ({
    level: entry.classLevel!,
    key: entry.key,
    title: entry.title,
    description: entry.description,
    thumbnailUrl: entry.thumbnailUrl,
    isCode: isCodeLevel(entry.classLevel!),
  });
  const toSubjectView = (entry: CatalogEntry): SubjectView => ({
    key: entry.key,
    title: entry.title,
    description: entry.description,
    glyph: entry.glyph ?? (isCodeSubject(entry.key) ? SUBJECT_INFO[entry.key as Subject].glyph : null),
    thumbnailUrl: entry.thumbnailUrl,
    isCode: isCodeSubject(entry.key),
  });
  const classViews = catalog.classes
    .filter((c) => c.classLevel !== null && c.isEnabled && c.isVisible)
    .sort((a, b) => a.order - b.order)
    .map(toClassView);

  const isArcadePlayable = (slug: string) => Boolean(GAMES.some((g) => g.slug === slug) && arcade.get(slug)?.isEnabled);
  const applyArcade = (game: GameMeta): GameMeta => {
    const entry = arcade.get(game.slug);
    return entry ? { ...game, name: entry.title, description: entry.description || game.description } : game;
  };

  return {
    fromServer: true,
    classViews,
    classBySlug: (slug) => {
      const level = levelFromSlug(slug);
      const entry = level ? classes.get(level) : undefined;
      return entry?.isEnabled ? toClassView(entry) : null;
    },
    subjectsFor: (level) =>
      catalog.subjects
        .filter((s) => isPairListed(level, s.key))
        .sort((a, b) => a.order - b.order)
        .map(toSubjectView),
    subjectView: (key) => {
      const entry = subjects.get(key);
      return entry?.isEnabled ? toSubjectView(entry) : null;
    },
    isPairAvailable,
    coursesFor: (level, subject) =>
      catalog.courses
        .filter((c) => courseListed(c) && (!level || c.classLevel === level) && (!subject || c.subject === subject))
        .sort((a, b) => a.order - b.order),
    gamesInCourse: (courseId) => listed.filter((g) => kidGames.get(g.id)?.courseId === courseId),
    classes: classViews.filter((c) => c.isCode).map((c) => c.level as ClassLevel),
    subjects: SUBJECTS.filter((s) => isSubjectAvailable(s) && subjects.get(s)?.isVisible).sort((a, b) => subjectOrder(a) - subjectOrder(b)),
    isClassAvailable,
    isSubjectAvailable,
    isGamePlayable,
    listedGames: (level, subject) => listed.filter((g) => (!level || g.classLevel === level) && (!subject || g.subject === subject)),
    applyGame,
    arcadeGames: GAMES.filter((g) => isArcadePlayable(g.slug) && arcade.get(g.slug)?.isVisible)
      .sort((a, b) => arcade.get(a.slug)!.order - arcade.get(b.slug)!.order)
      .map(applyArcade),
    isArcadePlayable,
    applyArcade,
    isSectionOn: (key) => isSectionOn(catalog, key),
  };
}

/**
 * Home-page sections to render, in order. Without a catalog every implemented section shows
 * except those the code itself hides (Pricing).
 */
export function visibleSections(catalog: PublicCatalog | null | undefined, implemented: readonly string[], hiddenByDefault: readonly string[] = []): string[] {
  if (!catalog) return implemented.filter((key) => !hiddenByDefault.includes(key));
  const entries = byKey(catalog.sections);
  return implemented
    .filter((key) => entries.get(key)?.isEnabled && entries.get(key)?.isVisible)
    .sort((a, b) => entries.get(a)!.order - entries.get(b)!.order);
}
