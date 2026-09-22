/**
 * End-to-end smoke check of the deployed shape.
 *
 * Boots the *built* Next.js server and drives the real API through it — the exact path a
 * Vercel deployment takes, with the Express app running inside the Route Handler instead
 * of behind app.listen(). tests/vercelBridge.test.ts covers the adapter in isolation;
 * this covers the whole thing wired together and served from one origin, which is the
 * part no unit test can speak for.
 *
 * Runs against a throwaway in-memory MongoDB, with files stored in that same database
 * (STORAGE_PROVIDER=gridfs), so it needs no credentials and touches neither Atlas nor a
 * real bucket — and still uploads and serves a real file.
 *
 * Requires a prior `npm run build`. Deliberately not part of `npm test`: it depends on
 * that build and takes about a minute.
 *
 *   npm run smoke          # from the repo root
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Loaded through require, not import.
 *
 * This file is ESM (.mts) and sharp's ESM entry uses import attributes, which Node 20 —
 * the version Vercel builds on — does not parse. The application never meets this because
 * it compiles to CommonJS; only this script does. The CJS build is the same library.
 */
const sharp = createRequire(import.meta.url)('sharp') as typeof import('sharp');

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;

/** Resolved from this file rather than process.cwd(), so the script runs from anywhere. */
const FRONTEND_DIR = fileURLToPath(new URL('../frontend', import.meta.url));

if (!existsSync(`${FRONTEND_DIR}/.next`)) {
  console.error(
    'No production build found at frontend/.next.\n' +
      'This check drives the built server, so run `npm run build` from the repo root first.',
  );
  process.exit(1);
}

