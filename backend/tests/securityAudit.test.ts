/**
 * Cross-cutting security checks from the Step 7 audit.
 *
 * The route-coverage tests enumerate endpoints from the routers themselves rather than from a
 * hand-written list, so an endpoint added later is covered automatically: every admin route
 * must refuse signed-out callers (401) and normal users (403), and every non-public route must
 * refuse signed-out callers.
 */
import './setupTestEnv';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { Folder } from '../src/models/Folder';
import { ActivityLog } from '../src/models/ActivityLog';
import { signSessionToken } from '../src/services/tokenService';
import apiRouter from '../src/routes';
import adminRoutes from '../src/routes/adminRoutes';
import authRoutes from '../src/routes/authRoutes';
import folderRoutes from '../src/routes/folderRoutes';
import mediaRoutes from '../src/routes/mediaRoutes';
import trashRoutes from '../src/routes/trashRoutes';
import dashboardRoutes from '../src/routes/dashboardRoutes';
import activityRoutes from '../src/routes/activityRoutes';
import searchRoutes from '../src/routes/searchRoutes';
import healthRoutes from '../src/routes/healthRoutes';
import kidGameRoutes from '../src/routes/kidGameRoutes';
import reviewRoutes from '../src/routes/reviewRoutes';
import contentRoutes from '../src/routes/contentRoutes';

const PASSWORD = 'audit-password-123';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;

interface Actor {
  id: string;
  email: string;
  cookie: string;
}
let alice: Actor;
let bob: Actor;
let admin: Actor;

