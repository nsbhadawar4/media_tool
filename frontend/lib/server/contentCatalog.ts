import { cache } from 'react';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import type { PublicCatalog } from '@/lib/api/content';
import { configuredSiteUrl } from '@/lib/site';
import type { ClassSchedule } from '@/lib/content/academicCalendar';

/** How long one attempt waits for the catalog; a slow first answer (a cold API) gets one longer retry. */
const TIMEOUT_MS = 3000;
const RETRY_TIMEOUT_MS = 6000;

/**
 * Where this deployment's API answers, from trusted configuration only — never from a request's
 * Host header (which a client controls), except for localhost during development.
 *
 * Read over HTTP rather than by importing the backend: a page and the /api route are bundled
 * separately, and two copies of the backend in one process clash on their shared Mongoose models.
 */
export async function apiOrigin(): Promise<string | null> {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '').replace(/\/api$/, '');
  const site = configuredSiteUrl();
  // Production: the public domain. VERCEL_URL is this deployment's own address, which Vercel's Deployment
  // Protection answers with 401 for server-to-server calls — every page's API read then failed ("Unable to
  // load this subject") while the browser, on the public domain, worked.
  if (process.env.VERCEL_ENV === 'production') return site ? site.replace(/\/+$/, '') : null;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (site) return site.replace(/\/+$/, '');
  const host = (await headers()).get('host');
  return host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `http://${host}` : null;
}

/** An answer from the API that wasn't a success: its status is kept so a log can tell a 401 from a 500. */
class ApiStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/**
 * Why a read failed, for the log only (never shown to visitors): 401/403 is Deployment Protection or a wrong
 * origin, 5xx the API (503 is the database), the rest are network failures and timeouts.
 */
function failureReason(err: unknown): string {
  if (err instanceof ApiStatusError) {
    if (err.status === 401 || err.status === 403) return `HTTP ${err.status} (blocked — deployment protection or wrong API origin)`;
    if (err.status === 503) return 'HTTP 503 (API or database unavailable)';
    return `HTTP ${err.status}${err.status >= 500 ? ' (backend failure)' : ''}`;
  }
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) return 'timeout';
  return err instanceof Error ? `network error: ${err.message}` : 'unknown error';
}

/** A retry is only for a transient failure (network, timeout); an answer of any status is final. */
const retryable = (err: unknown) => !(err instanceof ApiStatusError);

/**
 * Headers for this server's own API calls. On a protected preview deployment Vercel supplies a bypass secret
 * (VERCEL_AUTOMATION_BYPASS_SECRET, when Protection Bypass for Automation is on); without it the call is 401.
 * Server-side only: the secret never reaches a browser.
 */
export function apiHeaders(): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  return secret ? { 'x-vercel-protection-bypass': secret } : {};
}

/**
 * The content catalog for server-rendered pages. Null when it can't be read in time: the caller
 * then renders the code defaults, so a page never fails because of it.
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
    const origin = await apiOrigin();
    if (!origin) throw new Error('no trusted API origin configured (set NEXT_PUBLIC_SITE_URL)');
    const read = async (timeout: number) => {
      const res = await fetch(`${origin}/api/content/catalog`, { cache: 'no-store', headers: apiHeaders(), signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw new ApiStatusError(res.status);
      return ((await res.json()) as { data: PublicCatalog }).data;
    };
    // A cold start (database connecting, catalog seeding) can miss the first window: try once more.
    return await read(TIMEOUT_MS).catch((err) => {
      if (!retryable(err)) throw err;
      return read(RETRY_TIMEOUT_MS);
    });
  } catch (err) {
    // The page still renders (code defaults); say why, so a broken catalog isn't silent.
    console.warn(`[content] catalog unavailable, using the code defaults (${await apiOrigin().catch(() => '?')}): ${failureReason(err)}`);
    return null;
  }
});

/** A published class as visitors read it: its details and its subjects with chapters (no answers). */
export interface PublicClassCurriculum {
  class: { classLevel: number; slug: string; title: string; subtitle: string; description: string; details: string; image: string | null };
  /** Subjects with their chapters as summaries (no lesson content). */
  subjects: import('@/lib/api/adminClasses').CurriculumSubject<import('@/lib/api/adminClasses').CurriculumChapterSummary>[];
}

type PublicRead<T> = { status: 'ok'; data: T } | { status: 'missing' } | { status: 'error' };

