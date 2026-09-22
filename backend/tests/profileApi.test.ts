/**
 * The account's own profile: what it can read about itself, and what it can change.
 *
 * Two things here are worth more than the CRUD. An email is this app's login identity, so
 * handing it to somebody else's address has to be a refusal rather than a database error.
 * And a password change is the one operation a valid session must not be sufficient for —
 * a session can be an unattended laptop or a stolen cookie, and without the current
 * password either of those would become a stolen account.
 */
import './setupTestEnv';

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { ActivityLog } from '../src/models/ActivityLog';
import { signSessionToken } from '../src/services/tokenService';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let cookie: string;
let userId: string;

const PASSWORD = 'original-password-1';

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { message: string };
}

async function callApi<T>(
  method: string,
  routePath: string,
  body?: unknown,
  withCookie = true,
): Promise<{ status: number; payload: Envelope<T> }> {
  const response = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers: { 'content-type': 'application/json', ...(withCookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, payload: (await response.json()) as Envelope<T> };
}

interface Profile {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  role: string;
  isEmailVerified: boolean;
  createdAt: string;
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), ActivityLog.deleteMany({})]);

  const user = await User.create({
    name: 'Narayan',
    email: 'owner@example.com',
    passwordHash: await bcrypt.hash(PASSWORD, 10),
    mobile: '+91 98765 43210',
    role: 'user',
  });
  userId = user._id.toString();
  cookie = `${env.COOKIE_NAME}=${signSessionToken({
    sub: userId,
    role: 'user',
    email: user.email,
    name: user.name,
  })}`;
});

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

test('GET /api/auth/me returns the signup details, never the password hash', async () => {
  const { status, payload } = await callApi<Profile & { passwordHash?: string }>('GET', '/api/auth/me');

  assert.equal(status, 200);
  const profile = payload.data!;
  assert.equal(profile.name, 'Narayan');
  assert.equal(profile.email, 'owner@example.com');
  assert.equal(profile.mobile, '+91 98765 43210');
  assert.equal(profile.role, 'user');
  assert.ok(profile.createdAt, 'the profile page shows when the account was created');

  // The one field that must never travel, whatever else changes here.
  assert.equal(profile.passwordHash, undefined);
  assert.doesNotMatch(JSON.stringify(payload), /\$2[aby]\$/, 'no bcrypt hash may appear anywhere');
});

test('the profile is only readable with a session', async () => {
  const { status } = await callApi('GET', '/api/auth/me', undefined, false);
  assert.equal(status, 401);
});

/* -------------------------------------------------------------------------- */
/* Editing                                                                     */
/* -------------------------------------------------------------------------- */

test('name and mobile can be changed', async () => {
  const { status, payload } = await callApi<Profile>('PATCH', '/api/auth/me', {
    name: 'Narayan S',
    mobile: '+91 90000 00000',
  });

  assert.equal(status, 200);
  assert.equal(payload.data!.name, 'Narayan S');
  assert.equal(payload.data!.mobile, '+91 90000 00000');

  const stored = await User.findById(userId);
  assert.equal(stored!.name, 'Narayan S');
});

test('only the fields that were sent are written', async () => {
  /**
   * The form sends the difference, not the whole record. If an omitted field were treated
   * as "clear it", saving a new phone number would silently wipe a name someone had just
   * changed in another tab.
   */
  await callApi('PATCH', '/api/auth/me', { name: 'Only The Name' });

  const stored = await User.findById(userId);
  assert.equal(stored!.name, 'Only The Name');
  assert.equal(stored!.mobile, '+91 98765 43210', 'an untouched field must survive');
  assert.equal(stored!.email, 'owner@example.com');
});

test('an emptied mobile clears it rather than failing validation', async () => {
  // It is the one optional signup field, so removing it has to be expressible.
  const { status, payload } = await callApi<Profile>('PATCH', '/api/auth/me', { mobile: '' });

  assert.equal(status, 200);
  assert.equal(payload.data!.mobile, null);
});

