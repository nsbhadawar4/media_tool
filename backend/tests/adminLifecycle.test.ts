/**
 * Admin → Archive and Admin → Trash / Deleted: two separate states, and only the allowed moves —
 * ACTIVE → ARCHIVED / TRASHED, ARCHIVED → ACTIVE / TRASHED, TRASHED → ACTIVE / gone (typed DELETE).
 * Restores bring entries back as they were (never duplicated, never into a missing or removed
 * parent); Forever Delete takes what depends on the entry with it; every move is audited.
 */
import './setupTestEnv';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ContentItem } from '../src/models/ContentItem';
import { Course } from '../src/models/Course';
import { CourseProgress } from '../src/models/CourseProgress';
import { CourseGenerationJob } from '../src/models/CourseGenerationJob';
import { ActivityLog } from '../src/models/ActivityLog';

const PASSWORD = 'Strong-Passw0rd';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let admin: string;
let admin2: string;
let user: string;
let learnerId: mongoose.Types.ObjectId;
let admin2Id: string;

async function signIn(email: string, role: 'user' | 'admin', name: string) {
  const u = await User.create({ name, email, role, passwordHash: await bcrypt.hash(PASSWORD, 4) });
  if (role === 'user') learnerId = u._id;
  if (email === 'second@example.com') admin2Id = String(u._id);
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  return (res.headers.get('set-cookie') ?? '').match(/mt_session=[^;]+/)![0];
}

async function call(method: string, path: string, body?: unknown, cookie: string | undefined = admin) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, data: json?.data, message: json?.message as string | undefined };
}

interface Row {
  kind: string;
  id: string;
  title: string;
  state: string;
  parent: string | null;
  location: string;
  by: string | null;
  archivedBy: string | null;
  builtIn: boolean;
  contains: string[];
  restoreBlockedBy: Array<{ kind: string; title: string; reason: string }>;
  deleteBlock: string | null;
}
type List = { items: Row[]; total: number; pages: number; counts: Record<string, number>; deleters?: Array<{ id: string; name: string }> };
const archiveList = async (query = '') => (await call('GET', `/api/admin/archive${query}`)).data as List;
const trashList = async (query = '') => (await call('GET', `/api/admin/trash${query}`)).data as List;
const summary = async () => (await call('GET', '/api/admin/lifecycle/summary')).data as { archive: Record<string, number>; trash: Record<string, number> };
type Ref = { kind: string; id: string };
const archive = (ref: Ref, cookie = admin) => call('POST', '/api/admin/archive', ref, cookie);
const del = (ref: Ref, cookie = admin) => call('POST', '/api/admin/trash', ref, cookie);
const restoreArchived = (items: Ref[], withParents = false) => call('POST', '/api/admin/archive/restore', { items, withParents });
const toTrash = (items: Ref[]) => call('POST', '/api/admin/archive/trash', { items });
const restoreTrashed = (items: Ref[], withParents = false) => call('POST', '/api/admin/trash/restore', { items, withParents });
const forever = (items: Ref[]) => call('POST', '/api/admin/trash/delete', { items, confirm: 'DELETE' });
const activeLevels = async () => ((await call('GET', '/api/admin/classes')).data as Array<{ classLevel: number }>).map((c) => c.classLevel);
const classRef = async (level: number): Promise<Ref> => ({ kind: 'class', id: String((await ContentItem.findOne({ type: 'class', classLevel: level }).lean())!._id) });
const codes = (r: { data: { results: Array<{ code: string }> } }) => r.data.results.map((x) => x.code);

let seq = 0;
async function chapter(classLevel: number, subject: string, title = `Chapter ${++seq}`) {
  return Course.create({ title, slug: `c${classLevel}-${subject}-${++seq}-${Date.now()}`, classLevel, subject, order: 1000 + seq, description: '', lessons: [], quiz: [] });
}

