import { cache } from 'react';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import type { PublicCatalog } from '@/lib/api/content';
import { configuredSiteUrl } from '@/lib/site';

/** Longest a page waits for the catalog before falling back to the code defaults. */
const TIMEOUT_MS = 3000;

/**
 * Where this deployment's API answers, from trusted configuration only — never from a request's
 * Host header (which a client controls), except for localhost during development.
 *
 * Read over HTTP rather than by importing the backend: a page and the /api route are bundled
 * separately, and two copies of the backend in one process clash on their shared Mongoose models.
 */
async function apiOrigin(): Promise<string | null> {
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
    const res = await fetch(`${origin}/api/content/catalog`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return ((await res.json()) as { data: PublicCatalog }).data;
  } catch (err) {
    // The page still renders (code defaults); say why, so a broken catalog isn't silent.
    console.warn(`[content] catalog unavailable, using the code defaults: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
});
