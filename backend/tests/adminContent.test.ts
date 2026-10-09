/**
 * Admin content management: the catalog (sections, classes, subjects, Kid Games, games) seeded
 * from code and controlled from the admin panel, and courses. Admin-only on the server, validated,
 * soft-deleting, audited — and what users can do follows it (a disabled Kid Game stops counting).
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
import { CATALOG_SEED } from '../src/content/catalogSeed';

const PASSWORD = 'Strong-Passw0rd';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let admin: string;
let user: string;

async function signIn(email: string, role: 'user' | 'admin') {
  await User.create({ name: email, email, role, passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  return (res.headers.get('set-cookie') ?? '').match(/mt_session=[^;]+/)![0];
}

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, data: json?.data, meta: json?.meta, error: json?.error, message: json?.message, raw: JSON.stringify(json) };
}
const item = async (type: string, key: string) => (await ContentItem.findOne({ type, key }).lean())!;
const audit = (action: string) => ActivityLog.find({ action }).sort({ createdAt: -1 }).lean();

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([ContentItem.init(), Course.init()]);
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = await signIn('root@example.com', 'admin');
  user = await signIn('kid@example.com', 'user');
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

// ------------------------------------------------------------------------------------ access

test('every content endpoint: 401 signed out, 403 for a normal user — reads and writes alike', async () => {
  const id = new mongoose.Types.ObjectId().toString();
  const endpoints: Array<[string, string, unknown?]> = [
    ['GET', '/api/admin/content/stats'],
    ['GET', '/api/admin/content/items?type=game'],
    ['POST', '/api/admin/content/items', { type: 'game', key: 'x', title: 'X' }],
    ['PATCH', `/api/admin/content/items/${id}`, { title: 'X' }],
    ['POST', `/api/admin/content/items/${id}/move`, { direction: 'up' }],
    ['DELETE', `/api/admin/content/items/${id}`],
    ['POST', `/api/admin/content/items/${id}/restore`],
    ['GET', '/api/admin/content/courses'],
    ['POST', '/api/admin/content/courses', { title: 'X' }],
    ['GET', `/api/admin/content/courses/${id}`],
    ['PATCH', `/api/admin/content/courses/${id}`, { title: 'X' }],
    ['DELETE', `/api/admin/content/courses/${id}`],
  ];
  for (const [method, path, body] of endpoints) {
    assert.equal((await call(method, path, body)).status, 401, `${method} ${path} signed out`);
    assert.equal((await call(method, path, body, user)).status, 403, `${method} ${path} as a user`);
  }
  // Claiming to be an admin in the body changes nothing.
  assert.equal((await call('POST', '/api/admin/content/items', { type: 'game', key: 'x', title: 'X', role: 'admin' }, user)).status, 403);
  assert.equal(await ContentItem.countDocuments({ key: 'x' }), 0);
});

// ------------------------------------------------------------------------------------ catalog

test('the catalog is seeded from the code, once, with the right counts', async () => {
  const { status, data } = await call('GET', '/api/admin/content/stats', undefined, admin);
  assert.equal(status, 200);
  assert.deepEqual(
    [data.section.total, data.class.total, data.subject.total, data.kid_game.total, data.game.total],
    [14, 5, 3, 150, 7],
  );
  assert.equal(await ContentItem.countDocuments({}), CATALOG_SEED.length);
  assert.equal(data.section.hidden, 1, 'Pricing starts hidden, as on the live home page');
  assert.equal((await item('section', 'pricing')).isVisible, false);
});

test('listing: filter by type, class, subject and status; search; sort; page', async () => {
  const math1 = await call('GET', '/api/admin/content/items?type=kid_game&classLevel=1&subject=math&limit=100', undefined, admin);
  assert.equal(math1.data.length, 10);
  assert.deepEqual(math1.data.map((i: { order: number }) => i.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const quiz = await call('GET', '/api/admin/content/items?type=kid_game&search=quiz&limit=100', undefined, admin);
  assert.ok(quiz.data.length >= 10 && quiz.data.every((i: { title: string; key: string }) => /quiz/i.test(i.title + i.key)));
  const hidden = await call('GET', '/api/admin/content/items?type=section&status=hidden', undefined, admin);
  assert.deepEqual(hidden.data.map((i: { key: string }) => i.key), ['pricing']);
  const byTitle = await call('GET', '/api/admin/content/items?type=game&sort=title', undefined, admin);
  const titles = byTitle.data.map((i: { title: string }) => i.title);
  assert.deepEqual(titles, [...titles].sort((a: string, b: string) => a.localeCompare(b)));
  const page2 = await call('GET', '/api/admin/content/items?type=kid_game&limit=20&page=2', undefined, admin);
  assert.deepEqual(page2.meta, { page: 2, limit: 20, total: 150, totalPages: 8 });
  assert.equal((await call('GET', '/api/admin/content/items?type=course', undefined, admin)).status, 400, 'unknown type');
  assert.equal((await call('GET', '/api/admin/content/items', undefined, admin)).status, 400, 'type is required');
});

test('create: validated, unique, and placed last among its siblings', async () => {
  const created = await call('POST', '/api/admin/content/items', { type: 'game', key: 'chess', title: 'Chess', description: 'Coming soon' }, admin);
  assert.equal(created.status, 201);
  assert.deepEqual([created.data.source, created.data.order, created.data.isEnabled, created.data.isVisible], ['admin', 8, true, true]);
  const [entry] = await audit('content_created');
  assert.equal(entry!.performedByEmail, 'root@example.com');
  assert.deepEqual(entry!.metadata, { type: 'game', key: 'chess' });

  const kid = await call('POST', '/api/admin/content/items', { type: 'kid_game', key: 'c2-math-shape-hunt', title: 'Shape Hunt', classLevel: 2, subject: 'math' }, admin);
  assert.equal(kid.status, 201);
  assert.equal(kid.data.order, 11, 'after the 10 Class 2 maths games');

  // Duplicates.
  assert.equal((await call('POST', '/api/admin/content/items', { type: 'game', key: 'ludo', title: 'Ludo again' }, admin)).status, 409);
  assert.equal((await call('POST', '/api/admin/content/items', { type: 'game', key: 'CHESS', title: 'Chess' }, admin)).status, 409, 'keys are case-insensitive');
  assert.equal((await call('POST', '/api/admin/content/items', { type: 'class', key: 'class-one', title: 'Class 1', classLevel: 1 }, admin)).status, 409, 'Class 1 exists');

  // Invalid payloads.
  const bad: unknown[] = [
    { type: 'game', key: 'Bad Key!', title: 'X' },
    { type: 'game', key: 'ok', title: '' },
    { type: 'widget', key: 'ok', title: 'X' },
    { type: 'kid_game', key: 'c9-x', title: 'X' },
    { type: 'game', key: 'ok', title: 'X', classLevel: 2 },
    { type: 'game', key: 'ok2', title: 'X', source: 'code' },
    { type: 'game', key: 'ok3', title: 'X', archivedAt: null },
    { type: 'game', key: 'ok4', title: 'X'.repeat(121) },
  ];
  for (const body of bad) assert.equal((await call('POST', '/api/admin/content/items', body, admin)).status, 400, JSON.stringify(body));
  const unknownClass = await call('POST', '/api/admin/content/items', { type: 'kid_game', key: 'c9-math-x', title: 'X', classLevel: 9, subject: 'math' }, admin);
  assert.equal(unknownClass.status, 400);
  const unknownSubject = await call('POST', '/api/admin/content/items', { type: 'kid_game', key: 'c1-art-x', title: 'X', classLevel: 1, subject: 'art' }, admin);
  assert.equal(unknownSubject.status, 400);
});

test('update, enable / disable and show / hide are separate, audited changes', async () => {
  const ludo = await item('game', 'ludo');
  const renamed = await call('PATCH', `/api/admin/content/items/${ludo._id}`, { title: 'Ludo King', description: 'Board classic' }, admin);
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.title, 'Ludo King');
  assert.deepEqual((await audit('content_updated'))[0]!.metadata, { type: 'game', key: 'ludo', fields: ['title', 'description'] });

  await call('PATCH', `/api/admin/content/items/${ludo._id}`, { isEnabled: false }, admin);
  await call('PATCH', `/api/admin/content/items/${ludo._id}`, { isVisible: false }, admin);
  await call('PATCH', `/api/admin/content/items/${ludo._id}`, { isEnabled: true, isVisible: true }, admin);
  for (const action of ['content_disabled', 'content_hidden', 'content_enabled', 'content_shown']) {
    assert.equal((await audit(action)).length, 1, action);
  }

  const catalog = await call('GET', '/api/content/catalog');
  assert.equal(catalog.status, 200, 'public — the home page reads it signed out');
  assert.equal(catalog.data.games.find((g: { key: string }) => g.key === 'ludo').title, 'Ludo King');
  assert.ok(!/createdBy|updatedBy|"_id"|source/.test(catalog.raw), 'nothing internal in the public catalog');

  assert.equal((await call('PATCH', `/api/admin/content/items/${ludo._id}`, {}, admin)).status, 400, 'nothing to update');
  assert.equal((await call('PATCH', `/api/admin/content/items/${ludo._id}`, { key: 'other' }, admin)).status, 400, 'the key is fixed');
  assert.equal((await call('PATCH', '/api/admin/content/items/not-an-id', { title: 'X' }, admin)).status, 400, 'invalid id');
  assert.equal((await call('PATCH', `/api/admin/content/items/${new mongoose.Types.ObjectId()}`, { title: 'X' }, admin)).status, 404);
});

test('disabling a Kid Game — or its class — stops its results counting, on the server', async () => {
  const result = { gameId: 'c1-math-math-quiz', correct: 9, total: 10, seconds: 40 };
  assert.equal((await call('POST', '/api/kid-games/results', result, user)).status, 201);

  const game = await item('kid_game', 'c1-math-math-quiz');
  await call('PATCH', `/api/admin/content/items/${game._id}`, { isEnabled: false }, admin);
  const refused = await call('POST', '/api/kid-games/results', result, user);
  assert.deepEqual([refused.status, refused.error?.code], [403, 'GAME_UNAVAILABLE']);
  await call('PATCH', `/api/admin/content/items/${game._id}`, { isEnabled: true }, admin);
  assert.equal((await call('POST', '/api/kid-games/results', result, user)).status, 201);

  const class1 = await item('class', 'class-1');
  await call('PATCH', `/api/admin/content/items/${class1._id}`, { isEnabled: false }, admin);
  assert.equal((await call('POST', '/api/kid-games/results', result, user)).status, 403, 'the whole class is off');
  await call('PATCH', `/api/admin/content/items/${class1._id}`, { isEnabled: true }, admin);
});

test('reorder moves an entry past its neighbour, within its own group', async () => {
  const first = await item('kid_game', 'c3-english-alphabet-adventure');
  const second = await item('kid_game', 'c3-english-word-match');
  const hindiOrder = async () => (await ContentItem.find({ type: 'kid_game', classLevel: 3, subject: 'hindi' }).sort({ key: 1 }).lean()).map((i) => i.order);
  const hindiBefore = await hindiOrder();
  const moved = await call('POST', `/api/admin/content/items/${second._id}/move`, { direction: 'up' }, admin);
  assert.equal(moved.status, 200);
  assert.equal(moved.data.order, first.order);
  assert.equal((await item('kid_game', 'c3-english-alphabet-adventure')).order, second.order);
  assert.deepEqual(await hindiOrder(), hindiBefore, 'other groups are untouched');

  const top = await call('POST', `/api/admin/content/items/${second._id}/move`, { direction: 'up' }, admin);
  assert.equal(top.message, 'Already first');
  assert.equal((await audit('content_reordered')).length, 1);
  assert.equal((await call('POST', `/api/admin/content/items/${second._id}/move`, { direction: 'sideways' }, admin)).status, 400);
});

test('delete archives (users lose it), and restore brings it back', async () => {
  const snake = await item('game', 'snake');
  const archived = await call('DELETE', `/api/admin/content/items/${snake._id}`, undefined, admin);
  assert.equal(archived.status, 200);
  assert.ok(archived.data.archivedAt);
  assert.ok(await ContentItem.exists({ _id: snake._id }), 'not destroyed');
  assert.ok(!(await call('GET', '/api/content/catalog')).data.games.some((g: { key: string }) => g.key === 'snake'));
  assert.equal((await call('PATCH', `/api/admin/content/items/${snake._id}`, { title: 'X' }, admin)).status, 409, 'archived entries are read-only');
  assert.equal((await call('DELETE', `/api/admin/content/items/${snake._id}`, undefined, admin)).status, 409);
  const archivedList = await call('GET', '/api/admin/content/items?type=game&status=archived', undefined, admin);
  assert.deepEqual(archivedList.data.map((i: { key: string }) => i.key), ['snake']);

  const restored = await call('POST', `/api/admin/content/items/${snake._id}/restore`, undefined, admin);
  assert.equal(restored.status, 200);
  assert.equal(restored.data.archivedAt, null);
  assert.ok((await call('GET', '/api/content/catalog')).data.games.some((g: { key: string }) => g.key === 'snake'));
  assert.equal((await call('POST', `/api/admin/content/items/${snake._id}/restore`, undefined, admin)).status, 409);
  assert.deepEqual([(await audit('content_archived')).length, (await audit('content_restored')).length], [1, 1]);
});

// ------------------------------------------------------------------------------------ courses

test('courses: create, list, read, update, hide, disable, archive, restore — all audited', async () => {
  const body = {
    title: 'Fractions Made Easy',
    summary: 'Halves, quarters and more',
    classLevel: 3,
    subject: 'math',
    lessons: [
      { title: 'What is a half?', body: 'Cut it in two equal parts.' },
      { title: 'Video: quarters', body: '', url: 'https://example.com/quarters' },
    ],
  };
  const created = await call('POST', '/api/admin/content/courses', body, admin);
  assert.equal(created.status, 201);
  assert.equal(created.data.slug, 'fractions-made-easy');
  assert.equal(created.data.lessons.length, 2);
  const id = created.data.id;

  const again = await call('POST', '/api/admin/content/courses', body, admin);
  assert.equal(again.data.slug, 'fractions-made-easy-2', 'a derived address is made unique');
  assert.equal((await call('POST', '/api/admin/content/courses', { ...body, slug: 'fractions-made-easy' }, admin)).status, 409, 'an explicit one must be');

  for (const badBody of [
    { title: '' },
    { title: 'X', lessons: [{ title: 'L', url: 'javascript:alert(1)' }] },
    { title: 'X', lessons: [{ title: 'L', url: 'data:text/html,hi' }] },
    { title: 'X', subject: 'Not A Key' },
    { title: 'X', createdBy: 'me' },
  ]) {
    assert.equal((await call('POST', '/api/admin/content/courses', badBody, admin)).status, 400, JSON.stringify(badBody));
  }
  assert.equal((await call('POST', '/api/admin/content/courses', { title: 'X', subject: 'art' }, admin)).status, 400, 'unknown subject');

  // Users read published courses.
  const listed = await call('GET', '/api/content/courses', undefined, user);
  assert.deepEqual(listed.data.map((c: { slug: string; lessonCount: number }) => [c.slug, c.lessonCount]), [['fractions-made-easy', 2], ['fractions-made-easy-2', 2]]);
  assert.equal((await call('GET', '/api/content/courses')).status, 401, 'signed-in users only');
  const read = await call('GET', '/api/content/courses/fractions-made-easy', undefined, user);
  assert.equal(read.data.lessons[1].url, 'https://example.com/quarters');

  // Hidden: unlisted but reachable by its link. Disabled: gone.
  await call('PATCH', `/api/admin/content/courses/${id}`, { isVisible: false }, admin);
  assert.ok(!(await call('GET', '/api/content/courses', undefined, user)).data.some((c: { id: string }) => c.id === id));
  assert.equal((await call('GET', '/api/content/courses/fractions-made-easy', undefined, user)).status, 200);
  await call('PATCH', `/api/admin/content/courses/${id}`, { isEnabled: false }, admin);
  assert.equal((await call('GET', '/api/content/courses/fractions-made-easy', undefined, user)).status, 404);
  await call('PATCH', `/api/admin/content/courses/${id}`, { isEnabled: true, isVisible: true, title: 'Fractions!', lessons: [{ title: 'Only lesson' }] }, admin);
  assert.equal((await Course.findById(id))!.lessons.length, 1);

  // Reorder, archive, restore.
  const moved = await call('POST', `/api/admin/content/courses/${again.data.id}/move`, { direction: 'up' }, admin);
  assert.equal(moved.status, 200);
  assert.equal((await call('GET', '/api/content/courses', undefined, user)).data[0].id, again.data.id);
  assert.equal((await call('DELETE', `/api/admin/content/courses/${id}`, undefined, admin)).status, 200);
  assert.equal((await call('GET', '/api/content/courses/fractions-made-easy', undefined, user)).status, 404);
  assert.equal((await call('PATCH', `/api/admin/content/courses/${id}`, { title: 'X' }, admin)).status, 409);
  assert.equal((await call('POST', `/api/admin/content/courses/${id}/restore`, undefined, admin)).status, 200);
  assert.equal((await call('GET', '/api/content/courses/fractions-made-easy', undefined, user)).status, 200);

  const actions = (await ActivityLog.find({ targetType: 'course' }).lean()).map((e) => e.action);
  for (const action of ['course_created', 'course_hidden', 'course_disabled', 'course_enabled', 'course_shown', 'course_updated', 'course_reordered', 'course_archived', 'course_restored']) {
    assert.ok(actions.includes(action as never), action);
  }
  assert.equal((await call('GET', '/api/admin/content/courses/not-an-id', undefined, admin)).status, 400);
  assert.equal((await call('GET', `/api/admin/content/courses/${new mongoose.Types.ObjectId()}`, undefined, admin)).status, 404);
});

test('audit entries name the administrator and carry only safe metadata', async () => {
  const entries = await ActivityLog.find({ targetType: { $in: ['content', 'course'] } }).lean();
  assert.ok(entries.length >= 15);
  for (const e of entries) {
    assert.equal(e.performedByEmail, 'root@example.com');
    assert.ok(!/password|token|otp|secret|hash/i.test(JSON.stringify(e.metadata ?? {})));
  }
  const listed = await call('GET', '/api/admin/activity?category=cms&limit=100', undefined, admin);
  assert.equal(listed.data.length, entries.length, 'the activity log shows them under "cms"');
});
