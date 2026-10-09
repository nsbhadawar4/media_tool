/**
 * Website section visibility: one ON/OFF state per section (enabled + visible), stored in the
 * database and changed only by administrators, audited as "Section Enabled / Disabled /
 * Reordered" with the previous and new state, read by the public catalog on the next request —
 * and closing the app areas some sections stand for, without touching onboarding's plan choice.
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
import { ACTIVITY_CATEGORIES } from '../src/config/constants';

const PASSWORD = 'Strong-Passw0rd';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let admin: string;
let adminId: string;
let user: string;

async function signIn(email: string, role: 'user' | 'admin', extra: Record<string, unknown> = {}) {
  const created = await User.create({ name: `Name of ${email}`, email, role, passwordHash: await bcrypt.hash(PASSWORD, 4), ...extra });
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  return { cookie: (res.headers.get('set-cookie') ?? '').match(/mt_session=[^;]+/)![0], id: created._id.toString() };
}

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, data: json?.data, error: json?.error, message: json?.message, raw: JSON.stringify(json) };
}

const section = async (key: string) => (await ContentItem.findOne({ type: 'section', key }).lean())!;
const publicSection = async (key: string) => {
  const res = await call('GET', '/api/content/catalog');
  return (res.data.sections as Array<{ key: string; isEnabled: boolean; isVisible: boolean; order: number }>).find((s) => s.key === key);
};
const on = (s: { isEnabled: boolean; isVisible: boolean } | undefined) => Boolean(s?.isEnabled && s.isVisible);
const turn = (id: unknown, state: boolean, cookie: string | undefined = admin) => call('PATCH', `/api/admin/content/items/${id}`, state ? { isEnabled: true, isVisible: true } : { isEnabled: false }, cookie);

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([ContentItem.init(), Course.init()]);
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ({ cookie: admin, id: adminId } = await signIn('root@example.com', 'admin'));
  ({ cookie: user } = await signIn('kid@example.com', 'user'));
  // Seeds the catalog.
  assert.equal((await call('GET', '/api/content/catalog')).status, 200);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

test('every public section is seeded, Contact included; Pricing starts off', async () => {
  const keys = (await ContentItem.find({ type: 'section' }).sort({ order: 1 }).lean()).map((s) => s.key);
  assert.deepEqual(keys, ['hero', 'highlights', 'features', 'media', 'documents', 'games', 'kid-games', 'how-it-works', 'security', 'reviews', 'pricing', 'faq', 'cta', 'contact']);
  assert.equal(on(await publicSection('pricing')), false);
  assert.equal(on(await publicSection('faq')), true);
  assert.equal(on(await publicSection('contact')), true);
});

test('only an administrator can change a section: 401 signed out, 403 for a user, nothing changes', async () => {
  const faq = await section('faq');
  for (const [cookie, status] of [[undefined, 401], [user, 403]] as const) {
    assert.equal((await call('PATCH', `/api/admin/content/items/${faq._id}`, { isEnabled: false }, cookie)).status, status);
    assert.equal((await call('POST', `/api/admin/content/items/${faq._id}/move`, { direction: 'up' }, cookie)).status, status);
    assert.equal((await call('POST', '/api/admin/content/items', { type: 'section', key: 'promo', title: 'Promo' }, cookie)).status, status);
    assert.equal((await call('DELETE', `/api/admin/content/items/${faq._id}`, undefined, cookie)).status, status);
    assert.equal((await call('GET', '/api/admin/content/items?type=section', undefined, cookie)).status, status);
  }
  const after = await section('faq');
  assert.deepEqual([after.isEnabled, after.isVisible, after.order, after.archivedAt], [faq.isEnabled, faq.isVisible, faq.order, null]);
  assert.equal(await ContentItem.countDocuments({ key: 'promo' }), 0);
  assert.equal(await ActivityLog.countDocuments({ action: { $in: ['section_enabled', 'section_disabled', 'section_reordered'] } }), 0);
});

test('an administrator turns a section off and on: stored, public at once, audited with previous and new state', async () => {
  const faq = await section('faq');
  const off = await turn(faq._id, false);
  assert.equal(off.status, 200);
  assert.equal(on(await publicSection('faq')), false, 'the catalog reflects it on the next request');

  const [disabled] = await ActivityLog.find({ action: 'section_disabled' }).lean();
  assert.ok(disabled, 'audited');
  assert.equal(disabled.performedBy?.toString(), adminId, 'by this administrator');
  assert.ok((ACTIVITY_CATEGORIES.cms as readonly string[]).includes('section_disabled'), 'filed under CMS');
  assert.deepEqual(
    { section: disabled.metadata?.section, previous: disabled.metadata?.previous, next: disabled.metadata?.next },
    { section: 'faq', previous: 'on', next: 'off' },
  );
  assert.ok(disabled.createdAt instanceof Date);
  assert.doesNotMatch(JSON.stringify(disabled), /passwordHash|mt_session|JWT_SECRET|MONGODB_URI/i, 'no secrets');

  assert.equal((await turn(faq._id, true)).status, 200);
  assert.equal(on(await publicSection('faq')), true);
  const [enabled] = await ActivityLog.find({ action: 'section_enabled' }).lean();
  assert.deepEqual([enabled.metadata?.previous, enabled.metadata?.next], ['off', 'on']);

  // A no-op write is not an event; only ON/OFF changes are.
  await turn(faq._id, true);
  assert.equal(await ActivityLog.countDocuments({ action: 'section_enabled' }), 1);
  // Section events replace the generic content ones — one entry per change.
  assert.equal(await ActivityLog.countDocuments({ action: { $in: ['content_enabled', 'content_disabled', 'content_shown', 'content_hidden'] }, 'metadata.type': 'section' }), 0);
});

test('turning on a section that ships hidden (Pricing) makes it enabled and visible', async () => {
  const pricing = await section('pricing');
  assert.equal(pricing.isVisible, false);
  assert.equal((await turn(pricing._id, true)).status, 200);
  assert.equal(on(await publicSection('pricing')), true);
  const [entry] = await ActivityLog.find({ action: 'section_enabled', 'metadata.section': 'pricing' }).lean();
  assert.deepEqual([entry.metadata?.previous, entry.metadata?.next], ['off', 'on']);
  assert.equal((await turn(pricing._id, false)).status, 200);
  assert.equal(on(await publicSection('pricing')), false);
});

test('reordering is stored, public and audited as Section Reordered', async () => {
  const faq = await section('faq');
  const moved = await call('POST', `/api/admin/content/items/${faq._id}/move`, { direction: 'up' }, admin);
  assert.equal(moved.status, 200);
  const [pricing, faqNow] = await Promise.all([publicSection('pricing'), publicSection('faq')]);
  assert.ok(faqNow!.order < pricing!.order, 'FAQ now comes before Pricing');
  const [entry] = await ActivityLog.find({ action: 'section_reordered' }).lean();
  assert.deepEqual([entry.metadata?.section, entry.metadata?.direction, entry.metadata?.previous, entry.metadata?.next], ['faq', 'up', faq.order, faqNow!.order]);
  assert.equal(entry.performedBy?.toString(), adminId);
  await call('POST', `/api/admin/content/items/${faq._id}/move`, { direction: 'down' }, admin);
});

test('the admin listing says who changed a section last, and when', async () => {
  const res = await call('GET', '/api/admin/content/items?type=section&status=all&limit=100', undefined, admin);
  assert.equal(res.status, 200);
  const rows = res.data as Array<{ key: string; updatedAt: string; updatedBy: { id: string; name: string | null; email: string | null } | null }>;
  const faq = rows.find((r) => r.key === 'faq')!;
  assert.deepEqual(faq.updatedBy, { id: adminId, name: 'Name of root@example.com', email: 'root@example.com' });
  assert.ok(Date.parse(faq.updatedAt));
  assert.equal(rows.find((r) => r.key === 'cta')!.updatedBy, null, 'never changed by anyone: the app default');
  assert.doesNotMatch(res.raw, /passwordHash|tokenVersion/, 'only name and email of the administrator');
});

test('new sections can be added, and appear in the public catalog', async () => {
  const created = await call('POST', '/api/admin/content/items', { type: 'section', key: 'announcement', title: 'Announcement', description: 'Back to school offers' }, admin);
  assert.equal(created.status, 201);
  const entry = await publicSection('announcement');
  assert.ok(on(entry));
  assert.equal(entry!.order, 12, 'at the end');
  await turn(created.data.id, false);
  assert.equal(on(await publicSection('announcement')), false);
});

test('Kid Games OFF closes Kid Games for users on the server: results and courses refused', async () => {
  const kid = await section('kid-games');
  const result = { gameId: 'c1-math-math-quiz', correct: 7, total: 10, seconds: 30 };
  assert.equal((await call('POST', '/api/kid-games/results', result, user)).status, 201);
  await Course.create({ slug: 'counting', title: 'Counting', classLevel: 1, subject: 'math', isEnabled: true, isVisible: true, order: 1, lessons: [] });
  assert.equal((await call('GET', '/api/content/courses/counting', undefined, user)).status, 200);

  await turn(kid._id, false);
  const refused = await call('POST', '/api/kid-games/results', result, user);
  assert.deepEqual([refused.status, refused.error?.code], [403, 'GAME_UNAVAILABLE']);
  assert.equal((await call('GET', '/api/content/courses/counting', undefined, user)).status, 404);
  assert.deepEqual((await call('GET', '/api/content/courses', undefined, user)).data, []);

  await turn(kid._id, true);
  assert.equal((await call('POST', '/api/kid-games/results', result, user)).status, 201);
  assert.equal((await call('GET', '/api/content/courses/counting', undefined, user)).status, 200);
});

test('Pricing OFF leaves onboarding plan choice working: signup → plan → dashboard', async () => {
  const pricing = await section('pricing');
  await turn(pricing._id, false);
  assert.equal(on(await publicSection('pricing')), false);

  const { cookie } = await signIn('newcomer@example.com', 'user', { onboardingRequired: true });
  const me = await call('GET', '/api/auth/me', undefined, cookie);
  assert.equal(me.data.onboardingRequired, true);
  const chosen = await call('POST', '/api/auth/onboarding', { plan: 'free' }, cookie);
  assert.equal(chosen.status, 200, chosen.raw);
  assert.deepEqual([chosen.data.plan, chosen.data.onboardingRequired], ['free', false]);
  const pro = await signIn('pro@example.com', 'user', { onboardingRequired: true });
  const chosenPro = await call('POST', '/api/auth/onboarding', { plan: 'pro' }, pro.cookie);
  assert.equal(chosenPro.status, 200, chosenPro.raw);
  assert.equal(chosenPro.data.plan, 'pro');
});
