/**
 * Live link audit against a running site (use `next start`, so status codes are real):
 *
 *   WEB=http://localhost:3100 API=http://localhost:5000 node scripts/auditLive.mjs
 *
 * Enumerates the REAL records from the content API — every visible class, its subjects, chapters and
 * lessons, and manual courses — requests each page the UI links to, follows every internal link found
 * on those pages one level, and expects 200. Fake addresses must be a 404; protected pages must send a
 * signed-out visitor to /login (never a 404). Exits 1 on any failure.
 */
const WEB = (process.env.WEB ?? 'http://localhost:3100').replace(/\/$/, '');
const API = (process.env.API ?? 'http://localhost:5000').replace(/\/$/, '');

// The backend allows 300 requests a minute (and the site's own server-side reads count too), so requests
// are paced, and a 429 is waited out — never read as "this record does not exist".
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
const get = async (url, opts = {}) => {
  const wait = last + 450 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  try {
    return await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(60000), ...opts });
  } catch (e) {
    return { status: 0, text: async () => String(e), clone() { return this; }, headers: new Headers() };
  }
};
const api = async (path) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await get(`${API}${path}`);
    if (r.status === 429) {
      await sleep((Number(r.headers.get('retry-after')) || 60) * 1000 + 1000);
      continue;
    }
    if (r.status === 404) return null;
    // A 5xx or a dropped connection while the API is busy is retried, never read as a bad record.
    if ((r.status >= 500 || r.status === 0) && attempt < 3) {
      await sleep(3000 * (attempt + 1));
      continue;
    }
    if (r.status !== 200) throw new Error(`API ${path} answered ${r.status}`);
    return (await r.json()).data ?? null;
  }
  throw new Error(`API ${path} kept answering 429`);
};

const results = { ok: 0, fail: [] };
const seen = new Map();
async function expect(path, want, label = '') {
  let r = await get(`${WEB}${path}`);
  // A 200 that is really the "Unable to load" state (the API was busy) is retried once, then fails.
  if (r.status === 200 && /Unable to load this/.test(await r.clone().text())) {
    await sleep(15000);
    r = await get(`${WEB}${path}`);
    if (r.status === 200 && /Unable to load this/.test(await r.clone().text())) {
      results.fail.push(`200 (unavailable state)  ${path}  ${label}`);
      return r;
    }
  }
  const loc = r.headers.get('location') ?? '';
  const good = typeof want === 'function' ? want(r.status, loc) : r.status === want;
  seen.set(path, r.status);
  if (good) results.ok++;
  else results.fail.push(`${r.status}${loc ? ` -> ${loc}` : ''}  ${path}  ${label}  (wanted ${typeof want === 'function' ? 'rule' : want})`);
  return r;
}

// A missing record: a real 404, or — behind a segment's loading.tsx the status is already sent — a 200 whose
// page carries the not-found marker (the ClassNotFoundState icon, lucide-search-x, which no real page renders).
const NOT_FOUND_MARK = /lucide-search-x/;
async function expectMissing(path, label) {
  const r = await get(`${WEB}${path}`);
  const loc = r.headers.get('location') ?? '';
  const good = r.status === 404 || toLogin(r.status, loc) || (r.status === 200 && NOT_FOUND_MARK.test(await r.text()));
  seen.set(path, r.status);
  if (good) results.ok++;
  else results.fail.push(`${r.status}${loc ? ` -> ${loc}` : ''}  ${path}  ${label}  (wanted not-found)`);
}

const toLogin = (s, loc) => (s === 307 || s === 308 || s === 302) && /\/(admin\/)?login/.test(loc);

// 1. public pages
for (const p of ['/', '/classes', '/login', '/signup', '/forgot-password', '/contact', '/privacy', '/terms']) await expect(p, 200, 'public');

// 2. protected pages, signed out → login (not 404)
for (const p of ['/dashboard', '/courses', '/media', '/documents', '/folders', '/games', '/kid-games', '/profile', '/settings', '/manage-storage', '/trash', '/activity', '/admin/dashboard', '/admin/users', '/admin/courses', '/admin/manual-courses', '/admin/manual-courses/new', '/admin/manual-courses/trash', '/admin/reviews', '/admin/activity', '/admin/archive', '/admin/trash', '/admin/content', '/admin/settings']) {
  await expect(p, toLogin, 'protected, signed out');
}

