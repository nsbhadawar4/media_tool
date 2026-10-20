import { cache } from 'react';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import type { PublicCatalog } from '@/lib/api/content';
import { configuredSiteUrl } from '@/lib/site';

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
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const site = configuredSiteUrl();
  if (site) return site.replace(/\/+$/, '');
  const host = (await headers()).get('host');
  return host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `http://${host}` : null;
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
      const res = await fetch(`${origin}/api/content/catalog`, { cache: 'no-store', signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return ((await res.json()) as { data: PublicCatalog }).data;
    };
    // A cold start (database connecting, catalog seeding) can miss the first window: try once more.
    return await read(TIMEOUT_MS).catch(() => read(RETRY_TIMEOUT_MS));
  } catch (err) {
    // The page still renders (code defaults); say why, so a broken catalog isn't silent.
    console.warn(`[content] catalog unavailable, using the code defaults: ${err instanceof Error ? err.message : String(err)}`);
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
    const read = () => fetch(`${origin}/api/content/classes/${path}`, { cache: 'no-store', signal: AbortSignal.timeout(RETRY_TIMEOUT_MS) });
    // A request can land on a pooled keep-alive connection the API has just closed ("fetch failed:
    // read ECONNRESET"): a network error, not an answer — so it is tried once more on a fresh one.
    // An answer (404, 500…) is never retried.
    const res = await read().catch(() => read());
    if (res.status === 404 || res.status === 400) return { status: 'missing' };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { status: 'ok', data: ((await res.json()) as { data: T }).data };
  } catch (err) {
    console.warn(`[content] ${what} unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return { status: 'error' };
  }
}

/** The public curriculum of one class: its details and its subjects with chapters. */
export const getPublicCurriculum = cache((slug: string) =>
  readPublicClass<PublicClassCurriculum>(`${encodeURIComponent(slug)}/curriculum`, `class curriculum for ${slug}`),
);

/** One subject as a class teaches it — the API checks the class offers it — with its chapters. */
export interface PublicClassSubject {
  class: PublicClassCurriculum['class'];
  subject: import('@/lib/api/adminClasses').CurriculumSubject<import('@/lib/api/adminClasses').CurriculumChapterSummary>;
}

export const getPublicClassSubject = cache((slug: string, subject: string) =>
  readPublicClass<PublicClassSubject>(`${encodeURIComponent(slug)}/subjects/${encodeURIComponent(subject)}`, `subject ${subject} of ${slug}`),
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
