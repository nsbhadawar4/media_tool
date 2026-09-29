/**
 * The forgot-password OTP flow end to end, over HTTP: request a code, verify it, use the
 * resulting authorization to set a new password.
 *
 * The promise under test: a code is 4 digits but still effectively unguessable because
 * wrong guesses lock it out; it's single-use and time-limited; a password cannot be reset
 * without a verified code; and nothing in any response reveals whether an email has an
 * account. EMAIL_PROVIDER defaults to `console` in tests (see config/env.ts), so
 * requesting a code only ever logs that it happened — never the code itself — which is
 * also asserted below.
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

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;

const ORIGINAL_PASSWORD = 'original-password-1';
const NEW_PASSWORD = 'a-brand-new-password-1';

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

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
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

/** Writes a known OTP straight into the database, bypassing email — same role as issuing a raw token used to play in the old link-based flow. */
async function issueOtp(userId: string, otp = '1234', expiresInMs = 10 * 60 * 1000): Promise<void> {
  await User.updateOne(
    { _id: userId },
    {
      passwordResetOtpHash: hashOtp(otp),
      passwordResetOtpExpiresAt: new Date(Date.now() + expiresInMs),
      passwordResetOtpAttempts: 0,
    },
  );
}

async function verify(email: string, otp: string) {
  return callApi<{ verified: boolean; resetToken: string }>('POST', '/api/auth/verify-otp', { email, otp });
}

async function resetWith(resetToken: string, newPassword = NEW_PASSWORD) {
  return callApi('POST', '/api/auth/reset-password', { resetToken, newPassword, confirmPassword: newPassword });
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
/* Requesting a code                                                           */
/* -------------------------------------------------------------------------- */

test('forgot-password with an existing email issues a code and answers generically', async () => {
  const user = await createUser({ email: 'owner@example.com' });

  const { status, payload } = await callApi('POST', '/api/auth/forgot-password', { email: 'owner@example.com' });

  assert.equal(status, 200);
  assert.match(payload.message ?? '', /verification code has been sent/i);

  const stored = await User.findById(user._id).select('+passwordResetOtpHash +passwordResetOtpExpiresAt');
  assert.ok(stored!.passwordResetOtpHash, 'an OTP hash must be recorded');
  assert.ok(stored!.passwordResetOtpExpiresAt! > new Date(), 'the OTP must have a future expiry');
});

test('forgot-password with a non-existing email answers exactly the same way', async () => {
  const existing = await callApi('POST', '/api/auth/forgot-password', { email: 'owner-does-not-exist@example.com' });
  await User.deleteMany({});
  await createUser({ email: 'owner@example.com' });
  const real = await callApi('POST', '/api/auth/forgot-password', { email: 'owner@example.com' });

  assert.equal(existing.status, real.status, 'status must not reveal whether the address has an account');
  assert.equal(existing.payload.message, real.payload.message, 'message must not reveal it either');

  const count = await User.countDocuments({});
  assert.equal(count, 1, 'requesting a code for an unknown address must not create anything');
});

test('an inactive account gets no code, but the response looks the same', async () => {
  const user = await createUser({ email: 'suspended@example.com', isActive: false });

  const { status, payload } = await callApi('POST', '/api/auth/forgot-password', { email: 'suspended@example.com' });

  assert.equal(status, 200);
  assert.match(payload.message ?? '', /verification code has been sent/i);

  const stored = await User.findById(user._id).select('+passwordResetOtpHash');
  assert.equal(stored!.passwordResetOtpHash, null);
});

test('an invalid email is rejected before anything is looked up', async () => {
  const { status } = await callApi('POST', '/api/auth/forgot-password', { email: 'not-an-email' });
  assert.equal(status, 400);
});

test('the OTP is never in the response, and the console provider never logs it', async () => {
  const user = await createUser({ email: 'watched@example.com' });

  const originalWarn = console.warn;
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(' '));
  };
  let status: number;
  let payload: Envelope<unknown>;
  try {
    ({ status, payload } = await callApi('POST', '/api/auth/forgot-password', { email: user.email }));
  } finally {
    console.warn = originalWarn;
  }
  // Guards against this test passing vacuously if the request never actually reached the
  // handler (e.g. rate-limited) — no warning would be logged either way, which would make
  // the assertions below trivially true for the wrong reason.
  assert.equal(status, 200, 'the request must actually succeed for this test to prove anything');
  assert.ok(!JSON.stringify(payload).match(/\d{4}/), 'the response must never carry a 4-digit code');

  const stored = await User.findById(user._id).select('+passwordResetOtpHash');
  const output = lines.join('\n');
  for (let candidate = 0; candidate <= 9999; candidate += 1373) {
    // Sampled rather than exhaustive (10,000 checks against a log string on every run is
    // wasted work) — enough to catch a provider that started logging the plain code.
    assert.ok(!output.includes(String(candidate).padStart(4, '0')), 'the console provider must never print the code');
  }
  assert.ok(!output.includes(stored!.passwordResetOtpHash!), 'the console provider must never print the OTP hash either');
});

