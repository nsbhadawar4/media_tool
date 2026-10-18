/**
 * The learning path visitors and users follow: Class → Subject → Chapter, read from the public API
 * the class pages use (/api/content/classes/…). Every class works the same — Classes 1–5, and any
 * class an administrator adds — and a subject is only ever read through the class that offers it,
 * so Class 6's Hindi is never another class's Hindi.
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

const PASSWORD = 'Strong-Passw0rd';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let admin: string;
let user: string;

async function signIn(email: string, role: 'user' | 'admin') {
  await User.create({ name: `Name of ${email}`, email, role, passwordHash: await bcrypt.hash(PASSWORD, 4) });
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
  return { status: res.status, data: json?.data, message: json?.message as string | undefined, details: json?.error?.details as Array<{ path: string; message: string }> | undefined };
}

interface PublicSubject {
  key: string;
  title: string;
  games: number;
  chapters: Array<{ slug: string; title: string; lessons: unknown[]; quiz: Array<Record<string, unknown>>; activities: Array<{ questions: Array<Record<string, unknown>> }> }>;
}
const subjectOf = (slug: string, subject: string) => call('GET', `/api/content/classes/${slug}/subjects/${subject}`);
const curriculumOf = (slug: string) => call('GET', `/api/content/classes/${slug}/curriculum`);
const chapter = (title: string) => ({
  title,
  description: `All about ${title}`,
  objectives: [`Understand ${title}`],
  difficulty: 'medium',
  status: 'draft',
  lessons: [
    {
      title: `${title}: the idea`,
      explanation: 'Read and think.',
      examples: ['An example'],
      keyPoints: ['A key point'],
      questions: [{ type: 'mcq', prompt: 'Which?', options: ['A', 'B'], answer: 'A', difficulty: 'easy', explanation: 'A is right.' }],
      practice: [],
    },
  ],
  quiz: [{ type: 'mcq', prompt: 'Quick check', options: ['Yes', 'No'], answer: 'Yes', difficulty: 'easy', explanation: '' }],
});
/** Saves chapters for one subject of a class, as the course generator does (drafts until published). */
const saveSubject = (level: number, subject: string, chapters: unknown[], mode: 'new' | 'new-version' = 'new') =>
  call('PUT', `/api/admin/courses/${level}/${subject}`, { mode, course: { title: `${subject} course` }, chapters, source: { kind: 'template', provider: null, model: null } }, admin);

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([ContentItem.init(), Course.init()]);
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = await signIn('root@example.com', 'admin');
  user = await signIn('kid@example.com', 'user');

  // Class 6, as an administrator makes it: Hindi and a new Science, each with its own chapters.
  const created = await call(
    'POST',
    '/api/admin/classes',
    {
      classLevel: 6,
      title: 'Class 6',
      subtitle: 'Foundation to Exploration',
      description: 'Hindi and Science',
      subjects: [
        { key: 'hindi', title: 'Hindi', description: 'हिंदी', isVisible: true },
        { title: 'Science', description: 'Plants, animals and energy', isVisible: true },
      ],
    },
    admin,
  );
  assert.equal(created.status, 201, created.message);
  for (const [key, chapters] of [['hindi', [chapter('Kahani'), chapter('Vyakaran')]], ['science', [chapter('Plants')]]] as const) {
    const saved = await saveSubject(6, key, [...chapters]);
    assert.equal(saved.status, 201, saved.message);
  }
  // Generated chapters are drafts until published.
  assert.equal((await subjectOf('class-6', 'hindi')).data.subject.chapters.length, 0);
  assert.equal((await call('PATCH', '/api/admin/classes/6/status', { status: 'published' }, admin)).status, 200);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

test('regression, Classes 1–6: every class opens, and every subject it offers opens through it', async () => {
  for (const level of [1, 2, 3, 4, 5, 6]) {
    const slug = `class-${level}`;
    const cls = await curriculumOf(slug);
    assert.equal(cls.status, 200, `${slug}: ${cls.message}`);
    assert.equal(cls.data.class.slug, slug);
    assert.equal(cls.data.class.classLevel, level);
    const keys = (cls.data.subjects as PublicSubject[]).map((s) => s.key);
    assert.deepEqual(keys, level <= 5 ? ['hindi', 'english', 'math'] : ['hindi', 'science'], slug);
    for (const key of keys) {
      const res = await subjectOf(slug, key);
      assert.equal(res.status, 200, `${slug}/${key}: ${res.message}`);
      assert.equal(res.data.class.slug, slug, `${slug}/${key} is read through its own class`);
      assert.equal(res.data.subject.key, key);
      // The same subject as the class page lists, chapters included.
      const listed = (cls.data.subjects as PublicSubject[]).find((s) => s.key === key)!;
      assert.deepEqual(res.data.subject, listed, `${slug}/${key} matches the class page`);
    }
  }
});