// 3. every real class → subject → chapter → lesson
const catalog = await api('/api/content/catalog');
if (!catalog) results.fail.push(`catalog unreadable at ${API}`);
const classes = (catalog?.classes ?? []).map((c) => c.key ?? c.slug).filter(Boolean);
const slugs = classes.length ? classes : Array.from({ length: 12 }, (_, i) => `class-${i + 1}`);
let counts = { classes: 0, subjects: 0, chapters: 0, lessons: 0, manual: 0 };
const pageLinks = new Set();
for (const slug of slugs) {
  const cur = await api(`/api/content/classes/${slug}/curriculum`);
  if (!cur) {
    // not public (draft / hidden / archived / deleted): the page must be a clean 404, with no link to it.
    await expectMissing(`/classes/${slug}`, 'class not public');
    continue;
  }
  counts.classes++;
  await expect(`/classes/${slug}`, 200, 'class');
  for (const s of cur.subjects ?? []) {
    counts.subjects++;
    await expect(`/classes/${slug}/${encodeURIComponent(s.key)}`, 200, 'subject');
    const manual = await api(`/api/content/classes/${slug}/subjects/${encodeURIComponent(s.key)}/manual-courses`);
    for (const m of manual ?? []) {
      counts.manual++;
      await expect(`/classes/${slug}/${encodeURIComponent(s.key)}/manual/${encodeURIComponent(m.slug)}`, 200, 'manual course');
    }
    for (const c of s.chapters ?? []) {
      counts.chapters++;
      await expect(`/classes/${slug}/${encodeURIComponent(s.key)}/${encodeURIComponent(c.slug)}`, 200, 'chapter');
      const full = await api(`/api/content/classes/${slug}/subjects/${encodeURIComponent(s.key)}/chapters/${encodeURIComponent(c.slug)}`);
      const n = full?.chapter?.lessons?.length ?? 0;
      for (let i = 1; i <= n; i++) {
        counts.lessons++;
        const r = await expect(`/classes/${slug}/${encodeURIComponent(s.key)}/${encodeURIComponent(c.slug)}/${i}`, 200, 'lesson');
        if (r.status === 200 && (i === 1 || i === n)) {
          const html = await r.text();
          for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) pageLinks.add(m[1]);
        }
      }
      // one past the end is a genuine 404
      if (n) await expectMissing(`/classes/${slug}/${encodeURIComponent(s.key)}/${encodeURIComponent(c.slug)}/${n + 1}`, 'lesson past the end');
      (full?.chapter?.lessons ?? []).forEach((l, idx) => {
        if (l.number !== idx + 1) results.fail.push(`lesson number ${l.number} != position ${idx + 1} in ${slug}/${s.key}/${c.slug} (list links by number, page looks up by position)`);
      });
    }
  }
  // fake neighbours of a real class
  await expectMissing(`/classes/${slug}/no-such-subject`, 'fake subject');
}

// 4. every internal link found on lesson pages resolves (one level)
for (const p of pageLinks) {
  if (seen.has(p) || p.startsWith('/_next') || p.startsWith('/api/') || /\.[a-z0-9]{2,4}$/i.test(p)) continue;
  await expect(p, (s, loc) => s === 200 || toLogin(s, loc), 'link found on a lesson page');
}

// 5. fake addresses are a real 404 with the branded page
for (const p of ['/classes/class-99', '/classes/class-1/math/no-such-chapter', '/classes/class-1/math/c1-math-count-10/0', '/classes/class-1/math/c1-math-count-10/abc', '/classes/class-1/math/manual/no-such', '/no-such-page', '/courses/no-such-course-slug']) {
  await expectMissing(p, 'fake address');
}

console.log(`records: ${JSON.stringify(counts)}`);
console.log(`requests ok: ${results.ok}, failed: ${results.fail.length}`);
for (const f of results.fail) console.log('  FAIL', f);
process.exit(results.fail.length ? 1 : 0);
