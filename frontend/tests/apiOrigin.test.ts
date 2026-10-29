/**
 * Where a page's own server-side API reads go. In production they must use the public domain: the
 * per-deployment VERCEL_URL is behind Deployment Protection (401), which made every class and subject page
 * report "Unable to load" while the API itself answered fine from the browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiHeaders, apiOrigin } from '../lib/server/contentCatalog';

const KEYS = ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SITE_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL', 'VERCEL_ENV', 'VERCEL_AUTOMATION_BYPASS_SECRET'];

async function withEnv(env: Record<string, string>, run: () => Promise<void> | void) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try {
    await run();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('production reads through the public domain, not the deployment URL', () =>
  withEnv({ VERCEL_ENV: 'production', VERCEL_URL: 'media-tool-abc123.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'media-tool.vercel.app' }, async () => {
    assert.equal(await apiOrigin(), 'https://media-tool.vercel.app');
  }));

test('a preview reads through its own deployment URL', () =>
  withEnv({ VERCEL_ENV: 'preview', VERCEL_URL: 'media-tool-abc123.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'media-tool.vercel.app' }, async () => {
    assert.equal(await apiOrigin(), 'https://media-tool-abc123.vercel.app');
  }));

test('an explicit API URL wins, without a trailing /api', () =>
  withEnv({ VERCEL_ENV: 'production', NEXT_PUBLIC_API_URL: 'https://api.example.com/api', VERCEL_PROJECT_PRODUCTION_URL: 'media-tool.vercel.app' }, async () => {
    assert.equal(await apiOrigin(), 'https://api.example.com');
  }));

test('the protection bypass secret is sent only when Vercel provides one', () =>
  withEnv({}, () => {
    assert.deepEqual(apiHeaders(), {});
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 's3cret';
    assert.deepEqual(apiHeaders(), { 'x-vercel-protection-bypass': 's3cret' });
  }));

test('production never falls back to the deployment URL or the Host header', () =>
  withEnv({ VERCEL_ENV: 'production', VERCEL_URL: 'media-tool-abc123.vercel.app' }, async () => {
    assert.equal(await apiOrigin(), null);
  }));