async function makeActor(email: string, role: 'user' | 'admin'): Promise<Actor> {
  const user = await User.create({ email, name: email.split('@')[0]!, role, passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const token = signSessionToken({ sub: user._id.toString(), role, email, name: user.name, tokenVersion: 0 });
  return { id: user._id.toString(), email, cookie: `${env.COOKIE_NAME}=${token}` };
}

function call(method: string, url: string, cookie?: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Mounted exactly as in src/routes/index.ts — checked against it in the first test. */
const MOUNTS: ReadonlyArray<[string, Router]> = [
  ['/auth', authRoutes],
  ['/folders', folderRoutes],
  ['/media', mediaRoutes],
  ['/trash', trashRoutes],
  ['/dashboard', dashboardRoutes],
  ['/activity', activityRoutes],
  ['/search', searchRoutes],
  ['/admin', adminRoutes],
  ['/health', healthRoutes],
  ['/kid-games', kidGameRoutes],
  ['/reviews', reviewRoutes],
  ['/content', contentRoutes],
];

/** Reachable without a session, by design. Everything else must answer 401 when signed out. */
const PUBLIC_ENDPOINTS = new Set([
  'POST /api/auth/signup',
  'POST /api/auth/login',
  'POST /api/auth/forgot-password',
  'POST /api/auth/verify-otp',
  'POST /api/auth/reset-password',
  'GET /api/auth/signup/mobile/config',
  'POST /api/auth/signup/mobile',
  'POST /api/auth/signup/mobile/resend',
  'POST /api/auth/signup/mobile/verify',
  'POST /api/auth/login/mobile',
  'GET /api/auth/google/config',
  'POST /api/auth/google',
  'GET /api/health/',
  'GET /api/reviews/public',
  'GET /api/content/catalog',
]);

interface Endpoint {
  method: string;
  path: string;
}

type Layer = { route?: { path: string; methods: Record<string, boolean> } };

function endpointsOf(prefix: string, router: Router): Endpoint[] {
  const out: Endpoint[] = [];
  for (const layer of (router as unknown as { stack: Layer[] }).stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      // A syntactically valid id, so a route answers on auth rather than tripping validation first.
      const path = layer.route.path.replace(/:[A-Za-z]+/g, new mongoose.Types.ObjectId().toString());
      out.push({ method: method.toUpperCase(), path: `/api${prefix}${path}` });
    }
  }
  return out;
}

const ALL_ENDPOINTS = MOUNTS.flatMap(([prefix, router]) => endpointsOf(prefix, router));
const ADMIN_ENDPOINTS = endpointsOf('/admin', adminRoutes);
const key = (e: Endpoint) => `${e.method} ${e.path.replace(/[0-9a-f]{24}/g, ':id')}`;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  alice = await makeActor('alice@example.com', 'user');
  bob = await makeActor('bob@example.com', 'user');
  admin = await makeActor('root@example.com', 'admin');
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

// ---------------------------------------------------------------------------------------------
// Route coverage
// ---------------------------------------------------------------------------------------------

test('the audited mount list matches every router the API actually mounts', () => {
  const mounted = (apiRouter as unknown as { stack: Array<{ route?: unknown; name: string }> }).stack.filter(
    (l) => !l.route && l.name === 'router',
  );
  assert.equal(mounted.length, MOUNTS.length, 'a router was added to src/routes/index.ts without being audited here');
  assert.ok(ADMIN_ENDPOINTS.length >= 14, `expected the full admin surface, found ${ADMIN_ENDPOINTS.length}`);
});

test('every admin endpoint refuses a signed-out caller with 401', async () => {
  for (const e of ADMIN_ENDPOINTS) {
    const res = await call(e.method, e.path, undefined, e.method === 'GET' ? undefined : {});
    assert.equal(res.status, 401, key(e));
  }
});

test('every admin endpoint refuses a normal user with 403', async () => {
  for (const e of ADMIN_ENDPOINTS) {
    const res = await call(e.method, e.path, alice.cookie, e.method === 'GET' ? undefined : { isActive: false, reason: 'x' });
    assert.equal(res.status, 403, key(e));
  }
  assert.equal((await User.findById(bob.id))!.isActive, true);
});

test('an administrator does get through the admin guard', async () => {
  assert.equal((await call('GET', '/api/admin/stats', admin.cookie)).status, 200);
  assert.equal((await call('GET', '/api/admin/users', admin.cookie)).status, 200);
});

test('every non-public endpoint refuses a signed-out caller', async () => {
  const checked: string[] = [];
  for (const e of ALL_ENDPOINTS) {
    if (PUBLIC_ENDPOINTS.has(key(e))) continue;
    const res = await call(e.method, e.path, undefined, e.method === 'GET' ? undefined : {});
    assert.equal(res.status, 401, key(e));
    checked.push(key(e));
  }
  assert.ok(checked.length > 40, `only ${checked.length} endpoints were checked`);
});

// ---------------------------------------------------------------------------------------------
// Sessions and tokens
// ---------------------------------------------------------------------------------------------

test('the session cookie is HTTP-only, SameSite and scoped to the site', async () => {
  const res = await call('POST', '/api/auth/login', undefined, { email: alice.email, password: PASSWORD, rememberMe: true });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie') ?? '';
  assert.match(cookie, new RegExp(`^${env.COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\//i);
  assert.match(cookie, /Max-Age=\d+/i, '"remember me" persists the cookie');

  const body = await res.text();
  assert.ok(!body.includes(cookie.split(';')[0]!.split('=')[1]!), 'the token itself never appears in a response body');
});

test('without "remember me" the cookie lasts only for the browser session', async () => {
  const res = await call('POST', '/api/auth/login', undefined, { email: alice.email, password: PASSWORD, rememberMe: false });
  const cookie = res.headers.get('set-cookie') ?? '';
  assert.doesNotMatch(cookie, /Max-Age|Expires/i);
});

test('logout clears the cookie', async () => {
  const res = await call('POST', '/api/auth/logout', alice.cookie);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie') ?? '', /Expires=Thu, 01 Jan 1970/i);
});

test('expired, forged, unsigned and wrong-algorithm tokens are all refused', async () => {
  const claims = { sub: alice.id, role: 'admin', email: alice.email, name: 'x', tokenVersion: 0 };
  const forged = {
    expired: jwt.sign(claims, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: -10 }),
    wrongSecret: jwt.sign(claims, 'not-the-real-secret-at-all', { algorithm: 'HS256' }),
    otherAlgorithm: jwt.sign(claims, env.JWT_SECRET, { algorithm: 'HS512' }),
    unsigned: `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.`,
  };
  for (const [name, token] of Object.entries(forged)) {
    const res = await call('GET', '/api/auth/me', `${env.COOKIE_NAME}=${token}`);
    assert.equal(res.status, 401, name);
  }
});

test('a role claim in the token grants nothing: the role is read from the database', async () => {
  // Validly signed, but claims admin for a normal account (e.g. a token minted before a demotion).
  const token = signSessionToken({ sub: alice.id, role: 'admin', email: alice.email, name: 'alice', tokenVersion: 0 });
  const res = await call('GET', '/api/admin/users', `${env.COOKIE_NAME}=${token}`);
  assert.equal(res.status, 403);
});

test('the JWT secret never appears in any response', async () => {
  const responses = await Promise.all([
    call('GET', '/api/auth/me', alice.cookie),
    call('POST', '/api/auth/login', undefined, { email: alice.email, password: PASSWORD }),
    call('GET', '/api/health'),
    call('GET', '/api/does-not-exist'),
    call('GET', '/api/admin/users', admin.cookie),
  ]);
  for (const res of responses) {
    assert.ok(!(await res.text()).includes(env.JWT_SECRET));
  }
});

// ---------------------------------------------------------------------------------------------
// Ownership comes from the session, never from the request
// ---------------------------------------------------------------------------------------------

test('ownerId / userId / role sent by the client are ignored', async () => {
  const folderRes = await call('POST', '/api/folders', bob.cookie, { name: 'Mine', ownerId: alice.id, createdBy: alice.id });
  assert.equal(folderRes.status, 201);
  const folder = await Folder.findOne({ name: 'Mine' });
  assert.equal(folder!.ownerId.toString(), bob.id, 'created for the session, not the body');

  const patch = await call('PATCH', '/api/auth/me', bob.cookie, { name: 'Bob B', role: 'admin', isActive: false, tokenVersion: 99 });
  assert.equal(patch.status, 200);
  const stored = await User.findById(bob.id);
  assert.deepEqual([stored!.role, stored!.isActive, stored!.tokenVersion], ['user', true, 0]);

  const review = await call('POST', '/api/reviews', bob.cookie, { rating: 5, reviewText: 'Great app, honestly.', category: 'overall', userId: alice.id, status: 'approved', isPublic: true });
  assert.equal(review.status, 201);
  const own = await (await call('GET', '/api/reviews/me', alice.cookie)).json();
  assert.equal(own.data, null, "the review was not attributed to the id in the body");
  const bobs = await (await call('GET', '/api/reviews/me', bob.cookie)).json();
  assert.deepEqual([bobs.data.status, bobs.data.isPublic], ['pending', false]);
});

test("game progress is per account: one user's results never show for another", async () => {
  const post = await call('POST', '/api/kid-games/results', alice.cookie, {
    gameId: 'c1-math-number-runner',
    correct: 9,
    total: 10,
    seconds: 60,
    bestStreak: 5,
  });
  assert.ok(post.status === 200 || post.status === 201, `result accepted (${post.status})`);
  const mine = await (await call('GET', '/api/kid-games/progress', alice.cookie)).json();
  const theirs = await (await call('GET', '/api/kid-games/progress', bob.cookie)).json();
  assert.ok(JSON.stringify(mine.data).includes('c1-math-number-runner'));
  assert.ok(!JSON.stringify(theirs.data).includes('c1-math-number-runner'));
});

// ---------------------------------------------------------------------------------------------
// Audit log integrity
// ---------------------------------------------------------------------------------------------

test('a client cannot choose the IP address recorded in the audit log', async () => {
  await call('POST', '/api/auth/login', undefined, { email: bob.email, password: 'wrong-password' }, { 'x-forwarded-for': '6.6.6.6' });
  const entry = await ActivityLog.findOne({ action: 'login_failed' }).sort({ createdAt: -1 });
  assert.ok(entry);
  assert.notEqual(entry!.ip, '6.6.6.6', 'X-Forwarded-For is only believed from a trusted proxy (TRUST_PROXY)');
});