test('Class 6 → Hindi is Class 6’s Hindi: its own chapters, never another class’s, and no answers', async () => {
  const six = await subjectOf('class-6', 'hindi');
  assert.deepEqual((six.data.subject as PublicSubject).chapters.map((c) => c.title), ['Kahani', 'Vyakaran']);
  assert.ok((six.data.subject as PublicSubject).chapters.every((c) => c.slug.startsWith('c6-hindi-')));
  // Class 1 offers Hindi too — but not Class 6's chapters.
  const one = await subjectOf('class-1', 'hindi');
  assert.equal(one.status, 200);
  assert.deepEqual((one.data.subject as PublicSubject).chapters, []);
  assert.ok((one.data.subject as PublicSubject).games > 0, 'Class 1 Hindi is learned through its games');
  // Answers and internal fields stay with administrators.
  const body = JSON.stringify(six.data);
  assert.ok(!/"answer"/.test(body), 'no quiz or practice answers');
  assert.ok(!/"_?id"|createdBy|updatedBy|"generated"|"isVisible"/.test(body), 'no ids or admin-only fields');
});

test('a subject the class does not offer is 404 — the browser can’t pair any class with any subject', async () => {
  // Science exists (Class 6 offers it) but Class 1 doesn't.
  assert.equal((await subjectOf('class-1', 'science')).status, 404);
  // English exists, but Class 6 doesn't offer it.
  assert.equal((await subjectOf('class-6', 'english')).status, 404);
  // No such subject, no such class, and malformed addresses.
  assert.equal((await subjectOf('class-6', 'astronomy')).status, 404);
  assert.equal((await subjectOf('class-9', 'hindi')).status, 404);
  assert.equal((await curriculumOf('class-9')).status, 404);
  assert.equal((await subjectOf('class-6', 'Bad Key!')).status, 400);
  assert.equal((await subjectOf('grade-6', 'hindi')).status, 400);
});

test('visibility: a hidden class is gone publicly (class, subjects) and back when shown; admins still preview it', async () => {
  assert.equal((await call('PATCH', '/api/admin/classes/6/visibility', { isVisible: false }, admin)).status, 200);
  assert.equal((await curriculumOf('class-6')).status, 404);
  assert.equal((await subjectOf('class-6', 'hindi')).status, 404);
  const catalog = (await call('GET', '/api/content/catalog')).data as { classes: Array<{ key: string; isVisible: boolean }> };
  assert.equal(catalog.classes.find((c) => c.key === 'class-6')?.isVisible, false, 'the lists leave it out');
  const preview = await call('GET', '/api/admin/classes/6/curriculum', undefined, admin);
  assert.equal(preview.status, 200);
  assert.equal(preview.data.subjects.length, 2, 'the admin preview still has everything');

  assert.equal((await call('PATCH', '/api/admin/classes/6/visibility', { isVisible: true }, admin)).status, 200);
  assert.equal((await curriculumOf('class-6')).status, 200);
  assert.equal((await subjectOf('class-6', 'hindi')).status, 200);
});

test('a subject hidden in one class, or switched off everywhere, stops opening there', async () => {
  // Hidden in Class 6 only: Class 6 Science is gone, nothing else changes.
  const cls = (await call('GET', '/api/admin/classes/6', undefined, admin)).data as { subjects: Array<{ key: string; title: string; description: string }> };
  const rows = cls.subjects.map((s) => ({ key: s.key, title: s.title, description: s.description, isVisible: s.key !== 'science' }));
  assert.equal((await call('PATCH', '/api/admin/classes/6', { subjects: rows }, admin)).status, 200);
  assert.equal((await subjectOf('class-6', 'science')).status, 404);
  assert.equal((await subjectOf('class-6', 'hindi')).status, 200);
  assert.equal((await call('PATCH', '/api/admin/classes/6', { subjects: rows.map((r) => ({ ...r, isVisible: true })) }, admin)).status, 200);
  assert.equal((await subjectOf('class-6', 'science')).status, 200);

  // Switched off everywhere (Content → Subjects): gone from every class.
  const math = await ContentItem.findOne({ type: 'subject', key: 'math' });
  assert.equal((await call('PATCH', `/api/admin/content/items/${math!._id}`, { isEnabled: false }, admin)).status, 200);
  assert.equal((await subjectOf('class-2', 'math')).status, 404);
  assert.ok(!((await curriculumOf('class-2')).data.subjects as PublicSubject[]).some((s) => s.key === 'math'));
  assert.equal((await call('PATCH', `/api/admin/content/items/${math!._id}`, { isEnabled: true }, admin)).status, 200);
  assert.equal((await subjectOf('class-2', 'math')).status, 200);
});

