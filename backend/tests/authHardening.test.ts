/**
 * Production-hardening of authentication:
 *  - OTP attempt limits hold under parallel guessing (both mobile signup and password reset)
 *  - password-reset codes are stored keyed (HMAC), and an account gets a limited number per day
 *  - rate-limit counters live in MongoDB (shared by every serverless instance), and failed
 *    sign-ins are also limited per account, whatever address they come from
 *  - state-changing requests from another site are refused (CSRF)
 *
 * Requests carry their own X-Forwarded-For address (one trusted hop), so the per-IP limiters see
 * many clients — the distributed attacker these defences exist for.
 */
import './setupTestEnv';
import './helpers/setupTrustProxy';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { PendingPhoneSignup } from '../src/models/PendingPhoneSignup';
import { RateLimitWindow } from '../src/middleware/mongoRateLimitStore';
import { getSmsProvider, type SmsMessage } from '../src/services/sms';
import { getEmailProvider } from '../src/services/email';
import { flushBackgroundTasks } from '../src/services/backgroundTasks';
import { hashPasswordResetOtp, MAX_RESET_CODES_PER_DAY } from '../src/services/passwordResetService';

const PASSWORD = 'Strong-Passw0rd';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
const texts: SmsMessage[] = [];
const emails: Array<{ to: string; text: string }> = [];

let ipCounter = 0;
const nextIp = () => `198.51.100.${(ipCounter++ % 250) + 1}`;

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'x-forwarded-for': nextIp(), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  await flushBackgroundTasks();
  const json = (await res.json().catch(() => null)) as { data?: any; error?: { message: string; code?: string } } | null;
  return { status: res.status, data: json?.data, error: json?.error };
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), PendingPhoneSignup.init(), RateLimitWindow.init()]);
  getSmsProvider().send = async (m) => {
    texts.push(m);
  };
  getEmailProvider().send = async (m) => {
    emails.push({ to: m.to, text: m.text });
  };
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

// ------------------------------------------------------------------------------------ OTP races

