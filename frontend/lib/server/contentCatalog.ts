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
  subjects: import('@/lib/api/adminClasses').CurriculumSubject[];
}

/**
 * The public curriculum of one class for server-rendered pages: 'missing' when the class isn't
 * published and visible (or doesn't exist), 'error' when the API couldn't be read in time.
 */
export const getPublicCurriculum = cache(async (slug: string): Promise<{ status: 'ok'; data: PublicClassCurriculum } | { status: 'missing' } | { status: 'error' }> => {
  await connection();
  try {
    const origin = await apiOrigin();
    if (!origin) throw new Error('no trusted API origin configured (set NEXT_PUBLIC_SITE_URL)');
    const res = await fetch(`${origin}/api/content/classes/${encodeURIComponent(slug)}/curriculum`, { cache: 'no-store', signal: AbortSignal.timeout(RETRY_TIMEOUT_MS) });
    if (res.status === 404 || res.status === 400) return { status: 'missing' };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { status: 'ok', data: ((await res.json()) as { data: PublicClassCurriculum }).data };
  } catch (err) {
    console.warn(`[content] class curriculum unavailable for ${slug}: ${err instanceof Error ? err.message : String(err)}`);
    return { status: 'error' };
  }
});