test('a hidden chapter leaves its subject; the rest stay in order', async () => {
  const kahani = await Course.findOne({ classLevel: 6, subject: 'hindi', title: 'Kahani' });
  assert.equal((await call('PATCH', `/api/admin/content/courses/${kahani!._id}`, { isVisible: false }, admin)).status, 200);
  assert.deepEqual(((await subjectOf('class-6', 'hindi')).data.subject as PublicSubject).chapters.map((c) => c.title), ['Vyakaran']);
  assert.equal((await call('PATCH', `/api/admin/content/courses/${kahani!._id}`, { isVisible: true }, admin)).status, 200);
  assert.deepEqual(((await subjectOf('class-6', 'hindi')).data.subject as PublicSubject).chapters.map((c) => c.title), ['Kahani', 'Vyakaran']);
});

test('a class an administrator adds (Class 7) works at once: class, subjects and chapters — no code change', async () => {
  const created = await call('POST', '/api/admin/classes', { classLevel: 7, title: 'Class 7', description: 'Explorers', subjects: [{ key: 'math', title: 'Mathematics', description: 'Maths', isVisible: true }] }, admin);
  assert.equal(created.status, 201, created.message);
  assert.equal((await saveSubject(7, 'math', [chapter('Integers'), chapter('Fractions')])).status, 201);
  assert.equal((await call('PATCH', '/api/admin/classes/7/status', { status: 'published' }, admin)).status, 200);
  const catalog = (await call('GET', '/api/content/catalog')).data as { classes: Array<{ key: string; isEnabled: boolean; isVisible: boolean }> };
  assert.ok(catalog.classes.some((c) => c.key === 'class-7' && c.isEnabled && c.isVisible), 'listed on the home page and dashboard');
  const math7 = await subjectOf('class-7', 'math');
  assert.equal(math7.status, 200);
  assert.deepEqual((math7.data.subject as PublicSubject).chapters.map((c) => c.title), ['Integers', 'Fractions']);
  // Class 7's maths chapters are Class 7's alone.
  assert.ok(!((await subjectOf('class-3', 'math')).data.subject as PublicSubject).chapters.some((c) => c.title === 'Integers'));
  // A draft class isn't public.
  assert.equal((await call('PATCH', '/api/admin/classes/7/status', { status: 'draft' }, admin)).status, 200);
  assert.equal((await subjectOf('class-7', 'math')).status, 404);
  assert.equal((await call('PATCH', '/api/admin/classes/7/status', { status: 'published' }, admin)).status, 200);
  assert.equal((await subjectOf('class-7', 'math')).status, 200);
});

test('a class never renames a shared subject, and its subject descriptions are its own', async () => {
  const cls = (await call('GET', '/api/admin/classes/1', undefined, admin)).data as { subjects: Array<{ key: string; title: string; description: string; classDescription: string }> };
  const rows = cls.subjects.map((s) => ({ key: s.key, title: s.title, description: s.classDescription || s.description, isVisible: true }));
  const english = rows.findIndex((r) => r.key === 'english');
  // Renaming English (to "Hindi", or anything) from Class 1 is refused — before anything is saved.
  for (const title of ['hindi ', 'English Language']) {
    const res = await call('PATCH', '/api/admin/classes/1', { title: 'Renamed Class 1', subjects: rows.map((r, i) => (i === english ? { ...r, title } : r)) }, admin);
    assert.equal(res.status, 400);
    assert.match(res.message!, /“English” is shared by every class/);
    assert.deepEqual(res.details?.map((d) => d.path), [`subjects.${english}.title`]);
  }
  assert.equal((await ContentItem.findOne({ type: 'subject', key: 'english' }))!.title, 'English');
  assert.equal((await ContentItem.findOne({ type: 'class', key: 'class-1' }))!.title, 'Class 1');

  // Class 1 describes its English its own way; Class 4's (and the shared subject) are untouched.
  const class4Before = ((await subjectOf('class-4', 'english')).data.subject as PublicSubject & { description: string }).description;
  const ok = await call('PATCH', '/api/admin/classes/1', { subjects: rows.map((r, i) => (i === english ? { ...r, description: 'Phonics and first words' } : r)) }, admin);
  assert.equal(ok.status, 200, ok.message);
  assert.equal(((await subjectOf('class-1', 'english')).data.subject as { description: string }).description, 'Phonics and first words');
  assert.equal(((await subjectOf('class-4', 'english')).data.subject as { description: string }).description, class4Before);
  assert.equal((await ContentItem.findOne({ type: 'subject', key: 'english' }))!.description, 'English');
});

