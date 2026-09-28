/**
 * The forgot/reset-password flow end to end, over HTTP.
 *
 * The promise under test: a reset token is single-use, time-limited, never stored in the
 * clear, and never lets the response say whether an email has an account. Everything else
 * — the email itself — is a side effect this suite does not assert on; EMAIL_PROVIDER
 * defaults to `console` in tests (see config/env.ts), so requesting a reset only ever logs
 * it, and what matters here is observable through the API and the database.
 */
import './setupTestEnv';

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { signSessionToken } from '../src/services/tokenService';
import { resolveFrontendOrigin } from '../src/controllers/authController';
import { buildResetUrl } from '../src/services/passwordResetService';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;

const ORIGINAL_PASSWORD = 'original-password-1';

interface Envelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: { message: string; code?: string };
}

async function callApi<T>(
  method: string,
  routePath: string,
  body?: unknown,
  cookie?: string,
): Promise<{ status: number; payload: Envelope<T> }> {
  const response = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, payload: (await response.json()) as Envelope<T> };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createUser(overrides: Partial<{ email: string; role: 'user' | 'admin'; isActive: boolean }> = {}) {
  return User.create({
    name: 'Narayan',
    email: overrides.email ?? 'owner@example.com',
    passwordHash: await bcrypt.hash(ORIGINAL_PASSWORD, 10),
    role: overrides.role ?? 'user',
    isActive: overrides.isActive ?? true,
  });
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
  await User.deleteMany({});
});

/* -------------------------------------------------------------------------- */
/* Requesting a reset                                                          */
/* -------------------------------------------------------------------------- */

test('forgot-password with an existing email starts a reset and answers generically', async () => {
  const user = await createUser({ email: 'owner@example.com' });

  const { status, payload } = await callApi('POST', '/api/auth/forgot-password', {
    email: 'owner@example.com',
  });

  assert.equal(status, 200);
  assert.match(payload.message ?? '', /if an account exists/i);

  const stored = await User.findById(user._id).select('+passwordResetTokenHash +passwordResetExpiresAt');
  assert.ok(stored!.passwordResetTokenHash, 'a token hash must be recorded');
  assert.ok(stored!.passwordResetExpiresAt! > new Date(), 'the token must have a future expiry');
});

test('forgot-password with a non-existing email answers exactly the same way', async () => {
  const existing = await callApi('POST', '/api/auth/forgot-password', { email: 'owner-does-not-exist@example.com' });
  await User.deleteMany({});
  await createUser({ email: 'owner@example.com' });
  const real = await callApi('POST', '/api/auth/forgot-password', { email: 'owner@example.com' });

  assert.equal(existing.status, real.status, 'status must not reveal whether the address has an account');
  assert.equal(existing.payload.message, real.payload.message, 'message must not reveal it either');

  const count = await User.countDocuments({});
  assert.equal(count, 1, 'requesting a reset for an unknown address must not create anything');
});

test('an inactive account gets no token, but the response looks the same', async () => {
  const user = await createUser({ email: 'suspended@example.com', isActive: false });

  const { status, payload } = await callApi('POST', '/api/auth/forgot-password', { email: 'suspended@example.com' });

  assert.equal(status, 200);
  assert.match(payload.message ?? '', /if an account exists/i);

  const stored = await User.findById(user._id).select('+passwordResetTokenHash');
  assert.equal(stored!.passwordResetTokenHash, null);
});

test('an invalid email is rejected before anything is looked up', async () => {
  const { status } = await callApi('POST', '/api/auth/forgot-password', { email: 'not-an-email' });
  assert.equal(status, 400);
});

/* -------------------------------------------------------------------------- */
/* Completing a reset                                                          */
/* -------------------------------------------------------------------------- */

async function issueRawToken(userId: string, expiresInMs = 30 * 60 * 1000): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await User.updateOne(
    { _id: userId },
    { passwordResetTokenHash: hashToken(token), passwordResetExpiresAt: new Date(Date.now() + expiresInMs) },
  );
  return token;
}

