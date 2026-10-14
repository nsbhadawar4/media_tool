/**
 * Manage Courses: classes with their subjects, managed by administrators and read by the home page,
 * the user dashboard and the class pages through the one public catalog. Everything is stored on
 * the existing catalog entries (class, subject, class_subject) — Classes 1–5 included.
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
import { ActivityLog } from '../src/models/ActivityLog';

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
  return { status: res.status, data: json?.data, message: json?.message as string | undefined, errors: json?.errors };
}

interface CatalogClass { key: string; title: string; subtitle: string; description: string; details: string; classLevel: number; isEnabled: boolean; isVisible: boolean; order: number; thumbnailUrl: string | null }
interface Catalog { classes: CatalogClass[]; classSubjects: { classLevel: number; subject: string; isEnabled: boolean; isVisible: boolean; order: number }[]; subjects: { key: string; title: string }[] }
const catalog = async () => (await call('GET', '/api/content/catalog')).data as Catalog;
/** What the home page and the dashboard list: enabled, visible classes in order (lib/content/catalog.ts). */
const listedLevels = async () =>
  (await catalog()).classes.filter((c) => c.isEnabled && c.isVisible).sort((a, b) => a.order - b.order).map((c) => c.classLevel);

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

test('Classes 1–5 are there from the start, for visitors and for administrators', async () => {
  assert.deepEqual(await listedLevels(), [1, 2, 3, 4, 5]);
  const res = await call('GET', '/api/admin/classes', undefined, admin);
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.map((c: { classLevel: number }) => c.classLevel), [1, 2, 3, 4, 5]);
  const one = res.data[0];
  assert.equal(one.slug, 'class-1');
  assert.equal(one.builtIn, true);
  assert.equal(one.status, 'visible');
  assert.equal(one.position, 1);
  assert.deepEqual(one.subjects.map((s: { key: string }) => s.key), ['hindi', 'english', 'math']);
  assert.ok(one.counts.games > 0, 'its learning games are counted');
});

test('only administrators manage classes: 401 signed out, 403 for a normal user, nothing changes', async () => {
  const before = await ContentItem.findOne({ type: 'class', classLevel: 2 }).lean();
  const attempts: [string, string, unknown?][] = [
    ['GET', '/api/admin/classes'],
    ['GET', '/api/admin/classes/2'],
    ['POST', '/api/admin/classes', { classLevel: 9, title: 'Class 9' }],
    ['PATCH', '/api/admin/classes/2', { title: 'Hacked' }],
    ['PATCH', '/api/admin/classes/2/visibility', { isVisible: false }],
    ['PATCH', '/api/admin/classes/2/order', { position: 5 }],
    ['DELETE', '/api/admin/classes/2'],
  ];
  for (const [method, path, body] of attempts) {
    assert.equal((await call(method, path, body)).status, 401, `${method} ${path} signed out`);
    assert.equal((await call(method, path, body, user)).status, 403, `${method} ${path} as a user`);
  }
  // A role claimed in the body counts for nothing.
  assert.equal((await call('POST', '/api/admin/classes', { classLevel: 9, title: 'Class 9', role: 'admin' }, user)).status, 403);
  assert.equal(await ContentItem.countDocuments({ type: 'class', classLevel: 9 }), 0);
  assert.deepEqual(await ContentItem.findOne({ type: 'class', classLevel: 2 }).lean(), before);
});

test('an administrator edits a class: the change is stored and every page reads it', async () => {
  const res = await call('PATCH', '/api/admin/classes/1', { title: 'Class 1 — Little Learners', subtitle: 'Fun Foundations', description: 'Letters, sounds and numbers.', details: 'A gentle start with the alphabet and counting.' }, admin);
  assert.equal(res.status, 200);
  assert.equal(res.data.title, 'Class 1 — Little Learners');
  // Persisted: read back fresh, and through the public catalog the site renders from.
  const stored = await ContentItem.findOne({ type: 'class', classLevel: 1 }).lean();
  assert.equal(stored!.subtitle, 'Fun Foundations');
  const pub = (await catalog()).classes.find((c) => c.classLevel === 1)!;
  assert.equal(pub.title, 'Class 1 — Little Learners');
  assert.equal(pub.subtitle, 'Fun Foundations');
  assert.equal(pub.details, 'A gentle start with the alphabet and counting.');
  assert.equal((await ActivityLog.findOne({ action: 'content_updated', targetName: 'Class 1 — Little Learners' }).lean())?.metadata?.type, 'class');
});

