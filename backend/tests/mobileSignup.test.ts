/**
 * Mobile-number signup: the account exists only after the 4-digit code is verified, the code
 * is never readable or returned, and it expires, is single-use and locks after 5 wrong tries.
 *
 * Starts and resends share a per-address rate limit (10/hour), and each test file runs in its
 * own process with its own limiter, so this file keeps its total under that budget; login,
 * limits and the index migration are in mobileAuth.test.ts.
 */
import './setupTestEnv';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { PendingPhoneSignup } from '../src/models/PendingPhoneSignup';
import { getSmsProvider, type SmsMessage } from '../src/services/sms';
import { flushBackgroundTasks } from '../src/services/backgroundTasks';

const PASSWORD = 'Strong-Passw0rd';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
const texts: SmsMessage[] = [];

function call(path: string, body: unknown, cookie?: string) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function start(mobile: string, overrides: Record<string, unknown> = {}) {
  const res = await call('/api/auth/signup/mobile', {
    name: 'Asha Rao',
    country: 'IN',
    mobile,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    ...overrides,
  });
  await flushBackgroundTasks();
  return { status: res.status, body: await res.json() };
}

/** The code from the most recent text to `to` (the mock provider "sends" it). */
function lastCode(to: string): string | null {
  const msg = [...texts].reverse().find((t) => t.to === to);
  return msg ? (/\b(\d{4})\b/.exec(msg.body)?.[1] ?? null) : null;
}

const verify = (phone: string, signupToken: string, otp: string) => call('/api/auth/signup/mobile/verify', { phone, signupToken, otp });

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), PendingPhoneSignup.init()]);
  const provider = getSmsProvider();
  provider.send = async (message) => {
    texts.push(message);
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

test('invalid numbers, weak passwords and mismatches are refused with clear messages', async () => {
  const badNumber = await start('12345');
  assert.equal(badNumber.status, 400);
  assert.match(JSON.stringify(badNumber.body), /valid mobile number/i);

  const weak = await start('9876500001', { password: 'password', confirmPassword: 'password' });
  assert.equal(weak.status, 400);
  assert.match(JSON.stringify(weak.body), /uppercase letter|number/);

  assert.equal(await PendingPhoneSignup.countDocuments({}), 0, 'nothing is stored for an invalid request');
  assert.equal(texts.length, 0);
});

test('a valid number creates a pending signup, texts a code, and creates no account yet', async () => {
  const { status, body } = await start('98765 00002');
  assert.equal(status, 200);
  assert.equal(body.data.phone, '+919876500002', 'normalised to E.164');
  assert.match(body.data.maskedPhone, /^\+91 •+ 0002$/);
  assert.equal(body.data.expiresInSeconds, 600);
  assert.equal(body.data.resendInSeconds, 60);
  assert.match(body.data.signupToken, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(body.data).sort(), ['expiresInSeconds', 'maskedPhone', 'phone', 'resendInSeconds', 'signupToken']);

  const code = lastCode('+919876500002');
  assert.match(code ?? '', /^\d{4}$/, 'the code went out by text');

  const pending = await PendingPhoneSignup.findOne({ phoneE164: '+919876500002' }).lean();
  assert.ok(pending);
  assert.match(pending!.otpHash!, /^[0-9a-f]{64}$/, 'stored as a keyed hash');
  assert.notEqual(pending!.otpHash, code);
  assert.match(pending!.passwordHash, /^\$2[aby]\$/, 'password stored as bcrypt');
  assert.ok(!JSON.stringify(pending).includes(PASSWORD));
  assert.equal(await User.countDocuments({ phoneE164: '+919876500002' }), 0, 'not activated before verification');

  // Verify: the account appears, signed in, as a plain user with a verified phone and no email.
  const res = await verify('+919876500002', body.data.signupToken, code!);
  assert.equal(res.status, 201);
  const cookie = res.headers.get('set-cookie') ?? '';
  assert.match(cookie, /HttpOnly/i);
  const created = await res.json();
  assert.equal(created.data.role, 'user');
  assert.equal(created.data.email, null);
  assert.equal(created.data.phone, '+919876500002');
  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: cookie.split(';')[0]! } });
  assert.equal(me.status, 200);

  const user = await User.findOne({ phoneE164: '+919876500002' });
  assert.ok(user!.phoneVerifiedAt);
  assert.equal(await PendingPhoneSignup.countDocuments({ phoneE164: '+919876500002' }), 0, 'pending state is cleaned up');

  // Single use.
  const again = await verify('+919876500002', body.data.signupToken, code!);
  assert.equal(again.status, 400);
});

