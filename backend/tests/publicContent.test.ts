/**
 * Public content read in-process (what server-rendered pages use) against the HTTP API it replaced:
 * the same data, the same year / month filtering, the same 404 / 400 for what isn't there — and no
 * session needed. A page that reads through `publicContent` can't be refused by the host's deployment
 * protection or the API's rate limit, because it makes no HTTP request at all.
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
import { publicContent } from '../src/services/publicContent';

const PASSWORD = 'Strong-Passw0rd';
const YEAR = '2026-27';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let admin: string;

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
  return { status: res.status, data: json?.data, message: json?.message as string | undefined };
}

const lesson = (title: string) => ({
  title,
  explanation: 'Read and think.',
  examples: ['An example'],
  keyPoints: ['A key point'],
  questions: [{ type: 'mcq', prompt: 'Which?', options: ['A', 'B'], answer: 'A', difficulty: 'easy', explanation: 'A is right.' }],
  practice: [],
});
const chapter = (title: string, when: { academicYear?: string; month?: number } = {}) => ({
  title,
  description: `All about ${title}`,
  objectives: [`Understand ${title}`],
  difficulty: 'easy',
  status: 'draft',
  ...when,
  lessons: [lesson(`${title} 1`), lesson(`${title} 2`)],
  quiz: [{ type: 'mcq', prompt: 'Quick check', options: ['Yes', 'No'], answer: 'Yes', difficulty: 'easy', explanation: '' }],
});

/** What the API would have sent to a browser for this read: the same JSON a page gets from the loader. */
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
/** The status an in-process read fails with (an AppError, as the route would have answered). */
const failure = async (read: () => Promise<unknown>) => {
  try {
    await read();
  } catch (err) {
    return (err as { statusCode?: number }).statusCode;
  }
  return undefined;
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([ContentItem.init(), Course.init()]);
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = await signIn('root@example.com', 'admin');

  const created = await call(
    'POST',
    '/api/admin/classes',
    { classLevel: 8, title: 'Class 8', subtitle: 'Scheduled', description: 'A scheduled class', subjects: [{ key: 'math', title: 'Mathematics', description: '', isVisible: true }, { key: 'english', title: 'English', description: '', isVisible: true }] },
    admin,
  );
  assert.equal(created.status, 201, created.message);
  const save = (subject: string, chapters: unknown[]) =>
    call('PUT', `/api/admin/courses/8/${subject}`, { mode: 'new', course: { title: `${subject} course` }, chapters, source: { kind: 'manual', provider: null, model: null } }, admin);
  assert.equal((await save('math', [chapter('Numbers Around Us', { academicYear: YEAR, month: 4 }), chapter('Addition Fun', { academicYear: YEAR, month: 5 }), chapter('Old Chapter')])).status, 201);
  assert.equal((await save('english', [chapter('Alphabet', { academicYear: YEAR, month: 4 })])).status, 201);
  assert.equal((await call('PATCH', '/api/admin/classes/8/status', { status: 'published' }, admin)).status, 200);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

test('class, subject, chapter and schedule read in-process are exactly what the public API sends — with no session', async () => {
  // `call` sends no cookie: all of this is public.
  const [api, direct] = [await call('GET', '/api/content/classes/class-8/curriculum'), await publicContent.curriculum('class-8')];
  assert.equal(api.status, 200);
  assert.deepEqual(json(direct), api.data);

  const subjectApi = await call('GET', '/api/content/classes/class-8/subjects/math');
  assert.deepEqual(json(await publicContent.subject('class-8', 'math')), subjectApi.data);

  const slug = subjectApi.data.subject.chapters[0].slug as string;
  const chapterApi = await call('GET', `/api/content/classes/class-8/subjects/math/chapters/${slug}`);
  assert.equal(chapterApi.status, 200);
  assert.deepEqual(json(await publicContent.chapter('class-8', 'math', slug)), chapterApi.data);
  assert.equal(chapterApi.data.chapter.lessons.length, 2, 'a valid chapter carries its lessons');
  assert.ok(!/"answer"/.test(JSON.stringify(chapterApi.data.chapter.quiz)), 'the quiz still goes out without answers');

  assert.deepEqual(json(await publicContent.schedule('class-8')), (await call('GET', '/api/content/classes/class-8/schedule')).data);
  assert.deepEqual(json(await publicContent.catalog()), (await call('GET', '/api/content/catalog')).data);
});

test('year and month filtering reads the same in-process as over HTTP, for any class', async () => {
  const keys = async (q: Record<string, string>) =>
    (await publicContent.curriculum('class-8', q)).subjects.map((s: { key: string; chapters: unknown[] }) => `${s.key}:${s.chapters.length}`);
  assert.deepEqual(await keys({ academicYear: YEAR, month: '4' }), ['math:1', 'english:1']);
  assert.deepEqual(await keys({ academicYear: YEAR, month: '5' }), ['math:1']);
  assert.deepEqual(await keys({ academicYear: YEAR, month: '6' }), [], 'an empty month is empty, not an error');
  for (const [query, search] of [[{ academicYear: YEAR, month: '4' }, `?academicYear=${YEAR}&month=4`], [{ schedule: 'unscheduled' }, '?schedule=unscheduled']] as const) {
    const api = await call('GET', `/api/content/classes/class-8/curriculum${search}`);
    assert.deepEqual(json(await publicContent.curriculum('class-8', { ...query })), api.data);
  }
  // A malformed or incomplete filter is a 400, never "all": the same as the route.
  assert.equal(await failure(() => publicContent.curriculum('class-8', { academicYear: 'abc' })), 400);
  assert.equal(await failure(() => publicContent.curriculum('class-8', { month: '4' })), 400);
  assert.equal((await call('GET', '/api/content/classes/class-8/curriculum?month=4')).status, 400);
});

test('what is not there is a 404 and a malformed address a 400 — the same codes the API answers', async () => {
  assert.equal(await failure(() => publicContent.curriculum('class-9')), 404, 'a class that does not exist');
  assert.equal(await failure(() => publicContent.subject('class-8', 'hindi')), 404, 'a subject the class does not offer');
  assert.equal(await failure(() => publicContent.chapter('class-8', 'math', 'no-such-chapter')), 404, 'a chapter that does not exist');
  assert.equal(await failure(() => publicContent.manualCourse('class-8', 'math', 'no-such-course')), 404, 'a manual course that does not exist');
  assert.equal(await failure(() => publicContent.subject('grade-8', 'math')), 400, 'a malformed class');
  assert.equal(await failure(() => publicContent.subject('class-8', 'Bad Key!')), 400, 'a malformed subject');
  for (const path of ['/classes/class-9/curriculum', '/classes/class-8/subjects/hindi', '/classes/class-8/subjects/math/chapters/no-such-chapter']) {
    assert.equal((await call('GET', `/api/content${path}`)).status, 404, path);
  }
  assert.deepEqual(json(await publicContent.manualCourses('class-8', 'math')), [], 'no manual courses yet is an empty list');
});

test('a class an administrator hides is gone for in-process reads at once, like the API', async () => {
  assert.equal((await call('PATCH', '/api/admin/classes/8/visibility', { isVisible: false }, admin)).status, 200);
  assert.equal(await failure(() => publicContent.curriculum('class-8')), 404);
  assert.equal(await failure(() => publicContent.subject('class-8', 'math')), 404);
  assert.equal((await call('PATCH', '/api/admin/classes/8/visibility', { isVisible: true }, admin)).status, 200);
  assert.equal((await publicContent.curriculum('class-8')).class.slug, 'class-8');
});