test('hide and show: a hidden class leaves the home page and dashboard lists, and stays with the administrator', async () => {
  const hidden = await call('PATCH', '/api/admin/classes/2/visibility', { isVisible: false }, admin);
  assert.equal(hidden.status, 200);
  assert.equal(hidden.data.status, 'hidden');
  assert.deepEqual(await listedLevels(), [1, 3, 4, 5]);
  const adminList = (await call('GET', '/api/admin/classes', undefined, admin)).data as { classLevel: number; status: string }[];
  assert.equal(adminList.find((c) => c.classLevel === 2)!.status, 'hidden');
  assert.ok(await ActivityLog.exists({ action: 'content_hidden', targetName: 'Class 2' }));

  const shown = await call('PATCH', '/api/admin/classes/2/visibility', { isVisible: true }, admin);
  assert.equal(shown.data.status, 'visible');
  assert.deepEqual(await listedLevels(), [1, 2, 3, 4, 5]);
  assert.ok(await ActivityLog.exists({ action: 'content_shown', targetName: 'Class 2' }));
});

test('an administrator adds Class 6 with subjects (existing and new) and a picture; it shows everywhere', async () => {
  // Upload: re-encoded to WebP and served publicly by its random name.
  const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#10b981' } }).png().toBuffer();
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'class6.png');
  const denied = await fetch(`${baseUrl}/api/admin/classes/images`, { method: 'POST', body: form, headers: { cookie: user } });
  assert.equal(denied.status, 403);
  const up = await fetch(`${baseUrl}/api/admin/classes/images`, { method: 'POST', body: form, headers: { cookie: admin } });
  assert.equal(up.status, 201);
  const url = ((await up.json()) as { data: { url: string } }).data.url;
  assert.match(url, /^\/api\/content\/images\/[a-f0-9]{32}\.webp$/);
  const img = await fetch(`${baseUrl}${url}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/webp');
  assert.equal((await sharp(Buffer.from(await img.arrayBuffer())).metadata()).width, 1200);

  const res = await call(
    'POST',
    '/api/admin/classes',
    {
      classLevel: 6,
      title: 'Class 6',
      subtitle: 'Think Big',
      description: 'Science, maths and more.',
      image: url,
      subjects: [
        { key: 'math', title: 'Mathematics', description: '' },
        { title: 'Science', description: 'Plants, animals and the world around us', glyph: '🔬' },
      ],
    },
    admin,
  );
  assert.equal(res.status, 201, res.message);
  assert.equal(res.data.position, 6);
  assert.deepEqual(res.data.subjects.map((s: { key: string }) => s.key), ['math', 'science']);

  const cat = await catalog();
  const six = cat.classes.find((c) => c.classLevel === 6)!;
  assert.equal(six.key, 'class-6');
  assert.equal(six.thumbnailUrl, url);
  assert.deepEqual(await listedLevels(), [1, 2, 3, 4, 5, 6]);
  assert.ok(cat.subjects.some((s) => s.key === 'science' && s.title === 'Science'));
  assert.deepEqual(
    cat.classSubjects.filter((l) => l.classLevel === 6).sort((a, b) => a.order - b.order).map((l) => l.subject),
    ['math', 'science'],
  );
});

test('subjects in a class: reorder, hide one, remove one, add one back — the links are kept, never lost', async () => {
  const res = await call(
    'PATCH',
    '/api/admin/classes/6',
    { subjects: [{ title: 'Science', key: 'science', description: 'Plants, animals and the world around us', isVisible: false }, { key: 'english', title: 'English', description: '' }] },
    admin,
  );
  assert.equal(res.status, 200, res.message);
  assert.deepEqual(res.data.subjects.map((s: { key: string; isVisible: boolean }) => [s.key, s.isVisible]), [['science', false], ['english', true]]);
  // Maths was removed from Class 6 only: its link is archived (restorable), Class 1 keeps Maths.
  const mathLink = await ContentItem.findOne({ type: 'class_subject', classLevel: 6, subject: 'math' }).lean();
  assert.ok(mathLink?.archivedAt);
  assert.ok(await ContentItem.exists({ type: 'class_subject', classLevel: 1, subject: 'math', archivedAt: null }));
  // Added back: the same link returns.
  const back = await call('PATCH', '/api/admin/classes/6', { subjects: [{ key: 'math', title: 'Mathematics', description: '' }] }, admin);
  assert.equal(back.status, 200);
  assert.equal((await ContentItem.findOne({ type: 'class_subject', classLevel: 6, subject: 'math' }).lean())!.archivedAt, null);
  assert.equal(await ContentItem.countDocuments({ type: 'class_subject', classLevel: 6, subject: 'math' }), 1);
});

test('invalid class data is refused, and class numbers stay unique', async () => {
  const bad = [
    { classLevel: 0, title: 'Class 0' },
    { classLevel: 13, title: 'Class 13' },
    { classLevel: 2.5, title: 'Half' },
    { classLevel: 7, title: '' },
    { classLevel: 7, title: 'Class 7', image: 'javascript:alert(1)' },
    { classLevel: 7, title: 'Class 7', image: '/api/content/images/../../etc/passwd' },
    { classLevel: 7, title: 'Class 7', subjects: [{ title: '' }] },
    { classLevel: 7, title: 'Class 7', subjects: [{ title: 'Art' }, { title: 'art' }] },
    { classLevel: 7, title: 'Class 7', subtitle: 'x'.repeat(61) },
    { classLevel: 7, title: 'Class 7', archivedAt: null },
  ];
  for (const body of bad) assert.equal((await call('POST', '/api/admin/classes', body, admin)).status, 400, JSON.stringify(body));
  assert.equal(await ContentItem.countDocuments({ type: 'class', classLevel: 7 }), 0);

  const dup = await call('POST', '/api/admin/classes', { classLevel: 3, title: 'Another Class 3' }, admin);
  assert.equal(dup.status, 409);
  assert.equal(await ContentItem.countDocuments({ type: 'class', classLevel: 3 }), 1);
  // The number can't be changed by an edit either.
  assert.equal((await call('PATCH', '/api/admin/classes/3', { classLevel: 8 }, admin)).status, 400);
  // Uploaded image names are checked before any storage is touched.
  assert.equal((await fetch(`${baseUrl}/api/content/images/..%2F..%2Fsecret.webp`)).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/content/images/${'a'.repeat(32)}.webp`)).status, 404);
});

