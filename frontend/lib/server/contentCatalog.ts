import { cache } from 'react';
import { connection } from 'next/server';
import type { PublicCatalog } from '@/lib/api/content';
import type { ClassSchedule } from '@/lib/content/academicCalendar';
import { loadBackend } from './backend';

/**
 * Public content for server-rendered pages, read in-process from the same content functions that answer
 * /api/content/* — never over HTTP from a deployment to itself. A self-request depends on things a page
 * has no business depending on: the deployment's own address, the host's deployment protection (which
 * answers such calls with a 401/403), the API's per-IP rate limit and a second cold start. That is what
 * made class pages report "Unable to load" while the same endpoints answered 200 from a browser.
 *
 * The API routes stay as they are, for client-side callers; both go through the same loaders
 * (backend/src/services/publicContent.ts), so there is one implementation of the course logic.
 */

/** Whatever the loaders return, as the JSON the API would have sent (ids and dates as strings). */
const asJson = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

/** The HTTP status an error carries (AppError.statusCode), by shape — the class itself can come from another bundle. */
const statusOf = (err: unknown): number | null => {
  const code = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === 'number' ? code : null;
};

/**
 * Why a read failed, for the log only — the real cause, never shown to visitors. A database that can't
 * be reached, or a bug, reads differently from a plain "not found". (Messages carry no credentials.)
 */
function failureReason(err: unknown): string {
  const status = statusOf(err);
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  if (status === 503) return `service unavailable (${message})`;
  if (status) return `HTTP ${status} (${message})`;
  return `unexpected error (${message})`;
}

/**
 * The content catalog for server-rendered pages. Null when it can't be read: the caller then renders
 * the code defaults, so a page never fails because of it.
 *
 * Fresh on every request (the backend keeps it in memory and drops it on every admin change), and
 * read once per request however many components ask — the page, the header and the footer.
 *
 * Request-time only: `connection()` (outside the try, so its signal is never swallowed) keeps a
 * build from prerendering a page with whatever the catalog was then.
 */
export const getServerCatalog = cache(async (): Promise<PublicCatalog | null> => {
  await connection();
  try {
    const backend = await loadBackend();
    await backend.ensureDatabase();
    return asJson<PublicCatalog>(await backend.publicContent.catalog());
  } catch (err) {
    // The page still renders (code defaults); say why, so a broken catalog isn't silent.
    console.warn(`[content] catalog unavailable, using the code defaults: ${failureReason(err)}`);
    return null;
  }
});

/** A published class as visitors read it: its details and its subjects with chapters (no answers). */
export interface PublicClassCurriculum {
  class: { classLevel: number; slug: string; title: string; subtitle: string; description: string; details: string; image: string | null };
  /** Subjects with their chapters as summaries (no lesson content). */
  subjects: import('@/lib/api/adminClasses').CurriculumSubject<import('@/lib/api/adminClasses').CurriculumChapterSummary>[];
}

/** 'missing' is the API's 400/404 (not public, not there, malformed address); 'error' is a genuine failure. */
export type PublicRead<T> = { status: 'ok'; data: T } | { status: 'missing' } | { status: 'error' };

type PublicContent = Awaited<ReturnType<typeof loadBackend>>['publicContent'];

/**
 * One public read for server-rendered pages: 'missing' when the content isn't there for visitors
 * (unpublished, hidden, switched off, or no such class / subject / chapter), 'error' when it couldn't
 * be read — so a page can answer 404 for the first and a real server error for the second.
 */
async function readPublic<T>(what: string, read: (content: PublicContent) => Promise<unknown>): Promise<PublicRead<T>> {
  await connection();
  try {
    const backend = await loadBackend();
    await backend.ensureDatabase();
    return { status: 'ok', data: asJson<T>(await read(backend.publicContent)) };
  } catch (err) {
    const status = statusOf(err);
    if (status === 404 || status === 400) return { status: 'missing' };
    console.error(`[content] ${what} could not be read: ${failureReason(err)}`);
    return { status: 'error' };
  }
}

/** "?academicYear=2026-27&month=4" (what scheduleApiSearch builds) as the loaders' query. */
const queryOf = (search: string) => Object.fromEntries(new URLSearchParams(search));

/**
 * The public curriculum of one class: its details and its subjects with chapters. `search` reads it
 * through a calendar place (scheduleApiSearch(…): a year and month); subjects with nothing in it are
 * left out. A string, not an object, so one render's repeated reads share one cache entry.
 */
export const getPublicCurriculum = cache((slug: string, search = '') =>
  readPublic<PublicClassCurriculum>(`class curriculum for ${slug}${search}`, (c) => c.curriculum(slug, queryOf(search))),
);

/** Which academic years and months of a class have published content (counts only): what the picker is drawn from. */
export const getPublicSchedule = cache((slug: string) => readPublic<ClassSchedule>(`schedule of ${slug}`, (c) => c.schedule(slug)));

/** One subject as a class teaches it — checked to belong to the class — with its chapters. */
export interface PublicClassSubject {
  class: PublicClassCurriculum['class'];
  subject: import('@/lib/api/adminClasses').CurriculumSubject<import('@/lib/api/adminClasses').CurriculumChapterSummary>;
}

export const getPublicClassSubject = cache((slug: string, subject: string, search = '') =>
  readPublic<PublicClassSubject>(`subject ${subject} of ${slug}${search}`, (c) => c.subject(slug, subject, queryOf(search))),
);

/** One chapter in full — lessons with their questions and practice, the quiz without answers — and its subject's chapter list. */
export interface PublicChapter {
  class: PublicClassCurriculum['class'];
  subject: { key: string; title: string; glyph: string | null };
  chapter: import('@/lib/api/adminClasses').CurriculumChapter;
  chapters: Array<{ slug: string; title: string }>;
}

export const getPublicChapter = cache((slug: string, subject: string, chapter: string) =>
  readPublic<PublicChapter>(`chapter ${chapter} of ${subject} in ${slug}`, (c) => c.chapter(slug, subject, chapter)),
);

/** That subject's published, visible manual courses (hand-written in Admin → Manual Courses). */
export const getPublicManualCourses = cache((slug: string, subject: string) =>
  readPublic<import('@/lib/api/manualCourses').PublicManualCourseSummary[]>(`manual courses of ${subject} in ${slug}`, (c) => c.manualCourses(slug, subject)),
);

/** One such manual course in full: its published chapters and lessons. */
export const getPublicManualCourse = cache((slug: string, subject: string, course: string) =>
  readPublic<import('@/lib/api/manualCourses').PublicManualCourse>(`manual course ${course} of ${subject} in ${slug}`, (c) => c.manualCourse(slug, subject, course)),
);
