/**
 * Final CMS audit: every kind of managed content (sections, classes, subjects, Kid Games, arcade
 * games, courses) goes through the whole lifecycle — create, read, update, disable, enable,
 * reorder, archive, restore — as an administrator, each step audited and reflected in what users
 * get; and no admin read anywhere carries a password, hash, code or token.
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
import { User } from '../src/models/User';
import { ContentItem } from '../src/models/ContentItem';
import { Course } from '../src/models/Course';
import { ActivityLog } from '../src/models/ActivityLog';

const PASSWORD = 'Strong-Passw0rd-audit';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let admin: string;
let adminId: string;
let user: string;
let userId: string;

async function signIn(email: string, role: 'user' | 'admin') {
  const created = await User.create({ name: `Name ${email}`, email, role, passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  return { cookie: (res.headers.get('set-cookie') ?? '').match(/mt_session=[^;]+/)![0], id: created._id.toString() };
}

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();
  return { status: res.status, data: json?.data, raw: text };
}
const asAdmin = (method: string, path: string, body?: unknown) => call(method, path, body, admin);
const actions = async (targetId: string) => (await ActivityLog.find({ targetId }).sort({ createdAt: 1, _id: 1 }).lean()).map((a) => a.action);
const catalog = async () => (await call('GET', '/api/content/catalog')).data;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([ContentItem.init(), Course.init()]);
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ({ cookie: admin, id: adminId } = await signIn('root@example.com', 'admin'));
  ({ cookie: user, id: userId } = await signIn('learner@example.com', 'user'));
  await catalog(); // seeds
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

/** The catalog group a type is published under, and how an entry is found in it. */
const GROUP = { section: 'sections', class: 'classes', subject: 'subjects', kid_game: 'kidGames', game: 'games' } as const;

const CASES: Array<{ type: keyof typeof GROUP; body: Record<string, unknown>; key: string; prefix: string }> = [
  { type: 'section', body: { key: 'audit-banner', title: 'Audit banner', description: 'Notice' }, key: 'audit-banner', prefix: 'section' },
  { type: 'class', body: { classLevel: 8, title: 'Class 8', description: 'Upper' }, key: 'class-8', prefix: 'content' },
  { type: 'subject', body: { key: 'geography', title: 'Geography', description: 'Maps' }, key: 'geography', prefix: 'content' },
  { type: 'kid_game', body: { key: 'c1-math-audit', title: 'Audit quiz', classLevel: 1, subject: 'math', difficulty: 'easy' }, key: 'c1-math-audit', prefix: 'content' },
  { type: 'game', body: { key: 'audit-arcade', title: 'Audit arcade', description: 'Arcade' }, key: 'audit-arcade', prefix: 'content' },
];

