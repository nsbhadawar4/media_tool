/**
 * Site appearance: which themes visitors and users may use (both / light only / dark only) and the
 * default for anyone without a saved choice. Readable by anyone (it themes the public site),
 * changed only by administrators, validated strictly and audited.
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
import { SiteSetting } from '../src/models/SiteSetting';
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
  return { status: res.status, data: json?.data, raw: JSON.stringify(json) };
}
const publicAppearance = async () => (await call('GET', '/api/settings/appearance')).data;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await SiteSetting.init();
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

test('before anything is saved: both themes, dark by default — readable signed out, nothing private', async () => {
  const res = await call('GET', '/api/settings/appearance');
  assert.equal(res.status, 200);
  assert.deepEqual(res.data, { themeMode: 'both', defaultTheme: 'dark' });
});

test('only administrators can read the admin view or change it: 401 signed out, 403 for a user', async () => {
  assert.equal((await call('GET', '/api/admin/settings/appearance')).status, 401);
  assert.equal((await call('GET', '/api/admin/settings/appearance', undefined, user)).status, 403);
  assert.equal((await call('PATCH', '/api/admin/settings/appearance', { themeMode: 'light' })).status, 401);
  assert.equal((await call('PATCH', '/api/admin/settings/appearance', { themeMode: 'light' }, user)).status, 403);
  assert.equal((await call('PATCH', '/api/admin/settings/appearance', { themeMode: 'light', role: 'admin' }, user)).status, 403);
  assert.deepEqual(await publicAppearance(), { themeMode: 'both', defaultTheme: 'dark' }, 'unchanged');
});

test('validated strictly: only known values, only these fields, something to change', async () => {
  for (const body of [{ themeMode: 'sepia' }, { defaultTheme: 'system' }, {}, { themeMode: 'light', extra: 1 }]) {
    assert.equal((await call('PATCH', '/api/admin/settings/appearance', body, admin)).status, 400, JSON.stringify(body));
  }
});

test('an administrator saves it; everyone reads the new setting at once; the change is audited', async () => {
  const res = await call('PATCH', '/api/admin/settings/appearance', { themeMode: 'light', defaultTheme: 'light' }, admin);
  assert.equal(res.status, 200);
  assert.deepEqual(res.data, { themeMode: 'light', defaultTheme: 'light' });
  assert.deepEqual(await publicAppearance(), { themeMode: 'light', defaultTheme: 'light' });

  const view = (await call('GET', '/api/admin/settings/appearance', undefined, admin)).data;
  assert.equal(view.themeMode, 'light');
  assert.equal(view.updatedBy.email, 'root@example.com');

  const audit = await ActivityLog.findOne({ action: 'settings_updated' }).sort({ createdAt: -1 }).lean();
  assert.ok(audit);
  assert.match(audit!.message, /themes Light \+ Dark → Light only, default theme dark → light/);
  assert.equal(audit!.metadata?.previousThemeMode, 'both');

  // One field at a time keeps the other; one document only, however often it is saved.
  await call('PATCH', '/api/admin/settings/appearance', { themeMode: 'dark' }, admin);
  assert.deepEqual(await publicAppearance(), { themeMode: 'dark', defaultTheme: 'light' });
  await call('PATCH', '/api/admin/settings/appearance', { themeMode: 'both', defaultTheme: 'dark' }, admin);
  assert.equal(await SiteSetting.countDocuments(), 1);
  assert.deepEqual(await publicAppearance(), { themeMode: 'both', defaultTheme: 'dark' });

  // Saving the same values again changes nothing and writes no audit entry.
  const audits = await ActivityLog.countDocuments({ action: 'settings_updated' });
  const same = await call('PATCH', '/api/admin/settings/appearance', { themeMode: 'both' }, admin);
  assert.equal(same.status, 200);
  assert.equal(await ActivityLog.countDocuments({ action: 'settings_updated' }), audits);
});
