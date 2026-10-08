/**
 * Admin user management: the figures, search and filters on /admin/users, the detail view,
 * and — the part that matters most — that suspending an account really does cut it off on
 * the server, rather than only hiding it from a list.
 */
import './setupTestEnv';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { Media } from '../src/models/Media';
import { Folder } from '../src/models/Folder';
import { Review } from '../src/models/Review';
import { ActivityLog } from '../src/models/ActivityLog';
import { KidGameProfile, KidGameRecord } from '../src/models/KidGameProgress';
import { signMediaToken, signSessionToken } from '../src/services/tokenService';

const PASSWORD = 'correct-horse-battery';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;

interface Actor {
  id: string;
  email: string;
  cookie: string;
}
let admin: Actor;
let carol: Actor;
let dave: Actor;

async function makeActor(email: string, name: string, role: 'user' | 'admin', extra: Record<string, unknown> = {}): Promise<Actor> {
  const user = await User.create({ email, name, role, passwordHash: await bcrypt.hash(PASSWORD, 4), ...extra });
  const token = signSessionToken({ sub: user._id.toString(), role, email, name, tokenVersion: user.tokenVersion });
  return { id: user._id.toString(), email, cookie: `${env.COOKIE_NAME}=${token}` };
}

function request(url: string, actor: Actor | null, init: RequestInit = {}) {
  return fetch(`${baseUrl}${url}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(actor ? { cookie: actor.cookie } : {}), ...(init.headers ?? {}) },
  });
}

function setStatus(id: string, isActive: boolean, actor: Actor = admin) {
  return request(`/api/admin/users/${id}/status`, actor, { method: 'PATCH', body: JSON.stringify({ isActive }) });
}

function login(email: string) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, rememberMe: false }),
  });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  admin = await makeActor('root@example.com', 'Root Admin', 'admin');
  carol = await makeActor('carol@example.com', 'Carol Danvers', 'user');
  dave = await makeActor('dave@example.com', 'Dave Lister', 'user');
  // An old, already-suspended account: outside the "new" window and not active.
  await makeActor('old@example.com', 'Olive Old', 'user', {
    isActive: false,
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
  });

  // Carol has content, a review, kid-game progress and some history.
  const file = (name: string, fileType: 'image' | 'video' | 'document', size: number) =>
    Media.create({
      ownerId: carol.id,
      originalName: name,
      storedName: name,
      storageKey: `x/${name}`,
      storageProvider: 'local',
      mimeType: 'application/octet-stream',
      fileType,
      size,
    });
  await file('a.jpg', 'image', 100);
  await file('b.jpg', 'image', 100);
  await file('c.mp4', 'video', 1000);
  await file('d.pdf', 'document', 50);
  await Folder.create({ ownerId: carol.id, name: 'Trips', slug: 'trips' });
  await Review.create({ userId: carol.id, rating: 4, reviewText: 'Really solid app overall.', status: 'pending' });
  await KidGameProfile.create({ userId: carol.id, totalXp: 175, dailyStreak: { current: 1, best: 3, lastDay: null } });
  await KidGameRecord.create([
    { userId: carol.id, gameId: 'c1-math-1', classLevel: 1, subject: 'math', completed: true, stars: 3, attempts: 2 },
    { userId: carol.id, gameId: 'c1-math-2', classLevel: 1, subject: 'math', completed: false, stars: 1, attempts: 1 },
  ]);
  await ActivityLog.create({
    action: 'media_uploaded',
    targetType: 'media',
    targetName: 'a.jpg',
    message: 'Uploaded "a.jpg"',
    performedBy: carol.id,
    performedByEmail: carol.email,
    ip: '203.0.113.9',
    userAgent: 'secret-agent',
  });

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
// Access
// ---------------------------------------------------------------------------------------------

test('a normal user cannot reach any user-management endpoint', async () => {
  for (const [url, init] of [
    ['/api/admin/users', {}],
    ['/api/admin/users/stats', {}],
    [`/api/admin/users/${dave.id}`, {}],
    [`/api/admin/users/${carol.id}`, {}], // not even their own admin profile
    [`/api/admin/users/${dave.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) }],
  ] as const) {
    const res = await request(url, carol, init);
    assert.equal(res.status, 403, url);
  }
  assert.equal((await User.findById(dave.id))!.isActive, true);
});

test('a signed-out visitor is refused with 401', async () => {
  assert.equal((await request('/api/admin/users', null)).status, 401);
  assert.equal((await request(`/api/admin/users/${carol.id}`, null)).status, 401);
});

// ---------------------------------------------------------------------------------------------
// Figures, search, filters
// ---------------------------------------------------------------------------------------------

test('the headline figures come from the database', async () => {
  const body = await (await request('/api/admin/users/stats', admin)).json();
  assert.equal(body.success, true);
  assert.deepEqual(body.data, {
    total: 4,
    active: 3,
    suspended: 1,
    newUsers: 3,
    newUserWindowDays: 30,
    // Accounts from before `authProvider` existed count as email accounts; users who never chose
    // a plan count as Free, and the administrator has no plan at all.
    byProvider: { email: 4, mobile: 0, google: 0 },
    byPlan: { free: 3, pro: 0, premium: 0 },
  });
});

