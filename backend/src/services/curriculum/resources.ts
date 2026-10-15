import { logger } from '../../utils/logger';

/**
 * Free resources for a subject: book records from Open Library and openly licensed media from
 * Wikimedia Commons, through their public APIs (no keys, no cost). Only references are kept —
 * title, author, source, link, thumbnail and licence — never the works themselves.
 *
 * Either source can be slow or down; each is asked with a short timeout and any failure simply
 * yields no results from it, so class generation never depends on them.
 */

export type ResourceType = 'book' | 'image';

export interface FreeResource {
  title: string;
  author: string | null;
  source: 'Open Library' | 'Wikimedia Commons';
  url: string;
  type: ResourceType;
  license: string;
  thumbnailUrl: string | null;
}

export interface ResourceSearch {
  resources: FreeResource[];
  /** Sources that could not be reached this time. */
  unavailable: string[];
}

const TIMEOUT_MS = 6000;
const CACHE_MS = 60 * 60 * 1000;
// Wikimedia asks API clients to identify themselves.
const USER_AGENT = 'media_tool-class-builder/1.0 (educational resource lookup)';
const cache = new Map<string, { at: number; value: ResourceSearch }>();

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const https = (u: string | undefined | null) => (u && /^https:\/\//i.test(u) ? u : u && /^\/\//.test(u) ? `https:${u}` : null);

async function openLibrary(query: string, limit: number): Promise<FreeResource[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit), fields: 'key,title,author_name,cover_i,ebook_access,first_publish_year' });
  const data = (await getJson(`https://openlibrary.org/search.json?${params}`)) as {
    docs?: Array<{ key?: string; title?: string; author_name?: string[]; cover_i?: number; ebook_access?: string }>;
  };
  return (data.docs ?? [])
    .filter((d) => d.key && d.title)
    .slice(0, limit)
    .map((d) => ({
      title: d.title!.slice(0, 200),
      author: d.author_name?.slice(0, 2).join(', ') ?? null,
      source: 'Open Library' as const,
      url: `https://openlibrary.org${d.key}`,
      type: 'book' as const,
      license: d.ebook_access === 'public' ? 'Public domain — free to read on Open Library' : 'Open Library catalogue record (availability varies)',
      thumbnailUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    }));
}

async function wikimediaCommons(query: string, limit: number): Promise<FreeResource[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: String(limit * 2),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '320',
    origin: '*',
  });
  const data = (await getJson(`https://commons.wikimedia.org/w/api.php?${params}`)) as {
    query?: { pages?: Record<string, { title?: string; imageinfo?: Array<{ descriptionurl?: string; thumburl?: string; extmetadata?: Record<string, { value?: string }> }> }> };
  };
  const pages = Object.values(data.query?.pages ?? {});
  const out: FreeResource[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const meta = info?.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value ?? '');
    const url = https(info?.descriptionurl);
    // Only openly licensed files with a stated licence.
    if (!url || !license || !/(cc|public domain|pd|gfdl)/i.test(license)) continue;
    out.push({
      title: stripHtml(meta.ObjectName?.value ?? page.title?.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '') ?? 'Image').slice(0, 200),
      author: stripHtml(meta.Artist?.value ?? '').slice(0, 120) || null,
      source: 'Wikimedia Commons',
      url,
      type: 'image',
      license,
      thumbnailUrl: https(info?.thumburl),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Up to `limit` books and `limit` images for a subject (and optional topic) at a class level. */
export async function findFreeResources(subject: string, opts: { topic?: string; classLevel?: number; limit?: number } = {}): Promise<ResourceSearch> {
  const limit = Math.min(Math.max(opts.limit ?? 3, 1), 6);
  const topic = opts.topic?.trim();
  const q = [subject.trim(), topic].filter(Boolean).join(' ');
  const key = `${q.toLowerCase()}|${opts.classLevel ?? ''}|${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const bookQuery = `${q} ${opts.classLevel && opts.classLevel <= 8 ? 'for children' : ''}`.trim();
  const [books, images] = await Promise.allSettled([openLibrary(bookQuery, limit), wikimediaCommons(q, limit)]);
  const unavailable: string[] = [];
  const take = (r: PromiseSettledResult<FreeResource[]>, name: string) => {
    if (r.status === 'fulfilled') return r.value;
    unavailable.push(name);
    logger.warn(`free resources: ${name} unavailable for "${q}": ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    return [];
  };
  const value = { resources: [...take(books, 'Open Library'), ...take(images, 'Wikimedia Commons')], unavailable };
  // Failures aren't cached, so the next request tries again.
  if (!unavailable.length) cache.set(key, { at: Date.now(), value });
  return value;
}