for (const c of CASES) {
  test(`${c.type}: create, read, update, disable, enable, reorder, archive, restore — audited and published`, async () => {
    const created = await asAdmin('POST', '/api/admin/content/items', { type: c.type, ...c.body });
    assert.equal(created.status, 201, created.raw);
    const id = created.data.id as string;
    const find = async () => ((await catalog())[GROUP[c.type]] as Array<{ key: string; title: string; isEnabled: boolean }>).find((e) => e.key === c.key);
    assert.ok(await find(), 'published');

    const list = await asAdmin('GET', `/api/admin/content/items?type=${c.type}&search=${encodeURIComponent(c.key)}&status=all`);
    assert.ok(list.data.some((i: { id: string }) => i.id === id), 'read back in the admin list');

    assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${id}`, { title: 'Renamed' })).status, 200);
    assert.equal((await find())!.title, 'Renamed');

    assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${id}`, { isEnabled: false })).status, 200);
    assert.equal((await find())!.isEnabled, false, 'disabled for users');
    assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${id}`, { isEnabled: true })).status, 200);
    assert.equal((await find())!.isEnabled, true);

    const before = (await ContentItem.findById(id).lean())!.order;
    const moved = await asAdmin('POST', `/api/admin/content/items/${id}/move`, { direction: 'up' });
    assert.equal(moved.status, 200);
    assert.ok(moved.data.order < before, 'moved up');

    assert.equal((await asAdmin('DELETE', `/api/admin/content/items/${id}`)).status, 200);
    assert.equal(await find(), undefined, 'archived: gone for users');
    assert.ok(await ContentItem.exists({ _id: id }), 'archive never deletes');
    assert.equal((await asAdmin('POST', `/api/admin/content/items/${id}/restore`)).status, 200);
    assert.ok(await find(), 'restored');

    const p = c.prefix;
    assert.deepEqual(await actions(id), [
      'content_created',
      'content_updated',
      `${p}_disabled`,
      `${p}_enabled`,
      `${p}_reordered`,
      'content_archived',
      'content_restored',
    ]);
    const logs = await ActivityLog.find({ targetId: id }).lean();
    assert.ok(logs.every((l) => l.performedBy?.toString() === adminId), 'every entry names the administrator');
  });
}

test('course: create, read, update, disable, enable, reorder, archive, restore — audited and published', async () => {
  await Course.create({ slug: 'first-numbers', title: 'First numbers', classLevel: 1, subject: 'math', order: 1, lessons: [] });
  const created = await asAdmin('POST', '/api/admin/content/courses', { title: 'Shapes', classLevel: 1, subject: 'math', summary: 'Circles' });
  assert.equal(created.status, 201, created.raw);
  const { id, slug } = created.data as { id: string; slug: string };
  const visible = async () => (await call('GET', `/api/content/courses/${slug}`, undefined, user)).status;
  assert.equal(await visible(), 200);
  assert.equal((await asAdmin('GET', `/api/admin/content/courses/${id}`)).data.title, 'Shapes');
  assert.equal((await asAdmin('PATCH', `/api/admin/content/courses/${id}`, { title: 'Shapes and sizes' })).status, 200);
  assert.equal((await asAdmin('PATCH', `/api/admin/content/courses/${id}`, { isEnabled: false })).status, 200);
  assert.equal(await visible(), 404, 'disabled: unavailable to users');
  assert.equal((await asAdmin('PATCH', `/api/admin/content/courses/${id}`, { isEnabled: true })).status, 200);
  assert.equal(await visible(), 200);
  assert.equal((await asAdmin('POST', `/api/admin/content/courses/${id}/move`, { direction: 'up' })).status, 200);
  assert.equal((await asAdmin('DELETE', `/api/admin/content/courses/${id}`)).status, 200);
  assert.equal(await visible(), 404, 'archived');
  assert.equal((await asAdmin('POST', `/api/admin/content/courses/${id}/restore`)).status, 200);
  assert.equal(await visible(), 200);
  assert.deepEqual(await actions(id), ['course_created', 'course_updated', 'course_disabled', 'course_enabled', 'course_reordered', 'course_archived', 'course_restored']);
});

test('no admin or user read carries a password, hash, one-time code or token', async () => {
  // Secrets the database does hold, so a leak would have something to show.
  await User.updateOne({ _id: userId }, { $set: { passwordResetOtpHash: 'otp-hash-should-never-leak' } });
  const reads = [
    '/api/admin/stats',
    '/api/admin/activity',
    '/api/admin/users/stats',
    '/api/admin/users',
    `/api/admin/users/${userId}`,
    `/api/admin/users/${userId}/activity`,
    '/api/admin/reviews',
    '/api/admin/reviews/stats',
    '/api/admin/content/stats',
    ...Object.keys(GROUP).map((t) => `/api/admin/content/items?type=${t}&status=all&limit=100`),
    '/api/admin/content/courses',
  ];
  const cookieValue = admin.split('=')[1];
  const forbidden = /passwordHash|"password"|otpHash|OtpHash|codeHash|clientTokenHash|tokenVersion|resetToken|accessToken|refreshToken|idToken|apiKey|api_key|SMTP_|JWT_SECRET|RESEND_|R2_SECRET|MONGODB_URI/;
  for (const path of reads) {
    const res = await asAdmin('GET', path);
    assert.equal(res.status, 200, `${path}: ${res.raw.slice(0, 200)}`);
    assert.doesNotMatch(res.raw, forbidden, path);
    assert.ok(!res.raw.includes(PASSWORD) && !res.raw.includes('otp-hash-should-never-leak') && !res.raw.includes(cookieValue), `${path}: no secret values`);
  }
  for (const [path, cookie] of [['/api/auth/me', user], ['/api/dashboard/storage', user], ['/api/content/catalog', undefined]] as const) {
    const res = await call('GET', path, undefined, cookie);
    assert.equal(res.status, 200, path);
    assert.doesNotMatch(res.raw, forbidden, path);
  }
});

test('the frontend cannot grant itself admin: forged role claims and bodies are refused', async () => {
  const forged = [
    { role: 'admin' },
    { isAdmin: true },
  ];
  for (const extra of forged) {
    const res = await call('POST', '/api/admin/content/items', { type: 'section', key: 'forged', title: 'Forged', ...extra }, user);
    assert.equal(res.status, 403);
  }
  // A role sent to the profile endpoint is ignored.
  const profile = await call('PATCH', '/api/auth/me', { name: 'Still a user', role: 'admin' }, user);
  assert.ok([200, 400].includes(profile.status), `profile update answered: ${profile.status}`);
  assert.equal((await User.findById(userId).lean())!.role, 'user');
  assert.equal((await call('GET', '/api/admin/users', undefined, user)).status, 403);
  assert.equal(await ContentItem.countDocuments({ key: 'forged' }), 0);
});