test('an invalid token is refused, and nothing changes', async () => {
  const user = await createUser();

  const { status, payload } = await callApi('POST', '/api/auth/reset-password', {
    token: 'not-a-real-token',
    newPassword: 'a-brand-new-password-1',
    confirmPassword: 'a-brand-new-password-1',
  });

  assert.equal(status, 400);
  assert.match(payload.error!.message, /invalid or has expired/i);

  const login = await callApi('POST', '/api/auth/login', { email: user.email, password: ORIGINAL_PASSWORD });
  assert.equal(login.status, 200, 'the original password must still work');
});

test('an expired token is refused', async () => {
  const user = await createUser();
  const token = await issueRawToken(user._id.toString(), -1000); // already expired

  const { status } = await callApi('POST', '/api/auth/reset-password', {
    token,
    newPassword: 'a-brand-new-password-1',
    confirmPassword: 'a-brand-new-password-1',
  });

  assert.equal(status, 400);
});

test('a reused token is refused the second time', async () => {
  const user = await createUser();
  const token = await issueRawToken(user._id.toString());

  const first = await callApi('POST', '/api/auth/reset-password', {
    token,
    newPassword: 'first-new-password-1',
    confirmPassword: 'first-new-password-1',
  });
  assert.equal(first.status, 200);

  const second = await callApi('POST', '/api/auth/reset-password', {
    token,
    newPassword: 'second-new-password-1',
    confirmPassword: 'second-new-password-1',
  });
  assert.equal(second.status, 400, 'the same token must not work twice');

  // The first reset is the one that must have taken effect.
  const login = await callApi('POST', '/api/auth/login', { email: user.email, password: 'first-new-password-1' });
  assert.equal(login.status, 200);
});

test('a mismatched or too-short new password is refused', async () => {
  const user = await createUser();

  for (const body of [
    { newPassword: 'longenough1', confirmPassword: 'different11' },
    { newPassword: 'short', confirmPassword: 'short' },
  ]) {
    const token = await issueRawToken(user._id.toString());
    const { status } = await callApi('POST', '/api/auth/reset-password', { token, ...body });
    assert.equal(status, 400, `${JSON.stringify(body)} should be refused`);
  }
});

test('a successful reset changes the password: old fails, new works', async () => {
  const user = await createUser();
  const token = await issueRawToken(user._id.toString());

  const { status, payload } = await callApi('POST', '/api/auth/reset-password', {
    token,
    newPassword: 'a-brand-new-password-1',
    confirmPassword: 'a-brand-new-password-1',
  });

  assert.equal(status, 200);
  assert.match(payload.message ?? '', /reset successfully/i);

  const oldLogin = await callApi('POST', '/api/auth/login', { email: user.email, password: ORIGINAL_PASSWORD });
  assert.equal(oldLogin.status, 401, 'the old password must no longer work');

  const newLogin = await callApi('POST', '/api/auth/login', {
    email: user.email,
    password: 'a-brand-new-password-1',
  });
  assert.equal(newLogin.status, 200, 'the new password must work');
});

test('a reset does not change the account role', async () => {
  const admin = await createUser({ email: 'admin@example.com', role: 'admin' });
  const token = await issueRawToken(admin._id.toString());

  await callApi('POST', '/api/auth/reset-password', {
    token,
    newPassword: 'a-brand-new-password-1',
    confirmPassword: 'a-brand-new-password-1',
  });

  const stored = await User.findById(admin._id);
  assert.equal(stored!.role, 'admin', 'resetting a password must never touch role');
});

/* -------------------------------------------------------------------------- */
/* Session invalidation                                                       */
/* -------------------------------------------------------------------------- */

