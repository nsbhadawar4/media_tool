/**
 * Admin → Manual Courses: hand-written courses in their own collection, independent of the AI Course
 * Generator. Admins only; the class and subject checked on the server; drafts may be incomplete but
 * publishing may not; saves never silently overwrite; Delete → Trash → Restore / Permanent delete;
 * learners see only published, visible courses with their published chapters and lessons.
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
import { ManualCourse } from '../src/models/ManualCourse';
import { ActivityLog } from '../src/models/ActivityLog';

const PASSWORD = 'Strong-Passw0rd';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let admin: string;
let user: string;

async function signIn(email: string, role: 'user' | 'admin', name: string) {
  await User.create({ name, email, role, passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  return (res.headers.get('set-cookie') ?? '').match(/mt_session=[^;]+/)![0];
}

async function call(method: string, path: string, body?: unknown, cookie = admin) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return {
    status: res.status,
    data: json?.data,
    meta: json?.meta,
    message: json?.message as string | undefined,
    details: json?.error?.details as Array<{ path: string; message: string }> | undefined,
  };
}

let n = 0;
const id = (p: string) => `${p}${String(++n).padStart(6, '0')}`;
const question = (type: 'mcq' | 'true-false' | 'short-answer' = 'mcq') =>
  type === 'mcq'
    ? { uid: id('q'), type, prompt: 'Which letter is a vowel?', options: ['अ', 'क', 'ख', 'ग'], answer: 'अ', explanation: 'अ is a swar.' }
    : type === 'true-false'
      ? { uid: id('q'), type, prompt: 'क is a vowel.', options: [], answer: 'False', explanation: '' }
      : { uid: id('q'), type, prompt: 'Write the first swar.', options: [], answer: 'अ', explanation: '' };
const lesson = (title = 'Swar', questions = [question()]) => ({ uid: id('l'), title, description: 'Vowels', content: 'अ आ इ ई', status: 'published', questions });
const chapter = (title = 'Varnamala', lessons = [lesson()]) => ({ uid: id('c'), title, description: '', status: 'published', lessons });
const course = (over: Record<string, unknown> = {}) => ({
  classLevel: 1,
  subjectKey: 'hindi',
  title: 'Hindi Basics',
  description: 'Letters and words',
  isVisible: true,
  chapters: [chapter()],
  ...over,
});

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([ContentItem.init(), Course.init(), ManualCourse.init()]);
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = await signIn('root@example.com', 'admin', 'Root Admin');
  user = await signIn('kid@example.com', 'user', 'Kid');
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

test('admins only: signed out 401, a learner 403, on every manual-course route', async () => {
  for (const [method, path] of [
    ['GET', '/api/admin/manual-courses'],
    ['GET', '/api/admin/manual-courses/options'],
    ['GET', '/api/admin/manual-courses/trash'],
    ['POST', '/api/admin/manual-courses'],
  ] as const) {
    assert.equal((await call(method, path, method === 'POST' ? course() : undefined, '')).status, 401, path);
    assert.equal((await call(method, path, method === 'POST' ? course() : undefined, user)).status, 403, path);
  }
  assert.equal(await ManualCourse.countDocuments(), 0);
});

test('options: each class with its own subjects', async () => {
  const res = await call('GET', '/api/admin/manual-courses/options');
  assert.equal(res.status, 200, res.message);
  const c1 = (res.data.classes as Array<{ level: number; subjects: Array<{ key: string }> }>).find((c) => c.level === 1)!;
  assert.ok(c1.subjects.some((s) => s.key === 'hindi'));
});

test('create: Class, Subject and Title required, with field errors; the class must offer the subject', async () => {
  const missing = await call('POST', '/api/admin/manual-courses', { chapters: [] });
  assert.equal(missing.status, 400);
  const paths = missing.details!.map((d) => d.path);
  for (const p of ['classLevel', 'subjectKey', 'title']) assert.ok(paths.includes(p), p);

  const unknownClass = await call('POST', '/api/admin/manual-courses', course({ classLevel: 11 }));
  assert.equal(unknownClass.status, 400);
  assert.equal(unknownClass.details![0].path, 'classLevel');

  const notOffered = await call('POST', '/api/admin/manual-courses', course({ subjectKey: 'no-such-subject' }));
  assert.equal(notOffered.status, 400);
  assert.equal(notOffered.details![0].path, 'subjectKey');
  assert.equal(await ManualCourse.countDocuments(), 0);
});

test('a draft may be incomplete; it is saved as source "manual", nothing generated touched', async () => {
  const coursesBefore = await Course.countDocuments();
  const res = await call('POST', '/api/admin/manual-courses', course({ title: 'Draft only', chapters: [{ uid: id('c'), title: '', description: '', status: 'draft', lessons: [] }] }));
  assert.equal(res.status, 201, res.message);
  assert.equal(res.message, 'Course saved successfully.');
  assert.equal(res.data.source, 'manual');
  assert.equal(res.data.status, 'draft');
  assert.equal(res.data.classTitle, 'Class 1');
  assert.equal(res.data.subjectTitle, 'Hindi');
  assert.equal(await Course.countDocuments(), coursesBefore);
});

test('publishing needs a chapter with a lesson, titles and valid questions — with paths', async () => {
  const empty = await call('POST', '/api/admin/manual-courses', course({ title: 'Empty', status: 'published', chapters: [] }));
  assert.equal(empty.status, 400);
  assert.equal(empty.details![0].path, 'chapters');

  const bad = await call(
    'POST',
    '/api/admin/manual-courses',
    course({
      title: 'Bad',
      status: 'published',
      chapters: [
        chapter('', [
          lesson('', [
            { ...question(), options: ['अ', '', 'ख', 'ग'] },
            { ...question('true-false'), answer: 'Maybe' },
            { ...question('short-answer'), answer: '' },
          ]),
        ]),
      ],
    }),
  );
  assert.equal(bad.status, 400);
  const paths = bad.details!.map((d) => d.path);
  for (const p of [
    'chapters.0.title',
    'chapters.0.lessons.0.title',
    'chapters.0.lessons.0.questions.0.options',
    'chapters.0.lessons.0.questions.1.answer',
    'chapters.0.lessons.0.questions.2.answer',
  ]) {
    assert.ok(paths.includes(p), p);
  }

  const mcqWrong = await call('POST', '/api/admin/manual-courses', course({ status: 'published', chapters: [chapter('Ch', [lesson('L', [{ ...question(), answer: 'z' }])])] }));
  assert.equal(mcqWrong.details![0].path, 'chapters.0.lessons.0.questions.0.answer');
});

test('a part listed twice (same id) is refused', async () => {
  const c = chapter();
  const res = await call('POST', '/api/admin/manual-courses', course({ chapters: [c, c] }));
  assert.equal(res.status, 400);
  assert.ok(res.details!.some((d) => d.path === 'chapters.1.uid'));
});

test('full lifecycle: create → edit → publish → learners see it → unpublish → trash → restore → permanent delete', async () => {
  const created = await call(
    'POST',
    '/api/admin/manual-courses',
    course({ title: 'Hindi Varnamala', chapters: [chapter('Swar', [lesson('Swar 1'), { ...lesson('Hidden lesson'), status: 'draft' }]), { ...chapter('Draft chapter'), status: 'draft' }] }),
  );
  assert.equal(created.status, 201, created.message);
  const cid = created.data.id as string;
  assert.equal(created.data.slug, 'hindi-varnamala');
  assert.deepEqual(created.data.counts, { chapters: 2, lessons: 3, questions: 3 });

  // Edit: whole-course save with the revision it was based on.
  const edited = await call('PATCH', `/api/admin/manual-courses/${cid}`, { ...course({ title: 'Hindi Varnamala (edited)', chapters: created.data.chapters }), revision: created.data.revision });
  assert.equal(edited.status, 200, edited.message);
  assert.equal(edited.data.title, 'Hindi Varnamala (edited)');
  assert.equal(edited.data.slug, 'hindi-varnamala', 'the address stays the same');
  // An older revision is refused — no silent overwrite.
  const stale = await call('PATCH', `/api/admin/manual-courses/${cid}`, { ...course({ title: 'Stale' }), revision: created.data.revision });
  assert.equal(stale.status, 409);
  assert.equal((await ManualCourse.findById(cid))!.title, 'Hindi Varnamala (edited)');

  // Not public while a draft.
  const pubBase = '/api/content/classes/class-1/subjects/hindi/manual-courses';
  assert.equal((await call('GET', `${pubBase}/hindi-varnamala`, undefined, '')).status, 404);

  const published = await call('POST', `/api/admin/manual-courses/${cid}/publish`);
  assert.equal(published.status, 200, published.message);
  assert.equal(published.data.status, 'published');

  const list = await call('GET', pubBase, undefined, '');
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.data.map((c: { slug: string }) => c.slug),
    ['hindi-varnamala'],
  );
  const one = await call('GET', `${pubBase}/hindi-varnamala`, undefined, '');
  assert.equal(one.status, 200);
  assert.deepEqual(
    one.data.course.chapters.map((c: { title: string }) => c.title),
    ['Swar'],
    'draft chapters stay out',
  );
  assert.deepEqual(
    one.data.course.chapters[0].lessons.map((l: { title: string }) => l.title),
    ['Swar 1'],
    'draft lessons stay out',
  );
  assert.ok(!JSON.stringify(one.data).includes(cid), 'no internal id');
  assert.ok(!('uid' in one.data.course.chapters[0]));
  // Another class or subject never shows it.
  assert.equal((await call('GET', '/api/content/classes/class-2/subjects/hindi/manual-courses/hindi-varnamala', undefined, '')).status, 404);
  assert.equal((await call('GET', '/api/content/classes/class-1/subjects/english/manual-courses/hindi-varnamala', undefined, '')).status, 404);

  // Hidden → not public, still published.
  const latest = (await call('GET', `/api/admin/manual-courses/${cid}`)).data;
  const hidden = await call('PATCH', `/api/admin/manual-courses/${cid}`, { ...course({ title: latest.title, chapters: latest.chapters, isVisible: false }), revision: latest.revision });
  assert.equal(hidden.status, 200, hidden.message);
  assert.equal((await call('GET', `${pubBase}/hindi-varnamala`, undefined, '')).status, 404);
  // Visible again, at once, through the visibility switch.
  const shown = await call('PATCH', `/api/admin/manual-courses/${cid}/visibility`, { isVisible: true });
  assert.equal(shown.status, 200, shown.message);
  assert.equal((await call('GET', `${pubBase}/hindi-varnamala`, undefined, '')).status, 200);

  // Edits to a published course are a draft: learners keep the published copy until Publish.
  const edited2 = await call('PATCH', `/api/admin/manual-courses/${cid}`, { ...course({ title: 'Varnamala — new draft', chapters: [] }), revision: shown.data.revision });
  assert.equal(edited2.status, 200, 'an incomplete draft of a published course can be saved');
  assert.equal(edited2.data.status, 'published');
  assert.equal(edited2.data.pendingChanges, true);
  const stillLive = await call('GET', `${pubBase}/hindi-varnamala`, undefined, '');
  assert.equal(stillLive.data.course.title, 'Hindi Varnamala (edited)', 'learners still see the published copy');
  assert.equal(stillLive.data.course.chapters.length, 1);
  const listed = (await call('GET', '/api/admin/manual-courses?q=varnamala')).data.find((c: { id: string }) => c.id === cid);
  assert.equal(listed.pendingChanges, true);
  // Publishing the incomplete draft is refused; the live copy is untouched.
  assert.equal((await call('POST', `/api/admin/manual-courses/${cid}/publish`)).status, 400);
  // A complete draft, published: now learners see it.
  const fixed = await call('PATCH', `/api/admin/manual-courses/${cid}`, { ...course({ title: 'Varnamala — new draft', chapters: latest.chapters }), revision: edited2.data.revision });
  const republished = await call('POST', `/api/admin/manual-courses/${cid}/publish`);
  assert.equal(republished.status, 200, republished.message);
  assert.equal(republished.data.pendingChanges, false);
  assert.equal((await call('GET', `${pubBase}/hindi-varnamala`, undefined, '')).data.course.title, 'Varnamala — new draft');
  void fixed;
  // Hidden again for the filter checks below.
  await call('PATCH', `/api/admin/manual-courses/${cid}/visibility`, { isVisible: false });

  const unpublished = await call('POST', `/api/admin/manual-courses/${cid}/unpublish`);
  assert.equal(unpublished.data.status, 'draft');

  // Filters.
  const drafts = await call('GET', '/api/admin/manual-courses?status=draft&classLevel=1&subject=hindi&visibility=hidden&q=varnamala');
  assert.deepEqual(
    drafts.data.map((c: { id: string }) => c.id),
    [cid],
  );
  assert.deepEqual(drafts.data[0].counts, { chapters: 2, lessons: 3, questions: 3 });

  // Delete → Trash.
  const trashed = await call('DELETE', `/api/admin/manual-courses/${cid}`);
  assert.equal(trashed.status, 200, trashed.message);
  assert.ok(!(await call('GET', '/api/admin/manual-courses')).data.some((c: { id: string }) => c.id === cid));
  const trash = await call('GET', '/api/admin/manual-courses/trash?q=varnamala');
  assert.deepEqual(
    trash.data.map((c: { id: string }) => c.id),
    [cid],
  );
  assert.ok(trash.data[0].deletedAt);
  // Not editable while in Trash; permanent delete needs DELETE typed.
  assert.equal((await call('POST', `/api/admin/manual-courses/${cid}/publish`)).status, 404);
  assert.equal((await call('DELETE', `/api/admin/manual-courses/${cid}/permanent`, { confirm: 'yes' })).status, 400);

  const restored = await call('POST', `/api/admin/manual-courses/${cid}/restore`);
  assert.equal(restored.status, 200, restored.message);
  assert.equal(restored.data.title, 'Varnamala — new draft');
  assert.equal((await call('GET', '/api/admin/manual-courses/trash')).data.length, 0);
  // Only a course in Trash can be deleted for good.
  assert.equal((await call('DELETE', `/api/admin/manual-courses/${cid}/permanent`, { confirm: 'DELETE' })).status, 404);

  await call('DELETE', `/api/admin/manual-courses/${cid}`);
  const gone = await call('DELETE', `/api/admin/manual-courses/${cid}/permanent`, { confirm: 'DELETE' });
  assert.equal(gone.status, 200, gone.message);
  assert.equal(await ManualCourse.countDocuments({ _id: cid }), 0);

  const actions = (await ActivityLog.find({ targetId: cid }).lean()).map((a) => a.action);
  for (const a of [
    'manual_course_created',
    'manual_course_updated',
    'manual_course_published',
    'manual_course_unpublished',
    'manual_course_trashed',
    'manual_course_restored',
    'manual_course_permanently_deleted',
  ]) {
    assert.ok(actions.includes(a as never), a);
  }
});

test('isolation: manual-course operations never change generated courses or class ↔ subject links', async () => {
  await Course.create({ title: 'AI Swar', slug: `ai-swar-${Date.now()}`, classLevel: 1, subject: 'hindi', order: 1, description: '', lessons: [], quiz: [], source: { kind: 'ai' } });
  const before = JSON.stringify(await Promise.all([Course.find().sort({ _id: 1 }).lean(), ContentItem.find().sort({ _id: 1 }).lean()]));
  const c = await call('POST', '/api/admin/manual-courses', course({ title: 'Isolation check', status: 'published' }));
  const id = c.data.id as string;
  await call('PATCH', `/api/admin/manual-courses/${id}`, { ...course({ title: 'Isolation check 2' }), revision: c.data.revision });
  await call('POST', `/api/admin/manual-courses/${id}/publish`);
  await call('PATCH', `/api/admin/manual-courses/${id}/visibility`, { isVisible: false });
  await call('POST', `/api/admin/manual-courses/${id}/unpublish`);
  const dup = await call('POST', `/api/admin/manual-courses/${id}/duplicate`);
  for (const x of [id, dup.data.id as string]) {
    await call('DELETE', `/api/admin/manual-courses/${x}`);
    await call('POST', `/api/admin/manual-courses/${x}/restore`);
    await call('DELETE', `/api/admin/manual-courses/${x}`);
    assert.equal((await call('DELETE', `/api/admin/manual-courses/${x}/permanent`, { confirm: 'DELETE' })).status, 200);
  }
  const after = JSON.stringify(await Promise.all([Course.find().sort({ _id: 1 }).lean(), ContentItem.find().sort({ _id: 1 }).lean()]));
  assert.equal(after, before);
});

test('duplicate: a draft copy with every part given a new id, structure kept', async () => {
  const src = await call(
    'POST',
    '/api/admin/manual-courses',
    course({ title: 'English Words', subjectKey: 'english', classLevel: 2, chapters: [chapter('A', [lesson('A1', [question(), question('true-false')]), lesson('A2', [])]), chapter('B')] }),
  );
  assert.equal(src.status, 201, src.message);
  const dup = await call('POST', `/api/admin/manual-courses/${src.data.id}/duplicate`);
  assert.equal(dup.status, 201, dup.message);
  assert.equal(dup.data.title, 'Copy of English Words');
  assert.equal(dup.data.status, 'draft');
  assert.notEqual(dup.data.slug, src.data.slug);
  assert.deepEqual(dup.data.counts, src.data.counts);
  const uids = (c: { chapters: Array<{ uid: string; lessons: Array<{ uid: string; questions: Array<{ uid: string }> }> }> }) =>
    c.chapters.flatMap((ch) => [ch.uid, ...ch.lessons.flatMap((l) => [l.uid, ...l.questions.map((q) => q.uid)])]);
  const a = uids(src.data);
  const b = uids(dup.data);
  assert.equal(b.length, a.length);
  assert.ok(
    b.every((u) => !a.includes(u)),
    'no id reused',
  );
  assert.deepEqual(
    dup.data.chapters.map((c: { title: string; lessons: Array<{ title: string }> }) => [c.title, c.lessons.map((l) => l.title)]),
    [
      ['A', ['A1', 'A2']],
      ['B', ['Swar']],
    ],
  );
});

test('the highest class and Mathematics work like the rest; ids that are not ours are 404/400', async () => {
  const opts = (await call('GET', '/api/admin/manual-courses/options')).data.classes as Array<{ level: number; subjects: Array<{ key: string }> }>;
  const top = opts[opts.length - 1];
  const subject = top.subjects.find((s) => s.key === 'mathematics') ?? top.subjects[0];
  const res = await call('POST', '/api/admin/manual-courses', course({ classLevel: top.level, subjectKey: subject.key, title: 'Top class course', status: 'published' }));
  assert.equal(res.status, 201, res.message);
  assert.equal((await call('GET', '/api/admin/manual-courses/000000000000000000000000')).status, 404);
  assert.equal((await call('GET', '/api/admin/manual-courses/not-an-id')).status, 400);
});