test('only administrators change classes: signed out 401, a normal user 403; reading stays public', async () => {
  assert.equal((await call('PATCH', '/api/admin/classes/6', { title: 'Hacked' })).status, 401);
  assert.equal((await call('PATCH', '/api/admin/classes/6', { title: 'Hacked' }, user)).status, 403);
  assert.equal((await call('PUT', '/api/admin/courses/6/hindi', { mode: 'new', course: { title: 'x' }, chapters: [chapter('X')] }, user)).status, 403);
  assert.equal((await ContentItem.findOne({ type: 'class', key: 'class-6' }))!.title, 'Class 6');
  // Signed out and signed in read the same public class data.
  assert.equal((await subjectOf('class-6', 'hindi')).status, 200);
  assert.equal((await call('GET', '/api/content/classes/class-6/subjects/hindi', undefined, user)).status, 200);
});

test('archive and restore: an archived class is gone publicly (lists, class, subjects, its chapters) and comes back whole', async () => {
  assert.equal((await call('DELETE', '/api/admin/classes/6', undefined, admin)).status, 200);
  const catalog = (await call('GET', '/api/content/catalog')).data as { classes: Array<{ key: string }>; courses: Array<{ classLevel: number }> };
  assert.ok(!catalog.classes.some((c) => c.key === 'class-6'), 'archived classes are absent from the catalog');
  assert.equal((await curriculumOf('class-6')).status, 404);
  assert.equal((await subjectOf('class-6', 'hindi')).status, 404);
  const slug = (await Course.findOne({ classLevel: 6, subject: 'hindi', archivedAt: null }))!.slug;
  assert.equal((await call('GET', `/api/content/courses/${slug}`, undefined, user)).status, 404, 'its chapters stop opening');
  const admins = (await call('GET', '/api/admin/classes?status=all', undefined, admin)).data as Array<{ classLevel: number; status: string }>;
  assert.equal(admins.find((c) => c.classLevel === 6)?.status, 'archived', 'administrators still see it');

  assert.equal((await call('POST', '/api/admin/classes/6/restore', undefined, admin)).status, 200);
  assert.equal((await curriculumOf('class-6')).status, 200);
  assert.deepEqual(((await subjectOf('class-6', 'hindi')).data.subject as PublicSubject).chapters.map((c) => c.title), ['Kahani', 'Vyakaran']);
  assert.equal((await call('GET', `/api/content/courses/${slug}`, undefined, user)).status, 200);
});

test('Kid Games OFF: classes, subjects, chapters and courses all still work — only games stop', async () => {
  const kid = await ContentItem.findOne({ type: 'section', key: 'kid-games' });
  assert.equal((await call('PATCH', `/api/admin/content/items/${kid!._id}`, { isEnabled: false }, admin)).status, 200);
  try {
    for (const level of [1, 6, 7]) assert.equal((await curriculumOf(`class-${level}`)).status, 200, `class-${level}`);
    const hindi = (await subjectOf('class-6', 'hindi')).data.subject as PublicSubject;
    assert.deepEqual(hindi.chapters.map((c) => c.title), ['Kahani', 'Vyakaran']);
    const courses = (await call('GET', '/api/content/courses?classLevel=6&subject=hindi', undefined, user)).data as Array<{ slug: string }>;
    assert.equal(courses.length, 2);
    assert.equal((await call('GET', `/api/content/courses/${courses[0]!.slug}`, undefined, user)).status, 200);
    // Games are what Kid Games switches off.
    const played = await call('POST', '/api/kid-games/results', { gameId: 'c1-math-math-quiz', correct: 7, total: 10, seconds: 30 }, user);
    assert.equal(played.status, 403);
  } finally {
    await call('PATCH', `/api/admin/content/items/${kid!._id}`, { isEnabled: true }, admin);
  }
});

