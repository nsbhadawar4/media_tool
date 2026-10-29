/**
 * Server-rendered course pages must read public content in-process, never over HTTP from the deployment
 * to itself — the cause of "Unable to load this subject" in production, where the deployment's own
 * address sits behind Deployment Protection (401) — and must answer with honest HTTP statuses.
 * These are guards on the architecture; the data behaviour is tested in backend/tests/publicContent.test.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

test('server-side content reads make no HTTP request and name no deployment address, host header or bypass secret', () => {
  for (const file of ['lib/server/contentCatalog.ts', 'lib/server/appearance.ts', 'lib/server/backend.ts']) {
    const src = code(file);
    assert.ok(!/\bfetch\s*\(/.test(src), `${file} must not fetch`);
    assert.ok(!/VERCEL_URL|VERCEL_PROJECT_PRODUCTION_URL|NEXT_PUBLIC_SITE_URL|NEXT_PUBLIC_API_URL/.test(src), `${file} must not depend on a deployment address`);
    assert.ok(!/headers\(\)|x-vercel-protection-bypass|VERCEL_AUTOMATION_BYPASS_SECRET/.test(src), `${file} needs neither the Host header nor a protection bypass`);
  }
});

test('the public class pages read only through contentCatalog (no fetch of their own)', () => {
  const pages = walk(join(root, 'app/classes')).filter((f) => /\.tsx?$/.test(f));
  assert.ok(pages.length >= 5);
  for (const file of pages) assert.ok(!/\bfetch\s*\(/.test(readFileSync(file, 'utf8')), `${file} must not fetch`);
});

test('the /api bridge and the pages share one backend instance, loaded lazily', () => {
  const backend = code('lib/server/backend.ts');
  assert.match(backend, /globalThis/, 'kept on globalThis so two bundles never load two copies of the models');
  assert.match(backend, /await import\(|import\('media-tool-backend'\)/, 'imported on first use, not at build time');
  assert.ok(!/^import .*from 'media-tool-backend/m.test(backend), 'no static import of the backend (it validates its environment on load)');
  assert.match(code('app/api/[...path]/route.ts'), /loadBackend\(\)/);
});

test('a failed read is a real error status, and a missing page a 404 — nothing streams ahead of either', () => {
  // A loading.tsx makes Next.js commit to 200 before the page has read anything, so a 404 or an error
  // could no longer change the status code.
  for (const dir of ['[slug]', '[slug]/[subject]', '[slug]/[subject]/[chapter]', '[slug]/[subject]/[chapter]/[lesson]']) {
    assert.ok(!existsSync(join(root, 'app/classes', dir, 'loading.tsx')), `app/classes/${dir} must not stream a skeleton`);
    assert.ok(existsSync(join(root, 'app/classes', dir, 'not-found.tsx')), `app/classes/${dir} keeps its not-found page`);
  }
  assert.ok(existsSync(join(root, 'app/classes/error.tsx')), 'the friendly error state');
  for (const file of walk(join(root, 'app/classes')).filter((f) => f.endsWith('page.tsx') && !/classes[\/]page\.tsx$/.test(f))) {
    const src = readFileSync(file, 'utf8');
    if (!/status === 'error'|!raw/.test(src)) continue;
    assert.match(src, /throw new ContentUnavailableError/, `${file} throws on a failed read instead of rendering a 200 error page`);
    assert.ok(!/<ClassUnavailable/.test(src), `${file} must not render the error as a normal page`);
  }
});
