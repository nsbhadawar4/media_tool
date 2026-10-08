/**
 * Session invalidation (logout, password change, password reset) and the password-reset
 * request's resistance to account enumeration.
 *
 * Sessions are stateless JWTs in an HTTP-only cookie. Two server-side mechanisms end them:
 *  - tokenVersion on the user: bumped by a password change or reset, it kills every session
 *    issued before it (requireAuth compares it on each request);
 *  - the revoked-session list: logout records the token's own session id, so that one token
 *    stops working everywhere while the account's other devices stay signed in.
 */
import './setupTestEnv';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { RevokedSession } from '../src/models/RevokedSession';
import { signSessionToken } from '../src/services/tokenService';
import { getEmailProvider } from '../src/services/email';
import { flushBackgroundTasks } from '../src/services/backgroundTasks';

const PASSWORD = 'session-password-123';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;

function call(method: string, url: string, cookie?: string, body?: unknown) {
  return fetch(`${baseUrl}${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Signs in through the real endpoint and returns the session cookie it set. */
async function login(email: string, password = PASSWORD, rememberMe = true): Promise<string> {
  const res = await call('POST', '/api/auth/login', undefined, { email, password, rememberMe });
  assert.equal(res.status, 200, `login ${email}`);
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const me = async (cookie: string) => (await call('GET', '/api/auth/me', cookie)).status;

async function makeUser(email: string) {
  return User.create({ email, name: email.split('@')[0]!, passwordHash: await bcrypt.hash(PASSWORD, 4) });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await RevokedSession.init(); // build the indexes (unique sid, TTL) before the tests rely on them
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

// ---------------------------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------------------------

test('logout ends that session on the server, not just in the browser', async () => {
  await makeUser('logout@example.com');
  const laptop = await login('logout@example.com');
  const phone = await login('logout@example.com');

  assert.equal((await call('POST', '/api/auth/logout', laptop)).status, 200);

  assert.equal(await me(laptop), 401, 'a copy of the logged-out token is refused');
  assert.equal(await me(phone), 200, 'the account’s other sessions are unaffected');
});

test('a logged-out session cannot stream media through the cookie path either', async () => {
  await makeUser('logout-media@example.com');
  const cookie = await login('logout-media@example.com');
  await call('POST', '/api/auth/logout', cookie);
  const res = await call('GET', `/api/media/${new mongoose.Types.ObjectId()}/raw`, cookie);
  assert.equal(res.status, 401);
});

test('the revocation record expires with the token and stores no token', async () => {
  await makeUser('logout-record@example.com');
  const cookie = await login('logout-record@example.com');
  const token = cookie.split('=')[1]!;
  const { sid, exp } = jwt.decode(token) as { sid: string; exp: number };
  await call('POST', '/api/auth/logout', cookie);

  const record = await RevokedSession.findOne({ sid }).lean();
  assert.ok(record);
  assert.equal(record!.expiresAt.getTime(), exp * 1000, 'kept only as long as the token could be replayed');
  assert.ok(!JSON.stringify(record).includes(token), 'the token itself is never stored');

  const indexes = await RevokedSession.collection.indexes();
  assert.ok(indexes.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0), 'TTL index cleans up expired entries');
});

test('logging out twice is harmless', async () => {
  await makeUser('logout-twice@example.com');
  const cookie = await login('logout-twice@example.com');
  assert.equal((await call('POST', '/api/auth/logout', cookie)).status, 200);
  assert.equal((await call('POST', '/api/auth/logout', cookie)).status, 401, 'already ended');
});

test('a session token issued before session ids existed still works', async () => {
  const user = await makeUser('legacy@example.com');
  const legacy = signSessionToken({ sub: user._id.toString(), role: 'user', email: user.email, name: user.name, tokenVersion: 0 });
  assert.equal(await me(`${env.COOKIE_NAME}=${legacy}`), 200);
});

// ---------------------------------------------------------------------------------------------
// Password change
// ---------------------------------------------------------------------------------------------

test('changing the password signs out other sessions but keeps this one', async () => {
  await makeUser('change@example.com');
  const here = await login('change@example.com');
  const elsewhere = await login('change@example.com');

  const res = await call('POST', '/api/auth/change-password', here, {
    currentPassword: PASSWORD,
    newPassword: 'brand-new-password-1',
    confirmPassword: 'brand-new-password-1',
  });
  assert.equal(res.status, 200);
  const renewed = res.headers.get('set-cookie');
  assert.ok(renewed, 'this browser gets a fresh cookie');
  assert.match(renewed!, /HttpOnly/i);
  assert.ok(!(await res.text()).includes(renewed!.split(';')[0]!.split('=')[1]!), 'the token is never in the body');

  assert.equal(await me(renewed!.split(';')[0]!), 200, 'the browser that changed it stays signed in');
  assert.equal(await me(elsewhere), 401, 'another device is signed out');
  assert.equal(await me(here), 401, 'and so is the old cookie for this browser');
});

test('the renewed cookie keeps the "remember me" choice of the session it replaces', async () => {
  await makeUser('change-session@example.com');
  const browserSession = await login('change-session@example.com', PASSWORD, false);
  const res = await call('POST', '/api/auth/change-password', browserSession, {
    currentPassword: PASSWORD,
    newPassword: 'another-new-password',
    confirmPassword: 'another-new-password',
  });
  assert.doesNotMatch(res.headers.get('set-cookie') ?? '', /Max-Age|Expires/i, 'still a browser-session cookie');
});

test('a wrong current password changes nothing and signs nobody out', async () => {
  await makeUser('change-wrong@example.com');
  const here = await login('change-wrong@example.com');
  const res = await call('POST', '/api/auth/change-password', here, {
    currentPassword: 'not-it',
    newPassword: 'brand-new-password-2',
    confirmPassword: 'brand-new-password-2',
  });
  assert.equal(res.status, 401);
  assert.equal(await me(here), 200);
});

// ---------------------------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------------------------

test('completing a password reset signs out every earlier session', async () => {
  const user = await makeUser('reset-sessions@example.com');
  const before1 = await login('reset-sessions@example.com');
  const before2 = await login('reset-sessions@example.com');

  // A verified reset authorization, as verify-otp would have minted it.
  const resetToken = crypto.randomBytes(32).toString('hex');
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordResetAuthTokenHash: crypto.createHash('sha256').update(resetToken).digest('hex'),
        passwordResetAuthExpiresAt: new Date(Date.now() + 10 * 60_000),
      },
    },
  );
  const res = await call('POST', '/api/auth/reset-password', undefined, {
    resetToken,
    newPassword: 'reset-new-password-1',
    confirmPassword: 'reset-new-password-1',
  });
  assert.equal(res.status, 200);
  assert.equal(await me(before1), 401);
  assert.equal(await me(before2), 401);
  assert.equal(await me(res.headers.get('set-cookie')!.split(';')[0]!), 200, 'the new session works');
});

// ---------------------------------------------------------------------------------------------
// Password-reset requests reveal nothing about which accounts exist
// ---------------------------------------------------------------------------------------------

async function forgot(email: string) {
  const res = await call('POST', '/api/auth/forgot-password', undefined, { email });
  const body = await res.json();
  return { status: res.status, message: body.message ?? body.error?.message, keys: Object.keys(body.data ?? {}).sort() };
}

test('existing, non-existing and suspended addresses get the identical answer', async () => {
  await makeUser('exists@example.com');
  await User.create({ email: 'suspended-reset@example.com', name: 's', passwordHash: 'x', isActive: false });

  const existing = await forgot('exists@example.com');
  const missing = await forgot('missing@example.com');
  const suspended = await forgot('suspended-reset@example.com');
  const mixedCase = await forgot('  Exists@Example.COM ');

  assert.equal(existing.status, 200);
  assert.deepEqual(missing, existing);
  assert.deepEqual(suspended, existing);
  assert.deepEqual(mixedCase, existing, 'the address is normalized before lookup');
  await flushBackgroundTasks();
});

test('an invalid address is a validation error regardless of any account', async () => {
  const res = await forgot('not-an-email');
  assert.equal(res.status, 400);
});

test('the answer does not wait for the email to be sent', async () => {
  await makeUser('slow-mail@example.com');
  const provider = getEmailProvider();
  const original = provider.send.bind(provider);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let sentTo: string | null = null;
  provider.send = async (message) => {
    await gate; // an SMTP server that has not answered yet
    sentTo = message.to;
  };
  try {
    const answered = await forgot('slow-mail@example.com');
    assert.equal(answered.status, 200, 'answered while the email was still in flight');
    assert.equal(sentTo, null);
    release();
    await flushBackgroundTasks();
    assert.equal(sentTo, 'slow-mail@example.com', 'and the email still goes to the account address');
  } finally {
    provider.send = original;
  }
});

test('a delivery failure is not revealed to the caller, and the code can be re-requested at once', async () => {
  const user = await makeUser('smtp-down@example.com');
  const provider = getEmailProvider();
  const original = provider.send.bind(provider);
  provider.send = async () => {
    throw new Error('SMTP connection refused');
  };
  try {
    const failed = await forgot('smtp-down@example.com');
    const missing = await forgot('nobody-at-all@example.com');
    assert.deepEqual(failed, missing, 'same answer as an address with no account');
    await flushBackgroundTasks();

    const stored = await User.findById(user._id).select('+passwordResetOtpLastSentAt +passwordResetOtpHash');
    assert.equal(stored!.passwordResetOtpLastSentAt, null, 'cooldown cleared, so a resend is allowed immediately');
  } finally {
    provider.send = original;
  }
});
