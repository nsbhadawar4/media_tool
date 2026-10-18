/**
 * Where a class, a subject in it and a chapter are learned. Every address is built from the keys
 * the catalog and the API hand out (class "class-6", subject "hindi", chapter slug) — never typed in.
 *
 * One learning route for everyone — visitors, users (from the dashboard and /courses) and admins
 * previewing: /classes/<class>/<subject>/<chapter>. Classes are managed in Manage Courses and open
 * while they are published and visible there. The Kid Games switch never decides that: it only
 * decides whether a class's games (/kid-games/…) can be played.
 *
 * Relative imports only: the frontend tests run this outside Next.js.
 */
import type { ResolvedCatalog } from './catalog';

export const classPath = (classKey: string) => `/classes/${encodeURIComponent(classKey)}`;
export const subjectPath = (classKey: string, subject: string) => `${classPath(classKey)}/${encodeURIComponent(subject)}`;
export const chapterPath = (classKey: string, subject: string, chapter: string) => `${subjectPath(classKey, subject)}/${encodeURIComponent(chapter)}`;
/** A lesson by its place in the chapter (1-based). */
export const lessonPath = (classKey: string, subject: string, chapter: string, lesson: number) => `${chapterPath(classKey, subject, chapter)}/${lesson}`;

/** Where a class's games are played (only while Kid Games is on). */
export const classGamesPath = (classKey: string) => `/kid-games/${encodeURIComponent(classKey)}`;

/** A subject has chapters to study (games are counted separately: they belong to Kid Games). */
export function subjectHasChapters(subject: { chapters: readonly unknown[] }): boolean {
  return subject.chapters.length > 0;
}

/** What a class card shows, counted from the catalog — the home page and /classes list the same. */
export function classCards(catalog: ResolvedCatalog, kidGamesOn: boolean) {
  return catalog.classViews.map((c) => {
    const subjects = catalog.subjectsFor(c.level);
    return {
      ...c,
      // Games are counted only while Kid Games, where they are played, is on.
      games: kidGamesOn ? catalog.listedGames(c.level).length : 0,
      subjects: subjects.length,
      chapters: catalog.coursesFor(c.level).length,
      marks: subjects.map((s) => s.glyph ?? '').filter(Boolean),
    };
  });
}

/** "45 min", "2 h", "8 h 12 min". */
export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