test('display order: moving a class renumbers the rest, and the site lists them in that order', async () => {
  const res = await call('PATCH', '/api/admin/classes/6/order', { position: 1 }, admin);
  assert.equal(res.status, 200);
  assert.equal(res.data.position, 1);
  assert.deepEqual(await listedLevels(), [6, 1, 2, 3, 4, 5]);
  await call('PATCH', '/api/admin/classes/6', { position: 6 }, admin);
  assert.deepEqual(await listedLevels(), [1, 2, 3, 4, 5, 6]);
});

test('archive is a soft delete: the class leaves every page, its data stays, and it can be restored', async () => {
  const gamesBefore = await ContentItem.countDocuments({ type: 'kid_game', classLevel: 6 });
  const res = await call('DELETE', '/api/admin/classes/6', undefined, admin);
  assert.equal(res.status, 200);
  assert.equal(res.data.status, 'archived');
  assert.ok(!(await catalog()).classes.some((c) => c.classLevel === 6));
  assert.equal((await call('PATCH', '/api/admin/classes/6', { title: 'x' }, admin)).status, 409);
  assert.equal((await call('POST', '/api/admin/classes', { classLevel: 6, title: 'Class 6' }, admin)).status, 409);
  const archived = (await call('GET', '/api/admin/classes?status=archived', undefined, admin)).data as { classLevel: number }[];
  assert.deepEqual(archived.map((c) => c.classLevel), [6]);

  const back = await call('POST', '/api/admin/classes/6/restore', undefined, admin);
  assert.equal(back.status, 200);
  assert.equal(back.data.status, 'visible');
  assert.deepEqual(back.data.subjects.map((s: { key: string }) => s.key), ['math']);
  assert.equal(await ContentItem.countDocuments({ type: 'kid_game', classLevel: 6 }), gamesBefore);
  assert.deepEqual(await listedLevels(), [1, 2, 3, 4, 5, 6]);
});
