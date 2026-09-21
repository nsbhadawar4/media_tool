/**
 * End-to-end smoke check of the deployed shape.
 *
 * Boots the *built* Next.js server and drives the real API through it — the exact path a
 * Vercel deployment takes, with the Express app running inside the Route Handler instead
 * of behind app.listen(). tests/vercelBridge.test.ts covers the adapter in isolation;
 * this covers the whole thing wired together and served from one origin, which is the
 * part no unit test can speak for.
 *
 * Runs against a throwaway in-memory MongoDB and local storage, so it needs no
 * credentials and touches neither Atlas nor a real bucket.
 *
 * Requires a prior `npm run build`. Deliberately not part of `npm test`: it depends on
 * that build and takes about a minute.
 *
 *   npm run smoke          # from the repo root
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

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
    STORAGE_PROVIDER: 'local',
    // This check deliberately uses no credentials and no real bucket, so it has to opt
    // out of the refusal that local storage on a serverless host normally triggers. It
    // still exercises the presign endpoint, which answers `mode: "proxy"` for a provider
    // that cannot sign URLs — the same answer local development gets.
    ALLOW_LOCAL_STORAGE_ON_SERVERLESS: '1',
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
  log('GET /api/health', health.status === 200 && healthBody.database === 'connected', JSON.stringify(healthBody));

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

  // 6. Presign — the new direct-upload negotiation (local storage answers "proxy").
  const presign = await fetch(`${BASE}/api/media/presign`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ fileName: 'a.jpg', mimeType: 'image/jpeg', size: 100, folderId: null }),
  });
  const presignBody = await presign.json();
  log('POST /api/media/presign', presign.status === 200 && presignBody.data.mode === 'proxy', JSON.stringify(presignBody.data));

  // 7. Unauthenticated access is still refused.
  const denied = await fetch(`${BASE}/api/folders`);
  log('GET /api/folders without a session is 401', denied.status === 401, String(denied.status));

  // 8. The frontend itself is still served from the same origin.
  const page = await fetch(`${BASE}/login`);
  log('GET /login serves the Next.js app', page.status === 200 && (await page.text()).includes('<!DOCTYPE html>'));

  // 9. Logout clears the cookie.
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