test('search matches name or email, case-insensitively', async () => {
  const byName = await (await request('/api/admin/users?search=danvers', admin)).json();
  assert.deepEqual(byName.data.map((u: { email: string }) => u.email), ['carol@example.com']);

  const byEmail = await (await request('/api/admin/users?search=DAVE@EXAMPLE', admin)).json();
  assert.deepEqual(byEmail.data.map((u: { email: string }) => u.email), ['dave@example.com']);

  // Treated as text, not as a pattern.
  const regexy = await (await request(`/api/admin/users?search=${encodeURIComponent('.*')}`, admin)).json();
  assert.equal(regexy.data.length, 0);
});

test('the status filter separates active from suspended accounts', async () => {
  const suspended = await (await request('/api/admin/users?status=inactive', admin)).json();
  assert.deepEqual(suspended.data.map((u: { email: string }) => u.email), ['old@example.com']);

  const active = await (await request('/api/admin/users?status=active', admin)).json();
  assert.equal(active.meta.total, 3);
  assert.ok(active.data.every((u: { isActive: boolean }) => u.isActive));
});

test('list rows carry file counts, storage and last activity, and never a password', async () => {
  const res = await request('/api/admin/users?search=carol', admin);
  const raw = await res.text();
  const [row] = JSON.parse(raw).data;

  assert.equal(row.mediaCount, 4);
  assert.equal(row.storageUsedBytes, 1250);
  assert.ok(row.lastActiveAt, 'last activity is derived from the activity log');
  assert.ok(!raw.includes('passwordHash') && !raw.includes('$2'), 'no hash, not even a fragment of one');
});

// ---------------------------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------------------------

test('the detail view summarises the account without exposing secrets', async () => {
  const res = await request(`/api/admin/users/${carol.id}`, admin);
  const raw = await res.text();
  const { data } = JSON.parse(raw);

  assert.equal(res.status, 200);
  assert.equal(data.user.email, 'carol@example.com');
  assert.deepEqual(
    { ...data.stats },
    { folderCount: 1, imageCount: 2, videoCount: 1, documentCount: 1, trashCount: 0, storageUsedBytes: 1250 },
  );
  assert.equal(data.review.rating, 4);
  assert.equal(data.review.status, 'pending');
  assert.deepEqual(
    { played: data.kidGames.gamesPlayed, completed: data.kidGames.gamesCompleted, stars: data.kidGames.stars, xp: data.kidGames.totalXp },
    { played: 2, completed: 1, stars: 4, xp: 175 },
  );
  assert.equal(data.recentActivity[0].targetName, 'a.jpg');

  for (const secret of ['passwordHash', 'tokenVersion', 'passwordResetOtpHash', '203.0.113.9', 'secret-agent']) {
    assert.ok(!raw.includes(secret), `${secret} must not be exposed`);
  }
});

test('an account that never played Kid Games has no progress summary rather than zeros', async () => {
  const { data } = await (await request(`/api/admin/users/${dave.id}`, admin)).json();
  assert.equal(data.kidGames, null);
  assert.equal(data.review, null);
});

test('an unknown id is a 404 and a malformed one a 400', async () => {
  assert.equal((await request(`/api/admin/users/${new mongoose.Types.ObjectId()}`, admin)).status, 404);
  assert.equal((await request('/api/admin/users/not-an-id', admin)).status, 400);
});

// ---------------------------------------------------------------------------------------------
// Suspend / activate
// ---------------------------------------------------------------------------------------------

test('an administrator cannot suspend their own account', async () => {
  const res = await setStatus(admin.id, false);
  assert.equal(res.status, 400);
  assert.equal((await User.findById(admin.id))!.isActive, true);
});

test('suspension cuts off an open session, sign-in and signed media links immediately', async () => {
  const media = await Media.findOne({ ownerId: dave.id }).lean() ??
    (await Media.create({
      ownerId: dave.id,
      originalName: 'mine.jpg',
      storedName: 'mine.jpg',
      storageKey: 'x/mine.jpg',
      storageProvider: 'local',
      mimeType: 'image/jpeg',
      fileType: 'image',
      size: 1,
    }));
  const link = `/api/media/${media._id}/raw?token=${signMediaToken({ sub: dave.id, mediaId: media._id.toString() })}`;

  // Baseline: everything works while active.
  assert.equal((await request('/api/auth/me', dave)).status, 200);
  assert.notEqual((await request(link, null)).status, 401);

  const res = await setStatus(dave.id, false);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.isActive, false);

  assert.equal((await request('/api/auth/me', dave)).status, 401, 'the existing session stops working');
  assert.equal((await request('/api/folders', dave)).status, 401, 'on every route, not just one');
  assert.equal((await login(dave.email)).status, 401, 'and they cannot sign back in');
  assert.equal((await request(link, null)).status, 401, 'an already-issued media link dies with the account');

  const log = await ActivityLog.findOne({ action: 'user_deactivated', targetId: dave.id });
  assert.ok(log, 'the suspension is audited');
  assert.equal(log!.performedByEmail, admin.email);
});

test('reactivation restores sign-in but not the sessions that were open before', async () => {
  const res = await setStatus(dave.id, true);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.isActive, true);

  assert.equal((await request('/api/auth/me', dave)).status, 401, 'the pre-suspension cookie stays dead');

  const fresh = await login(dave.email);
  assert.equal(fresh.status, 200, 'a fresh sign-in works again');
  const cookie = fresh.headers.get('set-cookie')!.split(';')[0]!;
  assert.equal((await request('/api/auth/me', { ...dave, cookie })).status, 200);

  assert.ok(await ActivityLog.findOne({ action: 'user_activated', targetId: dave.id }));
});
