/**
 * The Course & Class Generator: subject inference and chapter building (deterministic, offline),
 * the admin flow draft → curriculum → publish → hide/show → duplicate on the existing content
 * (classes, class ↔ subject links, courses), and what the public may read.
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
import { TemplateCurriculumGenerator } from '../src/services/curriculum/templateGenerator';
import { OptionalAICurriculumGenerator } from '../src/services/curriculum';
import { findFreeResources } from '../src/services/curriculum/resources';

const PASSWORD = 'Strong-Passw0rd';
const gen = new TemplateCurriculumGenerator();

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let admin: string;
let user: string;
const realFetch = globalThis.fetch;

async function signIn(email: string, role: 'user' | 'admin') {
  await User.create({ name: `Name of ${email}`, email, role, passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const res = await realFetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  return (res.headers.get('set-cookie') ?? '').match(/mt_session=[^;]+/)![0];
}

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await realFetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, data: json?.data, message: json?.message as string | undefined };
}

type Catalog = { classes: Array<{ classLevel: number; isEnabled: boolean; isVisible: boolean }> };
const listed = async () => ((await call('GET', '/api/content/catalog')).data as Catalog).classes.filter((c) => c.isEnabled && c.isVisible).map((c) => c.classLevel);

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([ContentItem.init(), Course.init()]);
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = await signIn('root@example.com', 'admin');
  user = await signIn('kid@example.com', 'user');
  assert.equal((await call('GET', '/api/content/catalog')).status, 200);
});

after(async () => {
  globalThis.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

// ------------------------------------------------------------------------------------ the engine

test('subjects come from what was written: several areas, one focused area, or a topic list', async () => {
  const names = async (b: Parameters<typeof gen.suggestSubjects>[0]) => (await gen.suggestSubjects(b)).map((s) => s.title);
  assert.deepEqual(await names({ classLevel: 6, title: 'Complete Learning Program', description: 'Learn Mathematics, Science, English and Hindi with practice activities and assessments.' }), [
    'Mathematics',
    'Science',
    'English',
    'Hindi',
  ]);
  assert.deepEqual(await names({ classLevel: 6, title: 'Science Explorer', description: 'Students learn about plants, animals, matter, energy, environment and scientific experiments.' }), [
    'Biology & Life Science',
    'Matter & Materials',
    'Energy',
    'Environment',
    'Scientific Thinking',
  ]);
  assert.deepEqual(await names({ classLevel: 3, title: 'Class 3', description: 'Improve basic numbers, addition, subtraction, multiplication, division and problem solving.' }), [
    'Mathematics',
    'Number Sense',
    'Arithmetic',
    'Problem Solving',
  ]);
  // Hindi keywords are understood too.
  assert.ok((await names({ classLevel: 4, title: 'Class 4', description: 'हिंदी व्याकरण, कहानी और कविता' }))[0] === 'Hindi');
});

test('with nothing to go on, sensible defaults by class — and the language is respected', async () => {
  const names = async (b: Parameters<typeof gen.suggestSubjects>[0]) => (await gen.suggestSubjects(b)).map((s) => s.title);
  assert.deepEqual(await names({ classLevel: 1, title: 'Class 1', description: 'Fun learning' }), ['Mathematics', 'English', 'Hindi', 'General Knowledge']);
  assert.deepEqual(await names({ classLevel: 4, title: 'Class 4' }), ['Mathematics', 'English', 'Hindi', 'Science', 'Social Studies']);
  assert.deepEqual(await names({ classLevel: 7, title: 'Class 7' }), ['Mathematics', 'Science', 'English', 'Hindi', 'Social Science']);
  assert.ok(!(await names({ classLevel: 7, title: 'Class 7', language: 'english' })).includes('Hindi'));
  assert.equal((await names({ classLevel: 7, title: 'Class 7', language: 'hindi' }))[0], 'Hindi');
  assert.ok((await names({ classLevel: 5, title: 'Class 5', curriculumType: 'mathematics' }))[0] === 'Mathematics');
  // The same brief always gives the same result.
  const brief = { classLevel: 6, title: 'Class 6', description: 'fractions and geometry' };
  assert.deepEqual(await gen.suggestSubjects(brief), await gen.suggestSubjects(brief));
});

test('chapters depend on the class: a Class 2 and a Class 8 maths course differ, each with lessons, practice and a quiz', async () => {
  const two = await gen.buildChapters({ classLevel: 2, title: 'Class 2' }, { key: 'math', title: 'Mathematics' });
  const eight = await gen.buildChapters({ classLevel: 8, title: 'Class 8', difficulty: 'advanced' }, { key: 'math', title: 'Mathematics' });
  assert.ok(two.some((c) => c.title === 'Counting and Numbers'));
  assert.ok(eight.some((c) => c.title === 'Algebra Basics'));
  assert.ok(!eight.some((c) => c.title === 'Counting and Numbers'));
  assert.ok(eight.length > two.length);
  for (const c of [...two, ...eight]) {
    assert.ok(c.lessons.length >= 3 && c.objectives.length >= 1 && c.quiz.length >= 5, c.title);
    assert.ok(c.activities.some((a) => a.type === 'multiple-choice') && c.activities.some((a) => a.type === 'match-pair'));
    for (const q of [...c.quiz, ...c.activities.flatMap((a) => a.questions)]) assert.ok(q.prompt && q.answer, c.title);
  }
  // Maths practice has real numbers to work out — and the answers are right.
  const add = two.find((c) => c.title === 'Addition');
  if (add) {
    for (const q of add.activities.find((a) => a.type === 'number-problems')!.questions) {
      const m = /^(\d+) \+ (\d+) = \?$/.exec(q.prompt);
      if (m) assert.equal(Number(q.answer), Number(m[1]) + Number(m[2]));
    }
  }
  // A focused subject stays focused, whatever its key: "Biology & Life Science" is not all of Science.
  const life = await gen.buildChapters({ classLevel: 6, title: 'Class 6' }, { key: 'biology-life-science', title: 'Biology & Life Science' });
  assert.ok(life.length > 0 && life.every((c) => ['Living and Non-living Things', 'Plants', 'Animals', 'The Human Body', 'Food and Nutrition', 'Cells and Organisms'].includes(c.title)), life.map((c) => c.title).join(', '));
  assert.ok((await gen.buildChapters({ classLevel: 6, title: 'Class 6' }, { key: 'science', title: 'Science' })).some((c) => c.title === 'Light and Shadows'));
  // A subject the library doesn't know still gets a usable outline.
  assert.ok((await gen.buildChapters({ classLevel: 5, title: 'Class 5' }, { key: 'art', title: 'Art' })).length >= 4);
});

test('an AI provider is optional: without one the template generator answers; a failing one falls back to it', async () => {
  const failing = new OptionalAICurriculumGenerator({
    name: 'broken',
    suggestSubjects: async () => {
      throw new Error('no service');
    },
  });
  const brief = { classLevel: 6, title: 'Science Explorer', description: 'plants, animals and energy' };
  assert.deepEqual(await failing.suggestSubjects(brief), await gen.suggestSubjects(brief));
  assert.equal((await call('POST', '/api/admin/curriculum/subjects', brief, admin)).data.generator, 'template');
});

// ------------------------------------------------------------------------------------ resources

test('free resources: references from Open Library and Wikimedia Commons; one source down breaks nothing', async () => {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://openlibrary.org/')) {
      return new Response(JSON.stringify({ docs: [{ key: '/works/OL1W', title: 'Plants for Young Readers', author_name: ['A. Author'], cover_i: 42, ebook_access: 'public' }] }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.startsWith('https://commons.wikimedia.org/')) {
      return new Response(
        JSON.stringify({
          query: {
            pages: {
              1: { title: 'File:Leaf.jpg', imageinfo: [{ descriptionurl: 'https://commons.wikimedia.org/wiki/File:Leaf.jpg', thumburl: 'https://upload.wikimedia.org/leaf.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a>Someone</a>' } } }] },
              2: { title: 'File:Unknown.jpg', imageinfo: [{ descriptionurl: 'https://commons.wikimedia.org/wiki/File:Unknown.jpg', extmetadata: {} }] },
            },
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }
    return realFetch(input, init);
  }) as typeof fetch;
  const ok = await findFreeResources('Plants', { classLevel: 6, topic: 'test-a' });
  assert.deepEqual(ok.unavailable, []);
  const book = ok.resources.find((r) => r.type === 'book')!;
  assert.equal(book.url, 'https://openlibrary.org/works/OL1W');
  assert.equal(book.thumbnailUrl, 'https://covers.openlibrary.org/b/id/42-M.jpg');
  const image = ok.resources.filter((r) => r.type === 'image');
  assert.equal(image.length, 1, 'files without a stated licence are left out');
  assert.equal(image[0]!.license, 'CC BY-SA 4.0');
  assert.equal(image[0]!.author, 'Someone');

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://openlibrary.org/')) throw new Error('offline');
    if (url.startsWith('https://commons.wikimedia.org/')) return new Response('nope', { status: 503 });
    return realFetch(input, init);
  }) as typeof fetch;
  const down = await call('GET', '/api/admin/curriculum/resources?subject=Plants&topic=test-b&classLevel=6', undefined, admin);
  assert.equal(down.status, 200);
  assert.deepEqual(down.data.resources, []);
  assert.deepEqual(down.data.unavailable.sort(), ['Open Library', 'Wikimedia Commons']);
  globalThis.fetch = realFetch;
});

// ------------------------------------------------------------------------------------ the admin flow

test('only administrators generate, save curricula, publish and duplicate', async () => {
  const brief = { classLevel: 6, title: 'Class 6' };
  for (const [method, path, body] of [
    ['POST', '/api/admin/curriculum/subjects', brief],
    ['POST', '/api/admin/curriculum/chapters', { brief, subjects: [{ key: 'math', title: 'Mathematics' }] }],
    ['GET', '/api/admin/curriculum/resources?subject=Plants'],
    ['GET', '/api/admin/classes/1/curriculum'],
    ['PUT', '/api/admin/classes/1/curriculum', { subjects: [] }],
    ['PATCH', '/api/admin/classes/1/status', { status: 'draft' }],
    ['POST', '/api/admin/classes/1/duplicate', {}],
  ] as const) {
    assert.equal((await call(method, path, body)).status, 401, `${method} ${path} signed out`);
    assert.equal((await call(method, path, body, user)).status, 403, `${method} ${path} as a user`);
  }
  assert.equal(await Course.countDocuments(), 0);
});

test('Science Explorer: draft → curriculum → publish → shown publicly with chapters, never answers; hide/show; regenerate replaces', async () => {
  const brief = { classLevel: 6, title: 'Science Explorer', subtitle: 'Future Ready', description: 'Students learn about plants, animals, matter, energy, environment and scientific experiments.' };
  const suggested = (await call('POST', '/api/admin/curriculum/subjects', brief, admin)).data.subjects as Array<{ key: string; title: string; description: string; difficulty: string; estimatedMinutes: number }>;
  assert.ok(suggested.length >= 4);
  // The administrator removes one subject and adds their own.
  // Maths is the shared subject Classes 1–5 use (its "Word Problems" chapter even has a key word "answer").
  const subjects = [...suggested.slice(0, 3), { key: 'math', title: 'Mathematics', description: 'Numbers for scientists', difficulty: 'medium', estimatedMinutes: 120 }, { key: 'astronomy-club', title: 'Astronomy Club', description: 'Stars and planets', difficulty: 'medium', estimatedMinutes: 60 }];

  const mathBefore = await ContentItem.findOne({ type: 'subject', key: 'math' }).lean();
  const created = await call(
    'POST',
    '/api/admin/classes',
    {
      classLevel: 6,
      title: brief.title,
      subtitle: brief.subtitle,
      description: brief.description,
      status: 'draft',
      subjectMode: 'class',
      profile: { learningGoal: 'Think like a scientist', targetAge: '11–12 years', language: 'english', curriculumType: 'science', difficulty: 'intermediate' },
      subjects: subjects.map((s) => ({ key: s.key, title: s.title, description: s.description, difficulty: s.difficulty, estimatedMinutes: s.estimatedMinutes })),
    },
    admin,
  );
  assert.equal(created.status, 201, created.message);
  assert.equal(created.data.status, 'draft');
  // A draft exists for nobody but administrators.
  assert.ok(!(await listed()).includes(6));
  assert.equal((await call('GET', '/api/content/classes/class-6/curriculum')).status, 404);
  // Publishing an empty class is refused, naming what is missing.
  const early = await call('PATCH', '/api/admin/classes/6/status', { status: 'published' }, admin);
  assert.equal(early.status, 400);
  assert.match(early.message!, /Add at least one chapter/);

  const built = (await call('POST', '/api/admin/curriculum/chapters', { brief, subjects: subjects.map((s) => ({ key: s.key, title: s.title })) }, admin)).data.subjects as Array<{ key: string; chapters: unknown[] }>;
  assert.ok(built.every((s) => s.chapters.length > 0));
  const save = await call(
    'PUT',
    '/api/admin/classes/6/curriculum',
    { subjects: built.map((s, i) => ({ ...s, resources: i === 0 ? [{ title: 'Plants for Young Readers', author: null, source: 'Open Library', url: 'https://openlibrary.org/works/OL1W', type: 'book', license: 'Catalogue record', thumbnailUrl: null }] : [] })) },
    admin,
  );
  assert.equal(save.status, 200, save.message);
  const chapterTotal = built.reduce((n, s) => n + s.chapters.length, 0);
  assert.equal(await Course.countDocuments({ classLevel: 6, generated: true }), chapterTotal);
  // The shared Mathematics subject was never touched by a class's own generation.
  assert.deepEqual(await ContentItem.findOne({ type: 'subject', key: 'math' }).lean(), mathBefore);

  const published = await call('PATCH', '/api/admin/classes/6/status', { status: 'published' }, admin);
  assert.equal(published.status, 200, published.message);
  assert.ok((await listed()).includes(6));
  const pub = await call('GET', '/api/content/classes/class-6/curriculum');
  assert.equal(pub.status, 200);
  assert.equal(pub.data.class.title, 'Science Explorer');
  assert.equal(pub.data.subjects.length, 5);
  assert.ok(pub.data.subjects[0].chapters.length > 0);
  assert.equal(pub.data.subjects[0].resources[0].url, 'https://openlibrary.org/works/OL1W');
  const raw = JSON.stringify(pub.data);
  // No answer fields anywhere (checked by key: the word can appear in the content itself).
  const keysOf = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(keysOf) : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...keysOf(x)]) : []);
  assert.ok(!keysOf(pub.data).includes('answer'), 'no answers in public data');
  assert.ok(!raw.includes('createdBy') && !raw.includes('updatedBy') && !raw.includes('"id"'), 'no admin fields in public data');

  // Hide / show.
  await call('PATCH', '/api/admin/classes/6/visibility', { isVisible: false }, admin);
  assert.ok(!(await listed()).includes(6));
  assert.equal((await call('GET', '/api/content/classes/class-6/curriculum')).status, 404);
  assert.equal((await call('GET', '/api/admin/classes', undefined, admin)).data.find((c: { classLevel: number }) => c.classLevel === 6).status, 'hidden');
  await call('PATCH', '/api/admin/classes/6/visibility', { isVisible: true }, admin);
  assert.ok((await listed()).includes(6));

  // Regenerating a subject replaces its generated chapters; a hand-written course stays.
  await Course.create({ title: 'Our Garden Project', slug: 'garden-project', classLevel: 6, subject: subjects[0]!.key, order: 99 });
  await call('PUT', '/api/admin/classes/6/curriculum', { subjects: [built[0]] }, admin);
  assert.equal(await Course.countDocuments({ classLevel: 6, subject: subjects[0]!.key, generated: true }), built[0]!.chapters.length);
  assert.ok(await Course.exists({ slug: 'garden-project' }));

  // The admin card counts chapters and lessons.
  const card = (await call('GET', '/api/admin/classes/6', undefined, admin)).data;
  assert.equal(card.counts.chapters, chapterTotal + 1);
  assert.ok(card.counts.lessons > 0);
  assert.equal(card.profile.curriculumType, 'science');
});

test('duplicate makes a draft under the next free number with everything copied; numbers stay unique', async () => {
  const dup = await call('POST', '/api/admin/classes/6/duplicate', {}, admin);
  assert.equal(dup.status, 201, dup.message);
  assert.equal(dup.data.classLevel, 7);
  assert.equal(dup.data.status, 'draft');
  assert.equal(dup.data.counts.subjects, 5);
  assert.equal(dup.data.counts.chapters, await Course.countDocuments({ classLevel: 6, archivedAt: null }));
  assert.ok(!(await listed()).includes(7), 'a duplicate is never published automatically');
  assert.equal((await call('POST', '/api/admin/classes/6/duplicate', { classLevel: 7 }, admin)).status, 409);
  assert.equal((await call('POST', '/api/admin/classes', { classLevel: 6, title: 'Again' }, admin)).status, 409);
});

test('invalid curriculum data is refused', async () => {
  const chapter = { title: 'X', lessons: [{ title: 'L', body: 'b' }] };
  const bad = [
    { subjects: [{ key: 'hindi', chapters: [chapter] }] }, // not offered in Class 6
    { subjects: [{ key: 'energy', chapters: [{ ...chapter, title: '' }] }] },
    { subjects: [{ key: 'energy', chapters: [chapter], resources: [{ title: 'r', source: 's', url: 'http://insecure.example' }] }] },
    { subjects: [{ key: 'energy', chapters: [chapter], resources: [{ title: 'r', source: 's', url: 'javascript:alert(1)' }] }] },
    { subjects: [{ key: 'energy', chapters: [chapter] }, { key: 'energy', chapters: [chapter] }] },
    { subjects: [{ key: 'energy', chapters: [{ ...chapter, activities: [{ type: 'essay', title: 't' }] }] }] },
  ];
  for (const body of bad) assert.equal((await call('PUT', '/api/admin/classes/6/curriculum', body, admin)).status, 400, JSON.stringify(body));
  assert.equal((await call('POST', '/api/admin/curriculum/subjects', { classLevel: 0, title: 'x' }, admin)).status, 400);
  assert.equal((await call('POST', '/api/admin/curriculum/subjects', { classLevel: 6, title: '' }, admin)).status, 400);
});