test('an email already in use is refused, and nothing changes', async () => {
  await User.create({
    name: 'Somebody Else',
    email: 'taken@example.com',
    passwordHash: await bcrypt.hash('another-password', 10),
  });

  const { status, payload } = await callApi('PATCH', '/api/auth/me', {
    name: 'Renamed Too',
    email: 'taken@example.com',
  });

  assert.equal(status, 409);
  assert.match(payload.error!.message, /already uses this email/i);

  const stored = await User.findById(userId);
  assert.equal(stored!.email, 'owner@example.com');
  assert.equal(stored!.name, 'Narayan', 'a refused request must not half-apply');
});

test('changing the email marks it unverified again', async () => {
  await User.updateOne({ _id: userId }, { isEmailVerified: true });

  const { payload } = await callApi<Profile>('PATCH', '/api/auth/me', { email: 'new@example.com' });

  assert.equal(payload.data!.email, 'new@example.com');
  // Nothing gates on this yet, but recording a verification that never happened would be
  // the wrong answer the moment something does.
  assert.equal(payload.data!.isEmailVerified, false);
});

test('invalid values are rejected', async () => {
  for (const body of [{ name: '' }, { email: 'not-an-email' }, { mobile: 'call me' }, {}]) {
    const { status } = await callApi('PATCH', '/api/auth/me', body);
    assert.equal(status, 400, `${JSON.stringify(body)} should be refused`);
  }

  const stored = await User.findById(userId);
  assert.equal(stored!.name, 'Narayan');
});

test('the role cannot be changed by sending one', async () => {
  // Signup already refuses this; the update path has to as well, or it becomes the way in.
  const { payload } = await callApi<Profile>('PATCH', '/api/auth/me', {
    name: 'Still A User',
    role: 'admin',
  });

  assert.equal(payload.data!.role, 'user');
  const stored = await User.findById(userId);
  assert.equal(stored!.role, 'user');
});

/* -------------------------------------------------------------------------- */
/* Password                                                                    */
/* -------------------------------------------------------------------------- */

test('the password can be changed with the current one', async () => {
  const { status } = await callApi('POST', '/api/auth/change-password', {
    currentPassword: PASSWORD,
    newPassword: 'a-much-better-password',
    confirmPassword: 'a-much-better-password',
  });

  assert.equal(status, 200);

  // Proved by logging in with it, not by reading the hash back.
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.com', password: 'a-much-better-password' }),
  });
  assert.equal(login.status, 200);
});

test('the wrong current password changes nothing', async () => {
  /**
   * The check that matters. A valid session is not proof of identity — it can be an
   * unattended laptop or a cookie somebody else is holding — so without this, either of
   * those would be enough to take the account over.
   */
  const { status } = await callApi('POST', '/api/auth/change-password', {
    currentPassword: 'not-my-password',
    newPassword: 'attacker-chosen-password',
    confirmPassword: 'attacker-chosen-password',
  });

  assert.equal(status, 401);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.com', password: PASSWORD }),
  });
  assert.equal(login.status, 200, 'the original password must still work');
});

test('a mismatched, too-short, or unchanged new password is refused', async () => {
  for (const body of [
    { currentPassword: PASSWORD, newPassword: 'longenough1', confirmPassword: 'different11' },
    { currentPassword: PASSWORD, newPassword: 'short', confirmPassword: 'short' },
    { currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD },
  ]) {
    const { status } = await callApi('POST', '/api/auth/change-password', body);
    assert.equal(status, 400, `${JSON.stringify(body)} should be refused`);
  }
});

test('changing a password requires a session', async () => {
  const { status } = await callApi(
    'POST',
    '/api/auth/change-password',
    { currentPassword: PASSWORD, newPassword: 'whatever-1234', confirmPassword: 'whatever-1234' },
    false,
  );
  assert.equal(status, 401);
});

test('both changes are written to the activity log', async () => {
  await callApi('PATCH', '/api/auth/me', { name: 'Logged Change' });
  await callApi('POST', '/api/auth/change-password', {
    currentPassword: PASSWORD,
    newPassword: 'another-good-password',
    confirmPassword: 'another-good-password',
  });

  const actions = (await ActivityLog.find({}).sort({ createdAt: 1 })).map((entry) => entry.action);
  assert.ok(actions.includes('profile_updated'));
  assert.ok(actions.includes('password_changed'));
});