test('a chapter opens only under its own class and subject; drafts and hidden ones never open for learners', async () => {
  const kahani = await Course.findOne({ classLevel: 6, subject: 'hindi', title: 'Kahani', archivedAt: null });
  // The course API follows the same rules as the class pages: a hidden subject in the class hides it.
  const cls = (await call('GET', '/api/admin/classes/6', undefined, admin)).data as { subjects: Array<{ key: string; title: string; classDescription: string; description: string }> };
  const rows = cls.subjects.map((s) => ({ key: s.key, title: s.title, description: s.classDescription || s.description, isVisible: s.key !== 'hindi' }));
  await call('PATCH', '/api/admin/classes/6', { subjects: rows }, admin);
  assert.equal((await call('GET', `/api/content/courses/${kahani!.slug}`, undefined, user)).status, 404);
  await call('PATCH', '/api/admin/classes/6', { subjects: rows.map((r) => ({ ...r, isVisible: true })) }, admin);
  assert.equal((await call('GET', `/api/content/courses/${kahani!.slug}`, undefined, user)).status, 200);

  // A newly generated chapter is a draft: in the admin preview, nowhere else (not even by its address).
  assert.equal((await saveSubject(6, 'science', [chapter('Magnets')], 'new-version')).status, 201);
  const draftCourse = await Course.findOne({ classLevel: 6, subject: 'science', title: 'Magnets' });
  assert.equal(draftCourse!.draft, true);
  assert.equal((await call('GET', `/api/content/courses/${draftCourse!.slug}`, undefined, user)).status, 404);
  assert.ok(!((await subjectOf('class-6', 'science')).data.subject as PublicSubject).chapters.some((c) => c.title === 'Magnets'));
  assert.ok(!((await call('GET', '/api/content/catalog')).data.courses as Array<{ title: string }>).some((c) => c.title === 'Magnets'));
  assert.deepEqual(((await subjectOf('class-6', 'science')).data.subject as PublicSubject).chapters.map((c) => c.title), ['Plants'], 'what learners see is unchanged');
  // Publishing swaps it in; the earlier generated chapter is archived, not deleted.
  assert.equal((await call('PATCH', '/api/admin/classes/6/status', { status: 'published' }, admin)).status, 200);
  assert.deepEqual(((await subjectOf('class-6', 'science')).data.subject as PublicSubject).chapters.map((c) => c.title), ['Magnets']);
  assert.ok(await Course.exists({ classLevel: 6, subject: 'science', title: 'Plants', archivedAt: { $ne: null } }));
});

test('normal users and visitors can change nothing in Manage Courses', async () => {
  const attempts: Array<[string, string, unknown?]> = [
    ['POST', '/api/admin/classes', { classLevel: 9, title: 'Class 9' }],
    ['PATCH', '/api/admin/classes/6', { title: 'Hacked' }],
    ['PATCH', '/api/admin/classes/6/visibility', { isVisible: false }],
    ['PATCH', '/api/admin/classes/6/order', { position: 1 }],
    ['PATCH', '/api/admin/classes/6/status', { status: 'draft' }],
    ['DELETE', '/api/admin/classes/6'],
    ['POST', '/api/admin/classes/6/restore'],
    ['POST', '/api/admin/classes/6/duplicate', {}],
    ['PUT', '/api/admin/courses/6/hindi', { mode: 'new', course: { title: 'x' }, chapters: [chapter('X')] }],
    ['POST', '/api/admin/courses/6/hindi/publish'],
    ['POST', '/api/admin/courses/generate/outline', { brief: {}, engine: 'template' }],
    ['POST', '/api/admin/content/courses', { title: 'X', classLevel: 6, subject: 'hindi' }],
    ['POST', '/api/admin/classes/images'],
  ];
  for (const [method, path, body] of attempts) {
    assert.equal((await call(method, path, body)).status, 401, `${method} ${path} signed out`);
    assert.equal((await call(method, path, body, user)).status, 403, `${method} ${path} as a user`);
  }
  const six = (await ContentItem.findOne({ type: 'class', key: 'class-6' }))!;
  assert.deepEqual([six.title, six.isVisible, six.archivedAt], ['Class 6', true, null]);
  assert.equal(await ContentItem.countDocuments({ type: 'class', classLevel: 9 }), 0);
});