test('mobile signup: 30 parallel wrong guesses still get only 5 attempts', async () => {
  const phone = '+919833344455';
  const start = await call('POST', '/api/auth/signup/mobile', { name: 'Race', country: 'IN', mobile: '9833344455', password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(start.status, 200);
  const code = /\b(\d{4})\b/.exec(texts.at(-1)!.body)![1]!;
  const wrong = code === '0000' ? '1111' : '0000';

  const answers = await Promise.all(
    Array.from({ length: 30 }, () => call('POST', '/api/auth/signup/mobile/verify', { phone, signupToken: start.data.signupToken, otp: wrong })),
  );
  const incorrect = answers.filter((a) => a.error?.code === 'OTP_INCORRECT').length;
  assert.ok(incorrect <= 4, `at most 4 "incorrect" answers before the lock (got ${incorrect})`);
  assert.equal((await PendingPhoneSignup.findOne({ phoneE164: phone }))!.otpAttempts, 5, 'exactly five attempts were spent');

  const right = await call('POST', '/api/auth/signup/mobile/verify', { phone, signupToken: start.data.signupToken, otp: code });
  assert.equal(right.error?.code, 'OTP_LOCKED');
  assert.equal(await User.countDocuments({ phoneE164: phone }), 0);
});

test('password reset: 30 parallel wrong guesses still get only 5 attempts', async () => {
  const user = await User.create({ name: 'Reset Race', email: 'race@example.com', passwordHash: await bcrypt.hash(PASSWORD, 4) });
  await User.updateOne(
    { _id: user._id },
    { passwordResetOtpHash: hashPasswordResetOtp(user._id.toString(), '4321'), passwordResetOtpExpiresAt: new Date(Date.now() + 600_000), passwordResetOtpAttempts: 0 },
  );
  await Promise.all(Array.from({ length: 30 }, () => call('POST', '/api/auth/verify-otp', { email: 'race@example.com', otp: '1111' })));
  const stored = await User.findById(user._id).select('+passwordResetOtpAttempts');
  assert.equal(stored!.passwordResetOtpAttempts, 5);
  assert.equal((await call('POST', '/api/auth/verify-otp', { email: 'race@example.com', otp: '4321' })).status, 400, 'the right code is refused once locked');
});

// ------------------------------------------------------------------------------------ reset codes

test('a password-reset code is stored as a keyed hash, never a plain hash of the digits', async () => {
  const user = await User.create({ name: 'Hash', email: 'hash@example.com', passwordHash: await bcrypt.hash(PASSWORD, 4) });
  assert.equal((await call('POST', '/api/auth/forgot-password', { email: 'hash@example.com' })).status, 200);
  const code = /\b(\d{4})\b/.exec(emails.findLast((e) => e.to === 'hash@example.com')!.text)![1]!;
  const stored = (await User.findById(user._id).select('+passwordResetOtpHash'))!.passwordResetOtpHash!;
  assert.notEqual(stored, crypto.createHash('sha256').update(code).digest('hex'));
  assert.equal(stored, hashPasswordResetOtp(user._id.toString(), code));
  assert.equal((await call('POST', '/api/auth/verify-otp', { email: 'hash@example.com', otp: code })).status, 200);
});

test(`an account gets at most ${MAX_RESET_CODES_PER_DAY} reset codes a day, with the usual neutral answer`, async () => {
  const user = await User.create({ name: 'Cap', email: 'cap@example.com', passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const sentTo = () => emails.filter((e) => e.to === 'cap@example.com').length;
  for (let i = 0; i < MAX_RESET_CODES_PER_DAY + 2; i++) {
    // Past the 60-second cooldown each time, from a different address each time.
    await User.updateOne({ _id: user._id }, { passwordResetOtpLastSentAt: new Date(Date.now() - 120_000) });
    const res = await call('POST', '/api/auth/forgot-password', { email: 'cap@example.com' });
    assert.equal(res.status, 200, 'same answer whether or not a code went out');
  }
  assert.equal(sentTo(), MAX_RESET_CODES_PER_DAY);

  // A day later the allowance is back.
  await User.updateOne({ _id: user._id }, { passwordResetSendWindowStartedAt: new Date(Date.now() - 86_400_001), passwordResetOtpLastSentAt: new Date(Date.now() - 120_000) });
  await call('POST', '/api/auth/forgot-password', { email: 'cap@example.com' });
  assert.equal(sentTo(), MAX_RESET_CODES_PER_DAY + 1);
});

test('two simultaneous reset requests issue one code, not two', async () => {
  await User.create({ name: 'Twice', email: 'twice@example.com', passwordHash: await bcrypt.hash(PASSWORD, 4) });
  await Promise.all(Array.from({ length: 8 }, () => call('POST', '/api/auth/forgot-password', { email: 'twice@example.com' })));
  assert.equal(emails.filter((e) => e.to === 'twice@example.com').length, 1);
});

// ------------------------------------------------------------------------------------ rate limits

test('failed sign-ins are limited per account, across any number of addresses', async () => {
  await User.create({ name: 'Target', email: 'target@example.com', passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const statuses: number[] = [];
  for (let i = 0; i < 21; i++) {
    statuses.push((await call('POST', '/api/auth/login', { email: 'Target@Example.com', password: `Wrong-Passw0rd${i}` })).status);
  }
  assert.deepEqual(statuses.slice(0, 20), Array(20).fill(401), 'each from a fresh address, so only the account limit applies');
  assert.equal(statuses[20], 429);
  // Even the right password waits out the window — and other accounts are unaffected.
  assert.equal((await call('POST', '/api/auth/login', { email: 'target@example.com', password: PASSWORD })).status, 429);
  await User.create({ name: 'Other', email: 'other@example.com', passwordHash: await bcrypt.hash(PASSWORD, 4) });
  assert.equal((await call('POST', '/api/auth/login', { email: 'other@example.com', password: PASSWORD })).status, 200);
  // A made-up address is limited exactly the same way, so the limit reveals nothing.
  for (let i = 0; i < 20; i++) await call('POST', '/api/auth/login', { email: 'nobody@example.com', password: `Wrong-Passw0rd${i}` });
  assert.equal((await call('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'x' })).status, 429);
});

test('rate-limit counters live in MongoDB, so every serverless instance shares them', async () => {
  const ip = '203.0.113.77';
  const hit = () => call('POST', '/api/auth/signup/mobile', {}, { 'x-forwarded-for': ip });
  for (let i = 0; i < 10; i++) assert.equal((await hit()).status, 400);
  assert.equal((await hit()).status, 429);

  const window = await RateLimitWindow.findById(`sms-send-ip:${ip}`).lean();
  assert.ok(window, 'the window is a database row');
  assert.ok(window!.count >= 10);
  assert.ok(window!.resetAt.getTime() > Date.now(), 'and expires by itself (TTL index on resetAt)');
  const ttl = (await RateLimitWindow.collection.indexes()).find((i) => i.key.resetAt === 1);
  assert.equal(ttl?.expireAfterSeconds, 0);

  // The database row is the only state: clear it and the limit is lifted for everyone.
  await RateLimitWindow.deleteOne({ _id: `sms-send-ip:${ip}` });
  assert.equal((await hit()).status, 400);
});

// ------------------------------------------------------------------------------------ CSRF

test('state-changing requests from another site are refused; the app itself and non-browsers are not', async () => {
  const body = { email: 'csrf@example.com', password: 'Wrong-Passw0rd' };
  const crossSite = await call('POST', '/api/auth/login', body, { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' });
  assert.deepEqual([crossSite.status, crossSite.error?.code], [403, 'CROSS_SITE_REQUEST']);

  const foreignOrigin = await call('POST', '/api/auth/logout', undefined, { origin: 'https://evil.example' });
  assert.equal(foreignOrigin.status, 403, 'older browsers without Sec-Fetch-Site: judged by Origin');
  assert.equal((await call('POST', '/api/auth/onboarding', { plan: 'premium' }, { origin: 'null' })).status, 403, 'opaque origins too');

  const host = new URL(baseUrl).host;
  assert.equal((await call('POST', '/api/auth/login', body, { 'sec-fetch-site': 'same-origin', origin: baseUrl })).status, 401, 'the app itself gets through to the real check');
  assert.equal((await call('POST', '/api/auth/login', body, { origin: `http://${host}` })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', body, { origin: 'http://localhost:3000' })).status, 401, 'configured frontend origins pass');
  assert.equal((await call('POST', '/api/auth/login', body)).status, 401, 'no browser headers: not a forgeable request');

  // Reading is never blocked.
  assert.equal((await call('GET', '/api/auth/google/config', undefined, { 'sec-fetch-site': 'cross-site' })).status, 200);

  // HTML-form bodies aren't parsed at all.
  const form = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': nextIp() },
    body: 'email=csrf%40example.com&password=Wrong-Passw0rd',
  });
  assert.equal(form.status, 400);
});
