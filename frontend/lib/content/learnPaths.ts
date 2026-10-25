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
import { scheduleSearch, type Schedule } from './academicCalendar';

/*
 * A class and a subject can be opened through a calendar place (?year=2026-27&month=04) — a month of the
 * academic year — and the choice then travels with the links down from there. A chapter and a lesson have
 * one address each: the database knows which month a chapter belongs to, so those never carry a query.
 */
const classBase = (classKey: string) => `/classes/${encodeURIComponent(classKey)}`;
const subjectBase = (classKey: string, subject: string) => `${classBase(classKey)}/${encodeURIComponent(subject)}`;
export const classPath = (classKey: string, schedule?: Schedule | null) => `${classBase(classKey)}${scheduleSearch(schedule)}`;
export const subjectPath = (classKey: string, subject: string, schedule?: Schedule | null) => `${subjectBase(classKey, subject)}${scheduleSearch(schedule)}`;
export const chapterPath = (classKey: string, subject: string, chapter: string) => `${subjectBase(classKey, subject)}/${encodeURIComponent(chapter)}`;
/**
 * A lesson by its place in the chapter (1-based position in `chapter.lessons`, never a stored id).
 * `parseLessonParam` is its inverse and the only reader of that segment: the lesson page resolves
 * `lessons[parseLessonParam(segment) - 1]`, so a link built here always finds its lesson.
 */
export const lessonPath = (classKey: string, subject: string, chapter: string, position: number) => `${chapterPath(classKey, subject, chapter)}/${position}`;

/** The lesson position in a route segment, or NaN when the segment is not one (→ not found). */
export const parseLessonParam = (segment: string): number => (/^[1-9]\d{0,1}$/.test(segment) ? Number(segment) : NaN);

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