/**
 * One public class read for server-rendered pages: 'missing' when the API says it isn't there for
 * visitors (unpublished, hidden, switched off, or no such class / subject in it), 'error' when it
 * couldn't be read in time — so a page can tell "not found" from "try again".
 */
async function readPublicClass<T>(path: string, what: string): Promise<PublicRead<T>> {
  await connection();
  try {
    const origin = await apiOrigin();
    if (!origin) throw new Error('no trusted API origin configured (set NEXT_PUBLIC_SITE_URL)');
    const read = () => fetch(`${origin}/api/content/classes/${path}`, { cache: 'no-store', headers: apiHeaders(), signal: AbortSignal.timeout(RETRY_TIMEOUT_MS) });
    // A request can land on a pooled keep-alive connection the API has just closed ("fetch failed:
    // read ECONNRESET"): a network error, not an answer — so it is tried once more on a fresh one.
    // An answer (404, 500…) is never retried.
    const res = await read().catch((err) => {
      if (!retryable(err)) throw err;
      return read();
    });
    if (res.status === 404 || res.status === 400) return { status: 'missing' };
    if (!res.ok) throw new ApiStatusError(res.status);
    return { status: 'ok', data: ((await res.json()) as { data: T }).data };
  } catch (err) {
    console.warn(`[content] ${what} unavailable (${await apiOrigin().catch(() => '?')}): ${failureReason(err)}`);
    return { status: 'error' };
  }
}

/**
 * The public curriculum of one class: its details and its subjects with chapters. `search` reads it
 * through a calendar place (scheduleApiSearch(…): a year and month); subjects with nothing in it are
 * left out. A string, not an object, so one render's repeated reads share one request.
 */
export const getPublicCurriculum = cache((slug: string, search = '') =>
  readPublicClass<PublicClassCurriculum>(`${encodeURIComponent(slug)}/curriculum${search}`, `class curriculum for ${slug}${search}`),
);

/** Which academic years and months of a class have published content (counts only): what the picker is drawn from. */
export const getPublicSchedule = cache((slug: string) => readPublicClass<ClassSchedule>(`${encodeURIComponent(slug)}/schedule`, `schedule of ${slug}`));

/** One subject as a class teaches it — the API checks the class offers it — with its chapters. */
export interface PublicClassSubject {
  class: PublicClassCurriculum['class'];
  subject: import('@/lib/api/adminClasses').CurriculumSubject<import('@/lib/api/adminClasses').CurriculumChapterSummary>;
}

export const getPublicClassSubject = cache((slug: string, subject: string, search = '') =>
  readPublicClass<PublicClassSubject>(`${encodeURIComponent(slug)}/subjects/${encodeURIComponent(subject)}${search}`, `subject ${subject} of ${slug}${search}`),
);

/** One chapter in full — lessons with their questions and practice, the quiz without answers — and its subject's chapter list. */
export interface PublicChapter {
  class: PublicClassCurriculum['class'];
  subject: { key: string; title: string; glyph: string | null };
  chapter: import('@/lib/api/adminClasses').CurriculumChapter;
  chapters: Array<{ slug: string; title: string }>;
}

export const getPublicChapter = cache((slug: string, subject: string, chapter: string) =>
  readPublicClass<PublicChapter>(`${encodeURIComponent(slug)}/subjects/${encodeURIComponent(subject)}/chapters/${encodeURIComponent(chapter)}`, `chapter ${chapter} of ${subject} in ${slug}`),
);

/** That subject's published, visible manual courses (hand-written in Admin → Manual Courses). */
export const getPublicManualCourses = cache((slug: string, subject: string) =>
  readPublicClass<import('@/lib/api/manualCourses').PublicManualCourseSummary[]>(`${encodeURIComponent(slug)}/subjects/${encodeURIComponent(subject)}/manual-courses`, `manual courses of ${subject} in ${slug}`),
);

/** One such manual course in full: its published chapters and lessons. */
export const getPublicManualCourse = cache((slug: string, subject: string, course: string) =>
  readPublicClass<import('@/lib/api/manualCourses').PublicManualCourse>(
    `${encodeURIComponent(slug)}/subjects/${encodeURIComponent(subject)}/manual-courses/${encodeURIComponent(course)}`,
    `manual course ${course} of ${subject} in ${slug}`,
  ),
);
