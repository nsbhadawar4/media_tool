/**
 * Admin content control: separate landing / dashboard surfaces for Games and Kid Games, featured
 * games, dashboard blocks and header links (defined by code, switched and ordered here), bulk
 * changes — all stored in the database, changed only by administrators, audited, and read by the
 * public catalog the site and the app render from.
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
import { invalidateCatalog, seedCatalog } from '../src/services/contentService';

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
  return { status: res.status, data: json?.data, message: json?.message, raw: JSON.stringify(json) };
}

type Entry = { key: string; isEnabled: boolean; isVisible: boolean; showOnLanding: boolean; featured: boolean; order: number; title: string };
const catalog = async () => (await call('GET', '/api/content/catalog')).data as Record<string, Entry[]>;
const item = async (type: string, key: string) => (await ContentItem.findOne({ type, key }).lean())!;
const patch = (id: unknown, body: unknown, cookie: string | undefined = admin) => call('PATCH', `/api/admin/content/items/${id}`, body, cookie);
const lastAudit = async (action?: string) => (await ActivityLog.findOne(action ? { action } : {}).sort({ createdAt: -1, _id: -1 }).lean())!;

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
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

test('new endpoints and fields are admin-only: 401 signed out, 403 for a normal user', async () => {
  const snake = await item('game', 'snake');
  const body = { ids: [snake._id.toString()], patch: { isEnabled: false } };
  assert.equal((await call('POST', '/api/admin/content/items/bulk', body)).status, 401);
  assert.equal((await call('POST', '/api/admin/content/items/bulk', body, user)).status, 403);
  assert.equal((await patch(snake._id, { showOnLanding: false }, '')).status, 401);
  assert.equal((await patch(snake._id, { showOnLanding: false }, user)).status, 403);
  assert.equal((await patch(snake._id, { featured: true }, user)).status, 403);
  const widget = await item('dashboard_widget', 'games');
  assert.equal((await patch(widget._id, { isEnabled: false }, user)).status, 403);
  // A role claimed by the client counts for nothing.
  assert.equal((await call('POST', '/api/admin/content/items/bulk', { ...body, role: 'admin' }, user)).status, 403);
  const after = await item('game', 'snake');
  assert.equal(after.isEnabled, true);
  assert.equal(after.showOnLanding, true);
  assert.equal(after.featured, false);
});

test('defaults keep today’s behaviour: features off the landing page, every game ready for it, blocks and links on', async () => {
  const c = await catalog();
  assert.equal(c.sections.find((s) => s.key === 'games')!.showOnLanding, false);
  assert.equal(c.sections.find((s) => s.key === 'kid-games')!.showOnLanding, false);
  assert.ok(c.games.every((g) => g.isEnabled && g.isVisible && g.showOnLanding && !g.featured));
  assert.equal(c.kidGames.length, 150);
  assert.ok(c.kidGames.every((g) => g.showOnLanding && !g.featured));
  assert.deepEqual(
    c.dashboardWidgets.map((w) => w.key),
    ['welcome', 'stats', 'quick-actions', 'recent-files', 'recent-activity', 'storage', 'games', 'kid-games', 'recent-folders'],
  );
  assert.ok(c.dashboardWidgets.every((w) => w.isEnabled));
  assert.deepEqual(c.navItems.map((n) => n.key), ['home', 'features', 'games', 'kid-games', 'faq', 'pricing', 'login', 'get-started']);
});

test('migration: entries stored before the surface fields existed get them, once, without losing the landing default', async () => {
  await ContentItem.collection.updateMany({ type: { $in: ['section', 'game'] } }, { $unset: { showOnLanding: '', featured: '' } });
  const before = await ContentItem.collection.findOne({ type: 'section', key: 'games' });
  assert.equal(before!.showOnLanding, undefined);
  await seedCatalog();
  assert.equal((await item('section', 'games')).showOnLanding, false, 'feature sections stay off the landing page');
  assert.equal((await item('section', 'faq')).showOnLanding, true);
  assert.equal((await item('game', 'ludo')).showOnLanding, true);
  assert.equal((await item('game', 'ludo')).featured, false);
  const again = await seedCatalog();
  assert.equal(again.inserted, 0);
  assert.equal(again.updated, 0, 'nothing left to backfill');
});

test('landing and dashboard are separate switches for the Games feature and for each game', async () => {
  const games = await item('section', 'games');
  assert.equal((await patch(games._id, { showOnLanding: true })).status, 200);
  let c = await catalog();
  const section = c.sections.find((s) => s.key === 'games')!;
  assert.deepEqual([section.isEnabled && section.isVisible, section.showOnLanding], [true, true]);

  const snake = await item('game', 'snake');
  assert.equal((await patch(snake._id, { isVisible: false })).status, 200);
  assert.match((await lastAudit('content_hidden')).message, /Hid game “Snake” from the user dashboard/);
  assert.equal((await patch(snake._id, { showOnLanding: false })).status, 200);
  const audit = await lastAudit('content_hidden');
  assert.match(audit.message, /Hid game “Snake” from the landing page/);
  assert.deepEqual([audit.metadata?.field, audit.metadata?.previous, audit.metadata?.next], ['showOnLanding', true, false]);
  c = await catalog();
  const s = c.games.find((g) => g.key === 'snake')!;
  assert.deepEqual([s.isEnabled, s.isVisible, s.showOnLanding], [true, false, false], 'still playable; off both surfaces');

  assert.equal((await patch(snake._id, { featured: true })).status, 200);
  assert.match((await lastAudit('content_updated')).message, /Featured game “Snake”/);
  assert.equal((await catalog()).games.find((g) => g.key === 'snake')!.featured, true);
  await patch(snake._id, { isVisible: true, showOnLanding: true, featured: false });
  await patch(games._id, { showOnLanding: false });
});

test('surface fields only where they mean something; code-defined lists can only be switched, ordered and relabelled', async () => {
  const hero = await item('section', 'hero');
  assert.equal((await patch(hero._id, { showOnLanding: false })).status, 400);
  const cls = await item('class', 'class-1');
  assert.equal((await patch(cls._id, { featured: true })).status, 400);
  const widget = await item('dashboard_widget', 'recent-folders');
  assert.equal((await patch(widget._id, { isVisible: false })).status, 400);
  assert.equal((await call('DELETE', `/api/admin/content/items/${widget._id}`, undefined, admin)).status, 400);
  assert.equal((await call('POST', '/api/admin/content/items', { type: 'dashboard_widget', key: 'ads', title: 'Ads' }, admin)).status, 400);
  assert.equal((await call('POST', '/api/admin/content/items', { type: 'nav_item', key: 'evil', title: 'Evil' }, admin)).status, 400);
  const nav = await item('nav_item', 'faq');
  assert.equal((await patch(nav._id, { title: 'A label far too long for any header' })).status, 400);
  // Unknown fields (an address, say) are refused outright.
  assert.equal((await patch(nav._id, { href: 'javascript:alert(1)' })).status, 400);
  assert.equal((await patch(nav._id, { title: 'Questions' })).status, 200);
  assert.equal((await catalog()).navItems.find((n) => n.key === 'faq')!.title, 'Questions');
  await patch(nav._id, { title: 'FAQ' });
});

test('dashboard blocks: switched off they leave the catalog’s ON list; reordered with the position in the audit', async () => {
  const folders = await item('dashboard_widget', 'recent-folders');
  assert.equal((await patch(folders._id, { isEnabled: false })).status, 200);
  assert.match((await lastAudit('content_disabled')).message, /Turned off dashboard block “Recent folders”/);
  let c = await catalog();
  assert.equal(c.dashboardWidgets.find((w) => w.key === 'recent-folders')!.isEnabled, false);
  await patch(folders._id, { isEnabled: true });

  const games = await item('dashboard_widget', 'games');
  const res = await call('POST', `/api/admin/content/items/${games._id}/move`, { direction: 'up' }, admin);
  assert.equal(res.status, 200);
  assert.match((await lastAudit('content_reordered')).message, /Moved dashboard block “Games” from position 7 to position 6/);
  c = await catalog();
  const order = [...c.dashboardWidgets].sort((a, b) => a.order - b.order).map((w) => w.key);
  assert.equal(order.indexOf('games'), 5);
  assert.equal(order.indexOf('storage'), 6);
  await call('POST', `/api/admin/content/items/${games._id}/move`, { direction: 'down' }, admin);
});

test('landing section reorder is audited with positions too', async () => {
  const reviews = await item('section', 'reviews');
  assert.equal((await call('POST', `/api/admin/content/items/${reviews._id}/move`, { direction: 'up' }, admin)).status, 200);
  assert.match((await lastAudit('section_reordered')).message, /Moved section “Reviews” from position \d+ to position \d+/);
  await call('POST', `/api/admin/content/items/${reviews._id}/move`, { direction: 'down' }, admin);
});

test('bulk: picked games, or a whole class / subject of Kid Games — only real changes count, one audit entry', async () => {
  const ids = (await ContentItem.find({ type: 'game', key: { $in: ['snake', 'ludo'] } }).lean()).map((g) => g._id.toString());
  let res = await call('POST', '/api/admin/content/items/bulk', { ids, patch: { isVisible: false } }, admin);
  assert.equal(res.status, 200);
  assert.deepEqual(res.data, { matched: 2, changed: 2 });
  const audit = await lastAudit('content_bulk_updated');
  assert.match(audit.message, /hidden from the user dashboard — 2 of 2 games/);
  res = await call('POST', '/api/admin/content/items/bulk', { ids, patch: { isVisible: false } }, admin);
  assert.deepEqual(res.data, { matched: 2, changed: 0 }, 'already hidden');
  await call('POST', '/api/admin/content/items/bulk', { ids, patch: { isVisible: true } }, admin);

  res = await call('POST', '/api/admin/content/items/bulk', { scope: { type: 'kid_game', classLevel: 1, subject: 'hindi' }, patch: { isEnabled: false } }, admin);
  assert.deepEqual(res.data, { matched: 10, changed: 10 });
  assert.match((await lastAudit('content_bulk_updated')).message, /disabled — 10 of 10 Kid Games in Class 1 · hindi/);
  let c = await catalog();
  assert.equal(c.kidGames.filter((g) => !g.isEnabled).length, 10);
  // Class 2's Hindi untouched.
  assert.ok(c.kidGames.filter((g) => g.key.startsWith('c2-hindi')).every((g) => g.isEnabled));
  res = await call('POST', '/api/admin/content/items/bulk', { scope: { type: 'kid_game', classLevel: 1 }, patch: { isEnabled: true } }, admin);
  assert.deepEqual(res.data, { matched: 30, changed: 10 });
  c = await catalog();
  assert.ok(c.kidGames.every((g) => g.isEnabled));

  // Malformed requests.
  assert.equal((await call('POST', '/api/admin/content/items/bulk', { ids, scope: { type: 'game' }, patch: { isEnabled: false } }, admin)).status, 400);
  assert.equal((await call('POST', '/api/admin/content/items/bulk', { scope: { type: 'game', classLevel: 1 }, patch: { isEnabled: false } }, admin)).status, 400);
  assert.equal((await call('POST', '/api/admin/content/items/bulk', { ids, patch: {} }, admin)).status, 400);
  assert.equal((await call('POST', '/api/admin/content/items/bulk', { ids, patch: { title: 'x' } }, admin)).status, 400);
  const hero = (await item('section', 'hero'))._id.toString();
  assert.equal((await call('POST', '/api/admin/content/items/bulk', { ids: [hero], patch: { isEnabled: false } }, admin)).status, 404, 'only games and Kid Games');
  assert.equal((await item('section', 'hero')).isEnabled, true);
});

test('disabling a Kid Game by bulk stops its results counting, like a single switch', async () => {
  const game = await item('kid_game', 'c3-math-number-runner');
  const result = { gameId: 'c3-math-number-runner', correct: 3, total: 5, bestStreak: 2, seconds: 30 };
  assert.equal((await call('POST', '/api/kid-games/results', result, user)).status, 201);
  await call('POST', '/api/admin/content/items/bulk', { ids: [game._id.toString()], patch: { isEnabled: false } }, admin);
  invalidateCatalog();
  assert.equal((await call('POST', '/api/kid-games/results', result, user)).status, 403);
  await call('POST', '/api/admin/content/items/bulk', { ids: [game._id.toString()], patch: { isEnabled: true } }, admin);
});

test('filters: landing and featured', async () => {
  const ludo = await item('game', 'ludo');
  await patch(ludo._id, { showOnLanding: false, featured: true });
  const off = await call('GET', '/api/admin/content/items?type=game&landing=off', undefined, admin);
  assert.deepEqual((off.data as Entry[]).map((g) => g.key), ['ludo']);
  const feat = await call('GET', '/api/admin/content/items?type=game&featured=yes', undefined, admin);
  assert.deepEqual((feat.data as Entry[]).map((g) => g.key), ['ludo']);
  const on = await call('GET', '/api/admin/content/items?type=game&landing=on', undefined, admin);
  assert.equal((on.data as Entry[]).length, 6);
  await patch(ludo._id, { showOnLanding: true, featured: false });
});