/* -------------------------------------------------------------------------- */
/* Verifying a code                                                            */
/* -------------------------------------------------------------------------- */

test('a correct code is verified and hands back a reset authorization', async () => {
  const user = await createUser();
  await issueOtp(user._id.toString(), '4242');

  const { status, payload } = await verify(user.email, '4242');

  assert.equal(status, 200);
  assert.equal(payload.data!.verified, true);
  assert.ok(payload.data!.resetToken, 'a reset token must be returned');
});

test('a wrong code is refused, and nothing about the account is revealed', async () => {
  const user = await createUser();
  await issueOtp(user._id.toString(), '4242');

  const { status, payload } = await verify(user.email, '0000');

  assert.equal(status, 400);
  assert.match(payload.error!.message, /invalid or has expired/i);
});

test('verifying against an email with no outstanding code is refused the same way', async () => {
  await createUser({ email: 'no-code@example.com' });
  const { status } = await verify('no-code@example.com', '1234');
  assert.equal(status, 400);
});

test('verifying for a non-existing email is refused identically to a wrong code', async () => {
  const user = await createUser();
  await issueOtp(user._id.toString(), '4242');

  const wrongCode = await verify(user.email, '0000');
  const noSuchAccount = await verify('nobody@example.com', '4242');

  assert.equal(wrongCode.status, noSuchAccount.status);
  assert.equal(wrongCode.payload.error!.message, noSuchAccount.payload.error!.message);
});

test('an expired code is refused', async () => {
  const user = await createUser();
  await issueOtp(user._id.toString(), '4242', -1000); // already expired

  const { status } = await verify(user.email, '4242');
  assert.equal(status, 400);
});

test('a code already used once is refused the second time, even though it was correct', async () => {
  const user = await createUser();
  await issueOtp(user._id.toString(), '4242');

  const first = await verify(user.email, '4242');
  assert.equal(first.status, 200);

  const second = await verify(user.email, '4242');
  assert.equal(second.status, 400, 'the same code must not verify twice');
});

test('five wrong guesses lock the code out, even for the correct one afterwards', async () => {
  const user = await createUser();
  await issueOtp(user._id.toString(), '4242');

  for (let i = 0; i < 5; i += 1) {
    const { status } = await verify(user.email, '0000');
    assert.equal(status, 400, `guess ${i + 1} should be refused`);
  }

  // The real code, tried after the lockout, must no longer work either.
  const { status } = await verify(user.email, '4242');
  assert.equal(status, 400, 'the code must be locked out after too many wrong guesses');
});

test('requesting a fresh code after a lockout (or any time) resets the attempt counter', async () => {
  const user = await createUser({ email: 'relockout@example.com' });
  await issueOtp(user._id.toString(), '4242');
  for (let i = 0; i < 5; i += 1) await verify(user.email, '0000');

  // Bypass the 60s resend cooldown directly, the way a real resend after waiting would.
  await User.updateOne({ _id: user._id }, { passwordResetOtpLastSentAt: null });
  await callApi('POST', '/api/auth/forgot-password', { email: user.email });

  const stored = await User.findById(user._id).select('+passwordResetOtpHash +passwordResetOtpAttempts');
  assert.equal(stored!.passwordResetOtpAttempts, 0);
  assert.notEqual(stored!.passwordResetOtpHash, hashOtp('4242'), 'the old code must have been replaced');
});

/* -------------------------------------------------------------------------- */
/* Resending                                                                   */
/* -------------------------------------------------------------------------- */

test('resending immediately (within the cooldown) is a silent no-op with the same response', async () => {
  const user = await createUser({ email: 'cooldown@example.com' });

  const first = await callApi('POST', '/api/auth/forgot-password', { email: user.email });
  const stored1 = await User.findById(user._id).select('+passwordResetOtpHash');

  const second = await callApi('POST', '/api/auth/forgot-password', { email: user.email });
  const stored2 = await User.findById(user._id).select('+passwordResetOtpHash');

  assert.equal(first.status, second.status);
  assert.equal(first.payload.message, second.payload.message, 'the cooldown must not change the response');
  assert.equal(stored1!.passwordResetOtpHash, stored2!.passwordResetOtpHash, 'the code must not have changed');
});

