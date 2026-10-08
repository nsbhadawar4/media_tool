/**
 * The Class → Subject → Course → Game hierarchy: the migration from the code catalog (idempotent,
 * no data loss), admin CRUD for classes, subjects (and which classes offer them), courses and
 * games with every relationship validated on the server, admin-only access, and what users then
 * get — disabled or archived content gone, at every level.
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
import { seedCatalog } from '../src/services/contentService';

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
  return { status: res.status, data: json?.data, error: json?.error, message: json?.message };
}
const asAdmin = (method: string, path: string, body?: unknown) => call(method, path, body, admin);
const item = async (type: string, key: string) => (await ContentItem.findOne({ type, key }).lean())!;
const catalog = async () => (await call('GET', '/api/content/catalog')).data;
const result = (gameId: string) => call('POST', '/api/kid-games/results', { gameId, correct: 8, total: 10, seconds: 30 }, user);

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

// ------------------------------------------------------------------------------------ migration

test('migration: the existing 5 classes, 3 subjects, 15 class subjects and 150 games are all represented', async () => {
  await seedCatalog();
  const count = (type: string) => ContentItem.countDocuments({ type });
  assert.deepEqual([await count('class'), await count('subject'), await count('class_subject'), await count('kid_game')], [5, 3, 15, 150]);
  const game = await item('kid_game', 'c2-math-number-runner');
  assert.deepEqual([game.classLevel, game.subject, game.difficulty, game.gameType, game.source], [2, 'math', 'easy', 'ordering', 'code'], 'ids preserved, fields from the code');
});

test('migration: running it again creates nothing, keeps admin edits, and backfills missing fields', async () => {
  const game = await item('kid_game', 'c1-english-word-match');
  await ContentItem.updateOne({ _id: game._id }, { $set: { title: 'Word Match (edited)', order: 42 }, $unset: { difficulty: '', gameType: '' } });
  const before = await ContentItem.countDocuments({});

  const again = await seedCatalog();
  assert.equal(again.inserted, 0, 'no duplicates');
  assert.equal(await ContentItem.countDocuments({}), before);
  assert.equal(await ContentItem.countDocuments({}), CATALOG_SEED.length);
  const after = await item('kid_game', 'c1-english-word-match');
  assert.deepEqual([after.title, after.order], ['Word Match (edited)', 42], 'the admin edit survives');
  assert.deepEqual([after.difficulty, after.gameType], ['easy', 'matching'], 'missing code fields are filled back in');
  assert.equal((await seedCatalog()).updated, 0, 'a third run changes nothing');
});

// ------------------------------------------------------------------------------------ access

test('every hierarchy change is admin-only: 401 signed out, 403 for a user', async () => {
  const bodies = [
    { type: 'class', title: 'Class 6', classLevel: 6 },
    { type: 'subject', key: 'science', title: 'Science' },
    { type: 'class_subject', title: 'Link', classLevel: 1, subject: 'math' },
    { type: 'kid_game', key: 'x', title: 'X', classLevel: 1, subject: 'math' },
  ];
  for (const body of bodies) {
    assert.equal((await call('POST', '/api/admin/content/items', body)).status, 401);
    assert.equal((await call('POST', '/api/admin/content/items', body, user)).status, 403);
  }
  const course = { title: 'C', classLevel: 1, subject: 'math' };
  assert.equal((await call('POST', '/api/admin/content/courses', course)).status, 401);
  assert.equal((await call('POST', '/api/admin/content/courses', course, user)).status, 403);
  assert.equal(await ContentItem.countDocuments({ source: 'admin' }), 0);
});

// ------------------------------------------------------------------------------------ classes

test('classes: create (key from the number), duplicates refused, update, enable / disable, reorder, archive / restore', async () => {
  const created = await asAdmin('POST', '/api/admin/content/items', { type: 'class', key: 'ignored', title: 'Class 6', description: 'Bigger challenges', classLevel: 6, thumbnailUrl: 'https://example.com/c6.png' });
  assert.equal(created.status, 201);
  assert.deepEqual([created.data.key, created.data.classLevel, created.data.order, created.data.thumbnailUrl], ['class-6', 6, 6, 'https://example.com/c6.png']);
  assert.equal((await asAdmin('POST', '/api/admin/content/items', { type: 'class', title: 'Again', classLevel: 6 })).status, 409);
  for (const bad of [{ type: 'class', title: 'X' }, { type: 'class', title: 'X', classLevel: 0 }, { type: 'class', title: 'X', classLevel: 13 }, { type: 'class', title: 'X', classLevel: 7, thumbnailUrl: 'javascript:alert(1)' }]) {
    assert.equal((await asAdmin('POST', '/api/admin/content/items', bad)).status, 400, JSON.stringify(bad));
  }
  const id = created.data.id;
  const updated = await asAdmin('PATCH', `/api/admin/content/items/${id}`, { title: 'Class Six', description: 'Advanced' });
  assert.deepEqual([updated.status, updated.data.title], [200, 'Class Six']);
  assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${id}`, { classLevel: 7 })).status, 400, 'a class keeps its number');
  assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${id}`, { isEnabled: false })).data.isEnabled, false);
  assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${id}`, { isEnabled: true })).data.isEnabled, true);
  const moved = await asAdmin('POST', `/api/admin/content/items/${id}/move`, { direction: 'up' });
  assert.equal(moved.data.order, 5);
  assert.equal((await item('class', 'class-5')).order, 6);
  assert.equal((await asAdmin('DELETE', `/api/admin/content/items/${id}`)).status, 200);
  assert.ok(!(await catalog()).classes.some((c: { key: string }) => c.key === 'class-6'), 'archived classes are gone for users');
  assert.equal((await asAdmin('POST', `/api/admin/content/items/${id}/restore`)).status, 200);
  assert.ok((await catalog()).classes.some((c: { key: string }) => c.key === 'class-6'));
});

// ------------------------------------------------------------------------------------ subjects

test('subjects: create, update, enable / disable, archive; assign to one or more classes', async () => {
  const created = await asAdmin('POST', '/api/admin/content/items', { type: 'subject', key: 'science', title: 'Science', description: 'Plants, animals and space', glyph: '🔬' });
  assert.equal(created.status, 201);
  assert.equal(created.data.glyph, '🔬');
  assert.equal((await asAdmin('POST', '/api/admin/content/items', { type: 'subject', key: 'math', title: 'Maths again' })).status, 409);
  const id = created.data.id;
  assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${id}`, { title: 'Science & Nature' })).data.title, 'Science & Nature');
  assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${id}`, { difficulty: 'hard' })).status, 400, 'a subject has no difficulty');

  // Assign to Class 6 and Class 1 — the link key comes from the server.
  for (const classLevel of [6, 1]) {
    const link = await asAdmin('POST', '/api/admin/content/items', { type: 'class_subject', title: `Class ${classLevel} · Science`, classLevel, subject: 'science', key: 'whatever' });
    assert.equal(link.status, 201, `class ${classLevel}`);
    assert.equal(link.data.key, `class-${classLevel}-science`);
  }
  assert.equal((await asAdmin('POST', '/api/admin/content/items', { type: 'class_subject', title: 'dup', classLevel: 1, subject: 'science' })).status, 409);
  assert.equal((await asAdmin('POST', '/api/admin/content/items', { type: 'class_subject', title: 'x', classLevel: 9, subject: 'science' })).status, 400, 'no Class 9');
  assert.equal((await asAdmin('POST', '/api/admin/content/items', { type: 'class_subject', title: 'x', classLevel: 1, subject: 'art' })).status, 400, 'no such subject');
  const science1 = (await catalog()).classSubjects.filter((l: { subject: string }) => l.subject === 'science').map((l: { classLevel: number }) => l.classLevel).sort();
  assert.deepEqual(science1, [1, 6]);

  assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${id}`, { isEnabled: false })).data.isEnabled, false);
  assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${id}`, { isEnabled: true })).data.isEnabled, true);
  const art = await asAdmin('POST', '/api/admin/content/items', { type: 'subject', key: 'art', title: 'Art' });
  assert.equal((await asAdmin('DELETE', `/api/admin/content/items/${art.data.id}`)).status, 200);
  assert.ok(!(await catalog()).subjects.some((s: { key: string }) => s.key === 'art'));
});

// ------------------------------------------------------------------------------------ courses

let scienceCourse: string;
let mathCourse: string;

test('courses: must sit in a class that offers the subject; create, update, enable / disable, archive', async () => {
  for (const bad of [
    { title: 'No class', subject: 'math' },
    { title: 'No subject', classLevel: 1 },
    { title: 'Bad class', classLevel: 9, subject: 'math' },
    { title: 'Unknown subject', classLevel: 1, subject: 'art' },
    { title: 'Not offered', classLevel: 6, subject: 'math' },
    { title: 'Bad thumbnail', classLevel: 1, subject: 'math', thumbnailUrl: 'data:image/png;base64,AAAA' },
    { title: 'Bad difficulty', classLevel: 1, subject: 'math', difficulty: 'expert' },
  ]) {
    assert.equal((await asAdmin('POST', '/api/admin/content/courses', bad)).status, 400, bad.title);
  }
  const science = await asAdmin('POST', '/api/admin/content/courses', {
    title: 'Plants Around Us',
    summary: 'How plants grow',
    classLevel: 6,
    subject: 'science',
    thumbnailUrl: 'https://example.com/plants.png',
    difficulty: 'medium',
    ageGroup: '11–12 years',
    learningObjective: 'Name the parts of a plant and what each does.',
    lessons: [{ title: 'Roots and stems', body: 'Roots drink water.' }],
  });
  assert.equal(science.status, 201);
  assert.deepEqual([science.data.difficulty, science.data.ageGroup, science.data.learningObjective.length > 0], ['medium', '11–12 years', true]);
  scienceCourse = science.data.id;
  mathCourse = (await asAdmin('POST', '/api/admin/content/courses', { title: 'Counting to 20', classLevel: 1, subject: 'math' })).data.id;

  const updated = await asAdmin('PATCH', `/api/admin/content/courses/${scienceCourse}`, { title: 'Plants & Trees', difficulty: 'hard' });
  assert.deepEqual([updated.data.title, updated.data.difficulty], ['Plants & Trees', 'hard']);
  assert.equal((await asAdmin('PATCH', `/api/admin/content/courses/${scienceCourse}`, { classLevel: 2 })).status, 400, 'Class 2 doesn’t offer science');
  assert.equal((await asAdmin('PATCH', `/api/admin/content/courses/${scienceCourse}`, { isEnabled: false })).data.isEnabled, false);
  assert.equal((await asAdmin('PATCH', `/api/admin/content/courses/${scienceCourse}`, { isEnabled: true })).data.isEnabled, true);

  const temp = await asAdmin('POST', '/api/admin/content/courses', { title: 'Temporary', classLevel: 1, subject: 'english' });
  assert.equal((await asAdmin('DELETE', `/api/admin/content/courses/${temp.data.id}`)).status, 200);
  assert.ok(!(await catalog()).courses.some((c: { id: string }) => c.id === temp.data.id), 'archived courses are gone');
});

// ------------------------------------------------------------------------------------ games

test('games: create in a class subject and course; assignment validated; code games keep their content-bound fields', async () => {
  const created = await asAdmin('POST', '/api/admin/content/items', {
    type: 'kid_game',
    key: 'c6-science-plant-parts',
    title: 'Plant Parts',
    classLevel: 6,
    subject: 'science',
    courseId: scienceCourse,
    difficulty: 'medium',
    gameType: 'matching',
    thumbnailUrl: 'https://example.com/parts.png',
  });
  assert.equal(created.status, 201);
  assert.deepEqual([created.data.courseId, created.data.difficulty, created.data.gameType], [scienceCourse, 'medium', 'matching']);
  const gameId = created.data.id;

  // Invalid assignments.
  assert.equal((await asAdmin('POST', '/api/admin/content/items', { type: 'kid_game', key: 'c6-math-x', title: 'X', classLevel: 6, subject: 'math' })).status, 400, 'Class 6 offers no maths');
  assert.equal((await asAdmin('POST', '/api/admin/content/items', { type: 'kid_game', key: 'c6-science-y', title: 'Y', classLevel: 6, subject: 'science', courseId: mathCourse })).status, 400, 'course from another class/subject');
  assert.equal((await asAdmin('POST', '/api/admin/content/items', { type: 'kid_game', key: 'c6-science-z', title: 'Z', classLevel: 6, subject: 'science', courseId: new mongoose.Types.ObjectId().toString() })).status, 400, 'unknown course');
  assert.equal((await asAdmin('POST', '/api/admin/content/items', { type: 'kid_game', key: 'c6-science-w', title: 'W', classLevel: 6, subject: 'science', gameType: 'chess' })).status, 400, 'unknown game type');

  // Update and re-assign.
  assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${gameId}`, { title: 'Parts of a Plant', difficulty: 'easy' })).data.difficulty, 'easy');
  assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${gameId}`, { courseId: mathCourse })).status, 400, 'course must match');
  const moved = await asAdmin('PATCH', `/api/admin/content/items/${gameId}`, { classLevel: 1, courseId: null });
  assert.deepEqual([moved.status, moved.data.classLevel, moved.data.courseId], [200, 1, null], 'moved to Class 1 Science (offered)');
  await asAdmin('PATCH', `/api/admin/content/items/${gameId}`, { classLevel: 6, courseId: scienceCourse });

  // A code game: its course can be set, but not what its content fixes.
  const quiz = await item('kid_game', 'c1-math-math-quiz');
  assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${quiz._id}`, { courseId: mathCourse })).data.courseId, mathCourse);
  for (const fixed of [{ classLevel: 2 }, { subject: 'english' }, { difficulty: 'easy' }, { gameType: 'memory' }]) {
    assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${quiz._id}`, fixed)).status, 400, JSON.stringify(fixed));
  }

  // A course with games can't silently change class.
  const conflict = await asAdmin('PATCH', `/api/admin/content/courses/${mathCourse}`, { subject: 'english' });
  assert.equal(conflict.status, 409);

  // Enable / disable / archive / restore.
  assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${gameId}`, { isEnabled: false })).data.isEnabled, false);
  assert.equal((await asAdmin('PATCH', `/api/admin/content/items/${gameId}`, { isEnabled: true })).data.isEnabled, true);
  assert.equal((await asAdmin('DELETE', `/api/admin/content/items/${gameId}`)).status, 200);
  assert.equal((await asAdmin('POST', `/api/admin/content/items/${gameId}/restore`)).status, 200);
  const audited = (await ActivityLog.find({ targetType: 'content', targetName: { $in: ['Plant Parts', 'Parts of a Plant'] } }).lean()).map((e) => e.action);
  for (const action of ['content_created', 'content_updated', 'content_disabled', 'content_enabled', 'content_archived', 'content_restored']) {
    assert.ok(audited.includes(action as never), action);
  }
});

// ------------------------------------------------------------------------------------ users

test('users: disabling a class, a class subject, a course or a game removes exactly that — on the server too', async () => {
  // Baseline: playable.
  assert.equal((await result('c2-math-number-runner')).status, 201);
  assert.equal((await result('c2-english-word-match')).status, 201);

  // Class 2 → Math off: Class 2 maths stops; Class 2 English and Class 3 maths carry on.
  const link = await item('class_subject', 'class-2-math');
  await asAdmin('PATCH', `/api/admin/content/items/${link._id}`, { isEnabled: false });
  assert.equal((await result('c2-math-number-runner')).status, 403);
  assert.equal((await result('c2-english-word-match')).status, 201);
  assert.equal((await result('c3-math-number-runner')).status, 201);
  await asAdmin('PATCH', `/api/admin/content/items/${link._id}`, { isEnabled: true });

  // A whole class off.
  const class3 = await item('class', 'class-3');
  await asAdmin('PATCH', `/api/admin/content/items/${class3._id}`, { isEnabled: false });
  assert.equal((await result('c3-math-number-runner')).status, 403);
  assert.equal((await catalog()).classes.find((c: { key: string }) => c.key === 'class-3').isEnabled, false);
  await asAdmin('PATCH', `/api/admin/content/items/${class3._id}`, { isEnabled: true });

  // One game off: only that game.
  const runner = await item('kid_game', 'c4-math-number-runner');
  await asAdmin('PATCH', `/api/admin/content/items/${runner._id}`, { isEnabled: false });
  assert.equal((await result('c4-math-number-runner')).status, 403);
  assert.equal((await result('c4-math-math-quiz')).status, 201);
  await asAdmin('PATCH', `/api/admin/content/items/${runner._id}`, { isEnabled: true });

  // A course off: its games stop (c1-math-math-quiz was put in "Counting to 20" above).
  await asAdmin('PATCH', `/api/admin/content/courses/${mathCourse}`, { isEnabled: false });
  assert.equal((await result('c1-math-math-quiz')).status, 403);
  assert.equal((await result('c1-math-number-runner')).status, 201, 'games outside the course are unaffected');
  await asAdmin('PATCH', `/api/admin/content/courses/${mathCourse}`, { isEnabled: true });
  assert.equal((await result('c1-math-math-quiz')).status, 201);
});

test('users: published courses follow the class subject they sit in, and the admin order', async () => {
  const list = async (q = '') => (await call('GET', `/api/content/courses${q}`, undefined, user)).data.map((c: { title: string }) => c.title);
  assert.deepEqual(await list(), ['Plants & Trees', 'Counting to 20']);
  assert.deepEqual(await list('?classLevel=1&subject=math'), ['Counting to 20']);
  await asAdmin('POST', `/api/admin/content/courses/${mathCourse}/move`, { direction: 'up' });
  assert.deepEqual(await list(), ['Counting to 20', 'Plants & Trees'], 'reordered');

  const scienceLink = await item('class_subject', 'class-6-science');
  await asAdmin('PATCH', `/api/admin/content/items/${scienceLink._id}`, { isEnabled: false });
  assert.deepEqual(await list(), ['Counting to 20'], 'Class 6 Science off hides its course');
  assert.equal((await call('GET', '/api/content/courses/plants-around-us', undefined, user)).status, 404);
  await asAdmin('PATCH', `/api/admin/content/items/${scienceLink._id}`, { isEnabled: true });
  assert.equal((await call('GET', '/api/content/courses/plants-around-us', undefined, user)).status, 200);

  const c = await catalog();
  const game = c.kidGames.find((g: { key: string }) => g.key === 'c6-science-plant-parts');
  assert.equal(game.courseId, scienceCourse, 'the catalog carries the course link');
  assert.ok(c.courses.some((x: { id: string; lessonCount: number }) => x.id === scienceCourse && x.lessonCount === 1));
});