function log(step: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? '  — ' + detail : ''}`);
  if (!ok) process.exitCode = 1;
}

const mongo = await MongoMemoryServer.create();
const uri = mongo.getUri('media_tool_smoke');
console.log('mongo up');

/**
 * Ends the server and everything it spawned, by pid.
 *
 * `next start` arrives through a chain of processes (npx -> next -> node), and on Windows
 * killing the wrapper we spawned leaves the real server alive still holding the port, so
 * the next run fails with EADDRINUSE. taskkill /T ends the whole tree; POSIX gets the
 * ordinary signal. This mirrors scripts/dev.mjs, which solves the same problem.
 *
 * Targeting the pid matters: this previously ran `taskkill /F /IM node.exe`, which
 * selects every node process on the machine by image name and leans on a window-title
 * filter to narrow it — including, on a developer's machine, editors and unrelated work.
 */
function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== 'win32' || child.pid === undefined) {
    child.kill();
    return;
  }
  try {
    execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {
    // Already gone, or taskkill unavailable — a plain kill is the best remaining effort.
    child.kill();
  }
}

const next = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  cwd: FRONTEND_DIR,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    VERCEL: '1',
    NODE_ENV: 'production',
    MONGODB_URI: uri,
    JWT_SECRET: 'smoke-test-secret-value-not-used-anywhere-else',
    // Files go into the throwaway database below, which needs no credentials and no real
    // bucket — so this check can upload a real file end to end while staying free of
    // both. It is also a configuration a serverless deployment can genuinely run, unlike
    // the local provider this used to force on with ALLOW_LOCAL_STORAGE_ON_SERVERLESS.
    STORAGE_PROVIDER: 'gridfs',
    UPLOAD_DIR: '/tmp/media-tool-smoke-uploads',
    COOKIE_SECURE: 'false', // the smoke test speaks http; everything else stays production-shaped
  },
});
next.stdout.on('data', (d) => process.stdout.write(`[next] ${d}`));
next.stderr.on('data', (d) => process.stderr.write(`[next] ${d}`));

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.status === 200 || res.status === 503) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('server never came up');
}

try {
  await waitForServer();

  // 1. Health — proves the route handler loaded the backend and connected to Mongo.
  const health = await fetch(`${BASE}/api/health`);
  const healthBody = await health.json();
  log(
    'GET /api/health',
    health.status === 200 && healthBody.database === 'connected' && healthBody.storage === 'configured',
    JSON.stringify(healthBody),
  );

  // 2. Signup — a POST with a JSON body through the bridge.
  const email = `smoke-${Date.now()}@example.com`;
  const signup = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Smoke Test',
      email,
      password: 'SmokeTest123!pw',
      confirmPassword: 'SmokeTest123!pw',
    }),
  });
  const signupBody = await signup.json();
  log('POST /api/auth/signup', signup.status === 201, `${signup.status} ${JSON.stringify(signupBody).slice(0, 120)}`);

  // 3. Login — the Set-Cookie round trip.
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'SmokeTest123!pw' }),
  });
  const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  log('POST /api/auth/login sets a cookie', login.status === 200 && cookie.startsWith('mt_session='), cookie.slice(0, 30));

  // 4. Authenticated read using that cookie.
  const me = await fetch(`${BASE}/api/auth/me`, { headers: { cookie } });
  const meBody = await me.json();
  log('GET /api/auth/me with cookie', me.status === 200 && meBody.data?.email === email);

  // 5. Folder create + list — a full write/read cycle against Mongo.
  const created = await fetch(`${BASE}/api/folders`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke Folder' }),
  });
  log('POST /api/folders', created.status === 201, String(created.status));

  const list = await fetch(`${BASE}/api/folders`, { headers: { cookie } });
  const listBody = await list.json();
  log('GET /api/folders returns it', list.status === 200 && listBody.data.folders.length === 1);

  // 6. Presign — the direct-upload negotiation. A provider that cannot hand out upload
  //    URLs answers "proxy", which is what puts the bytes through the API in step 7.
  const presign = await fetch(`${BASE}/api/media/presign`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ fileName: 'a.jpg', mimeType: 'image/jpeg', size: 100, folderId: null }),
  });
  const presignBody = await presign.json();
  log('POST /api/media/presign', presign.status === 200 && presignBody.data.mode === 'proxy', JSON.stringify(presignBody.data));

  /**
   * 7. A real file, all the way through and back.
   *
   * The step that exercises everything the others skip: a multipart body across the
   * Express bridge, multer's temp file, sharp deriving a thumbnail, the storage provider
   * writing both, and then the bytes being served back out. Uploading was the one thing a
   * passing smoke run could previously say nothing about.
   */
  const png = await sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 40, b: 90 } },
  })
    .png()
    .toBuffer();

  const form = new FormData();
  form.append('files', new Blob([png], { type: 'image/png' }), 'smoke.png');
  const upload = await fetch(`${BASE}/api/media/upload`, { method: 'POST', headers: { cookie }, body: form });
  const uploadBody = await upload.json();
  const uploaded = uploadBody.data?.uploaded?.[0];
  log(
    'POST /api/media/upload stores a real file',
    upload.status === 201 && uploaded?.size === png.length,
    `${upload.status} ${JSON.stringify(uploadBody).slice(0, 140)}`,
  );

  if (uploaded) {
    const raw = await fetch(`${BASE}/api/media/${uploaded.id}/raw`, { headers: { cookie } });
    const served = Buffer.from(await raw.arrayBuffer());
    log(
      'GET /api/media/:id/raw returns the same bytes',
      raw.status === 200 && served.equals(png),
      `${raw.status} ${served.length} of ${png.length} bytes`,
    );

    // A range request is how a browser seeks in a video; the provider's own off-by-one
    // here would be invisible in the full read above.
    const ranged = await fetch(`${BASE}/api/media/${uploaded.id}/raw`, {
      headers: { cookie, range: 'bytes=0-9' },
    });
    const rangedBytes = Buffer.from(await ranged.arrayBuffer());
    log(
      'GET /api/media/:id/raw honours a Range header',
      ranged.status === 206 && rangedBytes.equals(png.subarray(0, 10)),
      `${ranged.status} ${rangedBytes.length} bytes`,
    );

    const thumb = await fetch(`${BASE}/api/media/${uploaded.id}/thumb`, { headers: { cookie } });
    log('GET /api/media/:id/thumb serves the derived thumbnail', thumb.status === 200, String(thumb.status));
  }

  // 8. Unauthenticated access is still refused.
  const denied = await fetch(`${BASE}/api/folders`);
  log('GET /api/folders without a session is 401', denied.status === 401, String(denied.status));

  // 9. The frontend itself is still served from the same origin.
  const page = await fetch(`${BASE}/login`);
  log('GET /login serves the Next.js app', page.status === 200 && (await page.text()).includes('<!DOCTYPE html>'));

  // 10. Logout clears the cookie.
  const logout = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { cookie } });
  log('POST /api/auth/logout', logout.status === 200, String(logout.status));
} catch (err) {
  log('smoke run', false, String(err));
} finally {
  killTree(next);
  await mongo.stop();
  // Brief grace period so the tree is fully down before this process leaves.
  setTimeout(() => process.exit(process.exitCode ?? 0), 500);
}