test('completing a reset signs out sessions issued before it', async () => {
  const user = await createUser();

  // A session minted the way login would, before any reset has happened.
  const staleCookie = `${env.COOKIE_NAME}=${signSessionToken({
    sub: user._id.toString(),
    role: user.role,
    email: user.email,
    name: user.name,
    tokenVersion: user.tokenVersion ?? 0,
  })}`;

  const beforeReset = await callApi('GET', '/api/auth/me', undefined, staleCookie);
  assert.equal(beforeReset.status, 200, 'the session must work before the reset');

  const token = await issueRawToken(user._id.toString());
  await callApi('POST', '/api/auth/reset-password', {
    token,
    newPassword: 'a-brand-new-password-1',
    confirmPassword: 'a-brand-new-password-1',
  });

  const afterReset = await callApi('GET', '/api/auth/me', undefined, staleCookie);
  assert.equal(afterReset.status, 401, 'a session from before the reset must no longer be accepted');

  // A fresh login afterwards must still work normally.
  const login = await callApi('POST', '/api/auth/login', {
    email: user.email,
    password: 'a-brand-new-password-1',
  });
  assert.equal(login.status, 200);
});

test('sessions issued before this feature existed (no tokenVersion in the JWT) are unaffected', async () => {
  const user = await createUser();

  // Simulates a cookie signed by an older deployment, before SessionTokenPayload carried
  // tokenVersion at all.
  const legacyCookie = `${env.COOKIE_NAME}=${signSessionToken({
    sub: user._id.toString(),
    role: user.role,
    email: user.email,
    name: user.name,
  } as unknown as Parameters<typeof signSessionToken>[0])}`;

  const { status } = await callApi('GET', '/api/auth/me', undefined, legacyCookie);
  assert.equal(status, 200, 'deploying tokenVersion must not sign out sessions that predate it');
});

/* -------------------------------------------------------------------------- */
/* Reset link origin: localhost vs. a same-origin (Vercel) deployment          */
/* -------------------------------------------------------------------------- */

function fakeRequest(host: string | undefined, protocol = 'https') {
  return { protocol, get: (name: 'host') => (name === 'host' ? host : undefined) };
}

test('a same-origin deployment builds the link from the request itself, not FRONTEND_URL', () => {
  // This is what makes the link correct on production *and* every Vercel preview, each
  // with its own hostname — see resolveFrontendOrigin's comment.
  const origin = resolveFrontendOrigin(fakeRequest('my-preview-abc123.vercel.app'), true);
  assert.equal(origin, 'https://my-preview-abc123.vercel.app');
});

test('a split-origin deployment (local dev) falls back to FRONTEND_URL', () => {
  // The API's own host (:5000 in local dev) would be the wrong answer here — the
  // frontend is on a different port entirely.
  const origin = resolveFrontendOrigin(fakeRequest('localhost:5000'), false);
  assert.equal(origin, env.FRONTEND_URL.split(',')[0]!.trim().replace(/\/$/, ''));
});

test('a same-origin request with no Host header still falls back rather than producing a broken link', () => {
  const origin = resolveFrontendOrigin(fakeRequest(undefined), true);
  assert.equal(origin, env.FRONTEND_URL.split(',')[0]!.trim().replace(/\/$/, ''));
});

test('the reset link joins origin and token with no double slash', () => {
  assert.equal(buildResetUrl('https://example.com/', 'abc'), 'https://example.com/reset-password?token=abc');
  assert.equal(buildResetUrl('https://example.com', 'abc'), 'https://example.com/reset-password?token=abc');
});

test('a reset email never logs its own body or reset URL', async () => {
  const user = await createUser({ email: 'watched@example.com' });

  const originalWarn = console.warn;
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(' '));
  };
  let status: number;
  try {
    ({ status } = await callApi('POST', '/api/auth/forgot-password', { email: user.email }));
  } finally {
    console.warn = originalWarn;
  }
  // Guards against this test passing vacuously if the request never actually reached the
  // handler (e.g. rate-limited by the other forgot-password calls above) — no warning would
  // be logged either way, which would make the assertions below trivially true for the
  // wrong reason.
  assert.equal(status, 200, 'the request must actually succeed for this test to prove anything');

  const stored = await User.findById(user._id).select('+passwordResetTokenHash');
  const output = lines.join('\n');
  assert.ok(!output.includes('reset-password?token='), 'the console provider must never print the reset link');
  assert.ok(
    !output.includes(stored!.passwordResetTokenHash!),
    'the console provider must never print the raw token or its hash',
  );
});