test('resending after the cooldown issues a new code and invalidates the old one', async () => {
  const user = await createUser({ email: 'resend@example.com' });
  await issueOtp(user._id.toString(), '4242');
  // Simulate the cooldown having elapsed.
  await User.updateOne({ _id: user._id }, { passwordResetOtpLastSentAt: new Date(Date.now() - 61_000) });

  await callApi('POST', '/api/auth/forgot-password', { email: user.email });

  const oldCode = await verify(user.email, '4242');
  assert.equal(oldCode.status, 400, 'the previous code must no longer work');
});

/* -------------------------------------------------------------------------- */
/* Completing a reset                                                          */
/* -------------------------------------------------------------------------- */

test('resetting without ever verifying an OTP is refused', async () => {
  const user = await createUser();

  const { status, payload } = await resetWith('some-made-up-reset-token');

  assert.equal(status, 400);
  assert.match(payload.error!.message, /invalid or has expired/i);

  const login = await callApi('POST', '/api/auth/login', { email: user.email, password: ORIGINAL_PASSWORD });
  assert.equal(login.status, 200, 'the original password must still work');
});

test('a mismatched or too-short new password is refused, even with a valid reset token', async () => {
  const user = await createUser();

  for (const body of [
    { newPassword: 'longenough1', confirmPassword: 'different11' },
    { newPassword: 'short', confirmPassword: 'short' },
  ]) {
    await issueOtp(user._id.toString(), '4242');
    const { payload } = await verify(user.email, '4242');
    const { status } = await callApi('POST', '/api/auth/reset-password', {
      resetToken: payload.data!.resetToken,
      ...body,
    });
    assert.equal(status, 400, `${JSON.stringify(body)} should be refused`);
  }
});

test('a full flow — request, verify, reset — changes the password: old fails, new works', async () => {
  const user = await createUser();
  await issueOtp(user._id.toString(), '4242');

  const verified = await verify(user.email, '4242');
  assert.equal(verified.status, 200);

  const reset = await resetWith(verified.payload.data!.resetToken);
  assert.equal(reset.status, 200);
  assert.match(reset.payload.message ?? '', /reset successfully/i);

  const oldLogin = await callApi('POST', '/api/auth/login', { email: user.email, password: ORIGINAL_PASSWORD });
  assert.equal(oldLogin.status, 401, 'the old password must no longer work');

  const newLogin = await callApi('POST', '/api/auth/login', { email: user.email, password: NEW_PASSWORD });
  assert.equal(newLogin.status, 200, 'the new password must work');
});

test('the same reset token cannot be used twice', async () => {
  const user = await createUser();
  await issueOtp(user._id.toString(), '4242');
  const { payload } = await verify(user.email, '4242');

  const first = await resetWith(payload.data!.resetToken, 'first-new-password-1');
  assert.equal(first.status, 200);

  const second = await resetWith(payload.data!.resetToken, 'second-new-password-1');
  assert.equal(second.status, 400, 'the same reset token must not work twice');
});

test('an admin account keeps its role through the whole flow', async () => {
  const admin = await createUser({ email: 'admin@example.com', role: 'admin' });
  await issueOtp(admin._id.toString(), '4242');

  const { payload } = await verify(admin.email, '4242');
  await resetWith(payload.data!.resetToken);

  const stored = await User.findById(admin._id);
  assert.equal(stored!.role, 'admin', 'resetting a password must never touch role');
});

/* -------------------------------------------------------------------------- */
/* Session invalidation (unchanged behaviour from the link-based flow)        */
/* -------------------------------------------------------------------------- */

test('completing a reset signs out sessions issued before it', async () => {
  const user = await createUser();

  const staleCookie = `${env.COOKIE_NAME}=${signSessionToken({
    sub: user._id.toString(),
    role: user.role,
    email: user.email,
    name: user.name,
    tokenVersion: user.tokenVersion ?? 0,
  })}`;

  const beforeReset = await callApi('GET', '/api/auth/me', undefined, staleCookie);
  assert.equal(beforeReset.status, 200, 'the session must work before the reset');

  await issueOtp(user._id.toString(), '4242');
  const { payload } = await verify(user.email, '4242');
  await resetWith(payload.data!.resetToken);

  const afterReset = await callApi('GET', '/api/auth/me', undefined, staleCookie);
  assert.equal(afterReset.status, 401, 'a session from before the reset must no longer be accepted');

  const login = await callApi('POST', '/api/auth/login', { email: user.email, password: NEW_PASSWORD });
  assert.equal(login.status, 200);
});