/** An admin-made class with Hindi, two chapters, a learner's progress and a generation job. */
async function classWithContent(level: number, image?: string) {
  const res = await call('POST', '/api/admin/classes', { classLevel: level, title: `Class ${level}`, status: 'draft', ...(image ? { image } : {}), subjects: [{ key: 'hindi', title: 'Hindi' }] });
  assert.equal(res.status, 201, res.message);
  const a = await chapter(level, 'hindi', `Swar ${level}`);
  await chapter(level, 'hindi', `Vyanjan ${level}`);
  await CourseProgress.create({ userId: learnerId, chapterId: a._id, classLevel: level, subject: 'hindi', lessons: [] });
  await CourseGenerationJob.create({ classLevel: level, subjectKey: 'hindi', brief: { classLevel: level }, engine: 'template' });
  return classRef(level);
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([ContentItem.init(), Course.init()]);
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = await signIn('root@example.com', 'admin', 'Root Admin');
  admin2 = await signIn('second@example.com', 'admin', 'Second Admin');
  user = await signIn('kid@example.com', 'user', 'Kid');
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

test('empty: Archive and Trash list nothing and count 0', async () => {
  await activeLevels(); // seeds the catalog
  const [a, t, s] = await Promise.all([archiveList(), trashList(), summary()]);
  assert.deepEqual([a.total, t.total, s.archive.all, s.trash.all], [0, 0, 0, 0]);
});

test('FLOW 1 — archive Class 7: gone from Manage Courses, in Archive (not Trash), Archive count +1; restore: back, count −1, one record', async () => {
  const ref = await classWithContent(7);
  const res = await archive(ref);
  assert.equal(res.status, 200, res.message);
  assert.ok(!(await activeLevels()).includes(7));
  const a = await archiveList();
  const row = a.items.find((i) => i.id === ref.id)!;
  assert.deepEqual([row.title, row.state, row.location, row.by, row.builtIn], ['Class 7', 'archived', 'Manage Courses', 'Root Admin', false]);
  assert.deepEqual(row.contains, ['1 subject', '2 chapters']);
  assert.equal((await trashList()).total, 0, 'archived is never in Trash');
  assert.deepEqual([(await summary()).archive.all, (await summary()).trash.all], [1, 0]);
  // Manage Courses' own Archived filter shows it; its data is all still there.
  assert.ok(((await call('GET', '/api/admin/classes?status=archived')).data as Array<{ classLevel: number }>).some((c) => c.classLevel === 7));
  assert.equal(await Course.countDocuments({ classLevel: 7 }), 2);

  const back = await restoreArchived([ref]);
  assert.deepEqual([back.data.done, back.data.results[0].message], [1, 'Item restored successfully.']);
  assert.ok((await activeLevels()).includes(7));
  assert.equal((await summary()).archive.all, 0);
  assert.equal(await ContentItem.countDocuments({ type: 'class', classLevel: 7 }), 1, 'no duplicate');
  const stored = await ContentItem.findById(ref.id).lean();
  assert.deepEqual([stored!.archivedAt, stored!.trashedAt, stored!.status], [null, null, 'draft'], 'as it was');
});

test('FLOW 2 + 3 — delete Class 7: gone from Manage Courses, in Trash (not Archive), Trash count +1; restore from Trash: back, count −1', async () => {
  const ref = await classRef(7);
  const res = await del(ref);
  assert.equal(res.status, 200, res.message);
  assert.ok(!(await activeLevels()).includes(7));
  const row = (await trashList()).items.find((i) => i.id === ref.id)!;
  assert.deepEqual([row.state, row.by, row.archivedBy], ['trashed', 'Root Admin', null], 'deleted straight from active: never archived');
  assert.equal((await archiveList()).total, 0, 'in Trash, not in Archive');
  assert.ok(!((await call('GET', '/api/admin/classes?status=archived')).data as Array<{ classLevel: number }>).some((c) => c.classLevel === 7), 'nor in Manage Courses → Archived');
  assert.deepEqual([(await summary()).archive.all, (await summary()).trash.all], [0, 1]);
  // Its number is still taken, and the message says where it is.
  const again = await call('POST', '/api/admin/classes', { classLevel: 7, title: 'Class 7 again', subjects: [] });
  assert.equal(again.status, 409);
  assert.match(again.message!, /Class 7 is in Trash — restore it from Trash \/ Deleted/);

  const back = await restoreTrashed([ref]);
  assert.deepEqual([back.data.done, back.data.results[0].code], [1, 'RESTORED']);
  assert.ok((await activeLevels()).includes(7));
  assert.equal((await summary()).trash.all, 0);
  assert.equal(await ContentItem.countDocuments({ type: 'class', classLevel: 7 }), 1);
});

test('FLOW 4 — archive, then Move to Trash: Archive −1, Trash +1, and it remembers it was archived', async () => {
  const ref = await classRef(7);
  await archive(ref);
  assert.deepEqual([(await summary()).archive.all, (await summary()).trash.all], [1, 0]);
  const moved = await toTrash([ref]);
  assert.deepEqual([moved.data.done, moved.data.results[0].code], [1, 'TRASHED']);
  assert.deepEqual([(await summary()).archive.all, (await summary()).trash.all], [0, 1]);
  assert.equal((await archiveList()).total, 0, 'gone from Archive');
  const row = (await trashList()).items.find((i) => i.id === ref.id)!;
  assert.equal(row.archivedBy, 'Root Admin', 'archived first, then deleted');
});

test('only allowed moves: active ↛ forever, archived ↛ forever, no double archive / delete / restore', async () => {
  const ref = await classRef(7); // in Trash
  assert.deepEqual(codes(await restoreArchived([ref])), ['WRONG_STATE'], 'not from Archive');
  assert.match((await restoreArchived([ref])).data.results[0].message, /is in Trash — restore it from Trash/);
  assert.equal((await archive(ref)).status, 409, 'already in Trash');
  assert.equal((await del(ref)).status, 409, 'already in Trash');
  assert.deepEqual(codes(await toTrash([ref])), ['WRONG_STATE']);
  // Active and archived entries can never be deleted for good.
  const five = await classRef(5);
  assert.deepEqual(codes(await forever([five])), ['WRONG_STATE']);
  assert.match((await forever([five])).data.results[0].message, /is active — move it to Trash first/);
  await archive(five);
  assert.deepEqual(codes(await forever([five])), ['WRONG_STATE']);
  assert.match((await forever([five])).data.results[0].message, /is in Archive — move it to Trash first/);
  assert.ok(await ContentItem.exists({ _id: five.id }));
  assert.deepEqual(codes(await restoreTrashed([five])), ['WRONG_STATE'], 'not from Trash');
  assert.equal((await archive(five)).status, 409, 'no double archive');
  assert.deepEqual(codes(await restoreArchived([five])), ['RESTORED']);
  assert.deepEqual(codes(await restoreArchived([five])), ['WRONG_STATE'], 'no double restore');
  // Forever Delete needs DELETE typed.
  for (const confirm of [undefined, 'delete', 'DELETE ', 'yes']) {
    const res = await call('POST', '/api/admin/trash/delete', { items: [ref], ...(confirm !== undefined ? { confirm } : {}) });
    assert.equal(res.status, 400, `confirm=${JSON.stringify(confirm)}`);
  }
});

test('FLOW 5 — Forever Delete from Trash: gone with everything that depends on it, Trash −1, and it can not be restored', async () => {
  const ref = await classRef(7);
  const res = await forever([ref]);
  assert.deepEqual([res.data.done, res.data.results[0].message], [1, 'Item permanently deleted.']);
  assert.deepEqual(res.data.results[0].removed, { progress: 1, chapters: 2, courses: 1, generationJobs: 1 });
  assert.equal(await ContentItem.exists({ _id: ref.id }), null);
  assert.equal(await Course.countDocuments({ classLevel: 7 }), 0, 'no orphaned chapters');
  assert.equal(await CourseProgress.countDocuments({ classLevel: 7 }), 0, 'no orphaned progress');
  assert.equal(await ContentItem.countDocuments({ classLevel: 7 }), 0, 'no orphaned subject links');
  assert.equal(await CourseGenerationJob.countDocuments({ classLevel: 7 }), 0);
  assert.equal((await summary()).trash.all, 0);
  assert.deepEqual(codes(await restoreTrashed([ref])), ['NOT_FOUND']);
  assert.deepEqual(codes(await forever([ref])), ['NOT_FOUND'], 'not twice');
});

test('administrators only: 401 signed out, 403 for a user — on every Archive / Trash endpoint', async () => {
  const ref = await classWithContent(8);
  const attempts: Array<[string, string, unknown?]> = [
    ['GET', '/api/admin/lifecycle/summary'],
    ['GET', '/api/admin/archive'],
    ['GET', '/api/admin/trash'],
    ['POST', '/api/admin/archive', ref],
    ['POST', '/api/admin/trash', ref],
    ['POST', '/api/admin/archive/restore', { items: [ref] }],
    ['POST', '/api/admin/archive/trash', { items: [ref] }],
    ['POST', '/api/admin/trash/restore', { items: [ref] }],
    ['POST', '/api/admin/trash/delete', { items: [ref], confirm: 'DELETE' }],
  ];
  for (const [method, path, body] of attempts) {
    assert.equal((await call(method, path, body, '')).status, 401, `${method} ${path} signed out`);
    assert.equal((await call(method, path, body, user)).status, 403, `${method} ${path} as a user`);
  }
  const stored = await ContentItem.findById(ref.id).lean();
  assert.deepEqual([stored!.archivedAt, stored!.trashedAt], [null, null], 'nothing changed');
});

test('requests are validated: kinds, ids, duplicates, an id passed off as another kind', async () => {
  const ref = await classRef(8);
  assert.equal((await call('POST', '/api/admin/archive', { kind: 'user', id: ref.id })).status, 400);
  assert.equal((await call('POST', '/api/admin/trash', { kind: 'class', id: '../x' })).status, 400);
  assert.equal((await call('POST', '/api/admin/archive/restore', { items: [] })).status, 400);
  assert.equal((await call('POST', '/api/admin/trash/restore', { items: [ref, ref] })).status, 400);
  assert.equal((await call('GET', '/api/admin/trash?type=users')).status, 400);
  assert.equal((await call('POST', '/api/admin/trash', { kind: 'chapter', id: ref.id })).status, 404, 'a class id is not a chapter');
  assert.equal((await ContentItem.findById(ref.id).lean())!.trashedAt, null);
});

test('parent safety: a chapter of a class in Trash asks for the parent first; with parents, both come back', async () => {
  const cls = await classRef(8);
  const [first] = await Course.find({ classLevel: 8 }).sort({ order: 1 });
  const ch = { kind: 'chapter', id: String(first!._id) };
  await archive(ch);
  await del(cls);
  const row = (await archiveList('?type=chapter')).items.find((i) => i.id === ch.id)!;
  assert.deepEqual([row.parent, row.location], ['Class 8 · Hindi', 'Manage Courses → Class 8 → Hindi']);
  assert.deepEqual(
    row.restoreBlockedBy.map((b) => [b.kind, b.reason]),
    [['class', 'trashed']],
  );
  const blocked = await restoreArchived([ch]);
  assert.equal(blocked.data.results[0].code, 'PARENT_ARCHIVED');
  assert.match(blocked.data.results[0].message, /Parent content is currently in Trash.*Restore the parent first\?/);
  assert.ok((await Course.findById(ch.id).lean())!.archivedAt, 'nothing restored into a deleted class');
  assert.deepEqual(codes(await restoreArchived([ch], true)), ['RESTORED']);
  assert.equal((await ContentItem.findById(cls.id).lean())!.archivedAt, null, 'the class came back from Trash first');
});

test('bulk: archive several, restore some, move the rest to Trash, forever delete them (each reported)', async () => {
  const extra = await chapter(8, 'hindi', 'Matra 8');
  const refs = [...(await Course.find({ classLevel: 8 }).sort({ order: 1 })), extra].map((c) => ({ kind: 'chapter', id: String(c._id) }));
  const unique = [...new Map(refs.map((r) => [r.id, r])).values()];
  for (const ref of unique) assert.equal((await archive(ref)).status, 200);
  assert.equal((await archiveList('?type=chapter')).total, unique.length);
  assert.deepEqual((await restoreArchived(unique.slice(0, 1))).data.done, 1);
  const moved = await toTrash(unique);
  assert.deepEqual([moved.data.done, moved.data.failed], [unique.length - 1, 1], 'the restored one is refused');
  assert.equal((await trashList('?type=chapter')).total, unique.length - 1);
  const gone = await forever(unique);
  assert.deepEqual(codes(gone), ['WRONG_STATE', ...Array(unique.length - 1).fill('DELETED')], 'the active one is refused');
  assert.equal(await Course.countDocuments({ classLevel: 8 }), 1);
});

test('search, type, date, deleted-by, sort and paging', async () => {
  const science = await ContentItem.create({ type: 'subject', key: 'science', title: 'Science', order: 99, source: 'admin' });
  const sci = { kind: 'subject', id: String(science._id) };
  const eight = await classRef(8);
  await del(sci);
  await del(eight, admin2);
  const t = await trashList();
  assert.deepEqual(
    t.items.map((i) => i.title),
    ['Class 8', 'Science'],
    'most recently deleted first',
  );
  assert.deepEqual(
    (await trashList('?sort=oldest')).items.map((i) => i.title),
    ['Science', 'Class 8'],
  );
  assert.deepEqual(
    (await trashList('?sort=name_desc')).items.map((i) => i.title),
    ['Science', 'Class 8'],
  );
  assert.deepEqual(
    (await trashList('?type=subject')).items.map((i) => i.title),
    ['Science'],
  );
  assert.deepEqual(
    (await trashList('?q=scien')).items.map((i) => i.title),
    ['Science'],
  );
  assert.deepEqual(
    (await trashList(`?q=${sci.id}`)).items.map((i) => i.title),
    ['Science'],
    'by id',
  );
  assert.deepEqual(
    (await trashList(`?by=${admin2Id}`)).items.map((i) => i.title),
    ['Class 8'],
    'deleted by',
  );
  assert.deepEqual(t.deleters!.map((d) => d.name).sort(), ['Root Admin', 'Second Admin']);
  assert.equal((await trashList(`?from=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`)).total, 0);
  const paged = await trashList('?limit=1&page=2');
  assert.deepEqual([paged.items.length, paged.total, paged.pages, paged.items[0]!.title], [1, 2, 2, 'Science']);
  // Archive has its own list (and Content's "Archived" filter and counts leave Trash out).
  assert.equal((await archiveList('?q=science')).total, 0);
  const stats = (await call('GET', '/api/admin/content/stats')).data;
  assert.equal(stats.subject.archived, 0, 'a subject in Trash is not counted as archived');
  await restoreTrashed([eight, sci]);
});

test('Forever Delete is refused for a subject still offered by an active class, and for built-in entries', async () => {
  const science = await ContentItem.findOne({ type: 'subject', key: 'science' });
  await ContentItem.create({ type: 'class_subject', key: 'class-8-science', title: 'Class 8 · Science', classLevel: 8, subject: 'science', order: 9, source: 'admin' });
  await del({ kind: 'subject', id: String(science!._id) });
  const inUse = await forever([{ kind: 'subject', id: String(science!._id) }]);
  assert.equal(inUse.data.results[0].code, 'IN_USE');
  assert.match(inUse.data.results[0].message, /Still offered by Class 8/);
  const five = await classRef(5);
  await del(five);
  const row = (await trashList('?type=class')).items.find((i) => i.id === five.id)!;
  assert.equal(row.builtIn, true);
  assert.match(row.deleteBlock!, /Built into the app/);
  assert.deepEqual(codes(await forever([five])), ['BUILT_IN']);
  assert.deepEqual(codes(await restoreTrashed([five])), ['RESTORED']);
});

test('Forever Delete of a class also removes its uploaded picture from storage (archiving and Trash keep it)', async () => {
  const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#10b981' } })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'c9.png');
  const up = await fetch(`${baseUrl}/api/admin/classes/images`, { method: 'POST', body: form, headers: { cookie: admin } });
  const url = ((await up.json()) as { data: { url: string } }).data.url;
  const ref = await classWithContent(9, url);
  await archive(ref);
  await toTrash([ref]);
  assert.equal((await fetch(`${baseUrl}${url}`)).status, 200);
  assert.equal((await forever([ref])).data.done, 1);
  assert.equal((await fetch(`${baseUrl}${url}`)).status, 404);
});

test('audit: archived, moved to Trash, restored from Archive / Trash, permanently deleted — with the states', async () => {
  const logs = await ActivityLog.find({ targetName: 'Class 7' }).sort({ createdAt: 1 }).lean();
  const seen = logs.map((l) => [l.action, l.metadata?.previousStatus, l.metadata?.newStatus]);
  for (const step of [
    ['content_archived', 'active', 'archived'],
    ['content_restored', 'archived', 'active'],
    ['content_trashed', 'active', 'trashed'],
    ['content_restored', 'trashed', 'active'],
    ['content_trashed', 'archived', 'trashed'],
    ['content_permanently_deleted', 'trashed', 'deleted'],
  ])
    assert.ok(
      seen.some((s) => JSON.stringify(s) === JSON.stringify(step)),
      `logged: ${step.join(' ')}`,
    );
  assert.ok(logs.some((l) => /Restored from Trash/.test(l.message)) && logs.some((l) => /Restored from Archive/.test(l.message)));
  assert.ok(
    logs.every((l) => String(l.performedBy).length === 24),
    'who did it',
  );
  assert.ok(!JSON.stringify(logs).includes('passwordHash'));
});