test('five wrong codes lock it — even the right one fails afterwards', async () => {
  const { body } = await start('9876500003');
  const code = lastCode('+919876500003')!;
  const wrong = code === '0000' ? '1111' : '0000';
  for (let i = 0; i < 5; i++) {
    assert.equal((await verify('+919876500003', body.data.signupToken, wrong)).status, 400);
  }
  assert.equal((await verify('+919876500003', body.data.signupToken, code)).status, 400);
  assert.equal(await User.countDocuments({ phoneE164: '+919876500003' }), 0);
});

test('a code only works from the browser that started the signup, and not after 10 minutes', async () => {
  const { body } = await start('9876500004');
  const code = lastCode('+919876500004')!;

  const otherToken = 'f'.repeat(64);
  assert.equal((await verify('+919876500004', otherToken, code)).status, 400);
  const afterBadToken = await PendingPhoneSignup.findOne({ phoneE164: '+919876500004' });
  assert.equal(afterBadToken!.otpAttempts, 0, 'a wrong token is not counted as a guess (no lock-out by strangers)');

  await PendingPhoneSignup.updateOne({ phoneE164: '+919876500004' }, { $set: { otpExpiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await verify('+919876500004', body.data.signupToken, code)).status, 400, 'expired');
});

test('resend honours the 60-second cooldown, and a new code replaces the old one', async () => {
  const { body } = await start('9876500005');
  const first = lastCode('+919876500005')!;
  const sentBefore = texts.length;

  const early = await call('/api/auth/signup/mobile/resend', { phone: '+919876500005', signupToken: body.data.signupToken });
  await flushBackgroundTasks();
  assert.equal(early.status, 200);
  assert.ok((await early.json()).data.resendInSeconds > 0);
  assert.equal(texts.length, sentBefore, 'no text inside the cooldown');

  await PendingPhoneSignup.updateOne({ phoneE164: '+919876500005' }, { $set: { lastSentAt: new Date(Date.now() - 61_000) } });
  const later = await call('/api/auth/signup/mobile/resend', { phone: '+919876500005', signupToken: body.data.signupToken });
  await flushBackgroundTasks();
  assert.equal(later.status, 200);
  assert.equal(texts.length, sentBefore + 1);
  const second = lastCode('+919876500005')!;

  if (second !== first) {
    assert.equal((await verify('+919876500005', body.data.signupToken, first)).status, 400, 'the old code is dead');
  }
  assert.equal((await verify('+919876500005', body.data.signupToken, second)).status, 201);

  // A second account without an email: the partial unique index allows any number of them.
  assert.equal(await User.countDocuments({ email: { $exists: false } }), 2);
});

test('a number that already has an account gets a notice, not a code — and the same answer', async () => {
  const fresh = await start('9876500006');
  const taken = { ...(await start('98765 00002')) }; // registered in an earlier test

  assert.equal(taken.status, fresh.status);
  assert.deepEqual(Object.keys(taken.body.data).sort(), Object.keys(fresh.body.data).sort());
  assert.equal(taken.body.message.replace(/\d{4}\.$/, ''), fresh.body.message.replace(/\d{4}\.$/, ''));

  const notice = [...texts].reverse().find((t) => t.to === '+919876500002')!;
  assert.match(notice.body, /already has an account/);
  assert.equal(lastCode('+919876500002') === null || !/verification code/.test(notice.body), true, 'no usable code was sent');

  const pending = await PendingPhoneSignup.findOne({ phoneE164: '+919876500002' });
  assert.equal(pending!.otpHash, null, 'nothing could ever verify a second account for it');
  assert.equal(await User.countDocuments({ phoneE164: '+919876500002' }), 1);
});
