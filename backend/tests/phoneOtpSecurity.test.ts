/**
 * Security of the mobile-signup OTP: what is stored, how guessing, expiry, reuse and resends
 * are bounded, what each kind of caller is told, and what reaches the logs.
 *
 * Starts and resends share a 10-per-hour per-address limit, and this file runs in its own process
 * with its own limiter — the tests below use exactly that budget, so add new ones elsewhere.
 */
import './setupTestEnv';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { PendingPhoneSignup } from '../src/models/PendingPhoneSignup';
import { PhoneSendQuota } from '../src/models/PhoneSendQuota';
import { getSmsProvider, isSmsDeliveryAvailable, type SmsMessage } from '../src/services/sms';
import { MockSmsProvider } from '../src/services/sms/MockSmsProvider';
import { flushBackgroundTasks } from '../src/services/backgroundTasks';
import { MAX_SENDS, MAX_SENDS_PER_PHONE_PER_DAY, OTP_MAX_ATTEMPTS } from '../src/services/phoneSignupService';

const PASSWORD = 'Strong-Passw0rd';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
const texts: SmsMessage[] = [];

function post(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
async function start(mobile: string) {
  const res = await post('/api/auth/signup/mobile', { name: 'OTP Tester', country: 'IN', mobile, password: PASSWORD, confirmPassword: PASSWORD });
  await flushBackgroundTasks();
  return { status: res.status, body: await res.json() };
}
async function resend(phone: string, signupToken: string) {
  const res = await post('/api/auth/signup/mobile/resend', { phone, signupToken });
  await flushBackgroundTasks();
  return { status: res.status, body: await res.json() };
}
async function verify(phone: string, signupToken: string, otp: string) {
  const res = await post('/api/auth/signup/mobile/verify', { phone, signupToken, otp });
  const body = await res.json();
  return { status: res.status, code: body.error?.code ?? null, message: body.error?.message ?? body.message, body };
}
const codeFor = (to: string) => {
  const t = [...texts].reverse().find((m) => m.to === to);
  return t ? (/\b(\d{4})\b/.exec(t.body)?.[1] ?? null) : null;
};
const textsTo = (to: string) => texts.filter((t) => t.to === to).length;
/** The signup token of the browser that started +919844400005, shared by the next two tests. */
let ownerToken = '';
const wrongOf = (code: string) => (code === '0000' ? '1111' : '0000');

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), PendingPhoneSignup.init(), PhoneSendQuota.init()]);
  getSmsProvider().send = async (m) => {
    texts.push(m);
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

// ---------------------------------------------------------------------------------------------

test('the code is never returned, and is stored only as a keyed hash', async () => {
  const { status, body } = await start('9844400001');
  assert.equal(status, 200);
  const code = codeFor('+919844400001')!;
  assert.ok(!Object.keys(body.data).some((k) => /otp|code/i.test(k)), 'no code field in the response');

  const pending = await PendingPhoneSignup.findOne({ phoneE164: '+919844400001' }).lean();
  assert.match(pending!.otpHash!, /^[0-9a-f]{64}$/);
  assert.notEqual(pending!.otpHash, code);
  // Keyed with the server secret: a plain hash of the 4 digits would be trivially reversible.
  assert.notEqual(pending!.otpHash, crypto.createHash('sha256').update(code).digest('hex'));
  for (const [field, value] of Object.entries(pending!)) {
    assert.notEqual(String(value), code, `the code itself is not stored (${field})`);
  }
});

test('wrong codes count down to a lock-out after 5, and the right code is then refused', async () => {
  const { body } = await start('9844400002');
  const phone = '+919844400002';
  const code = codeFor(phone)!;

  for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) {
    const r = await verify(phone, body.data.signupToken, wrongOf(code));
    assert.equal(r.status, 400);
    assert.equal(r.code, 'OTP_INCORRECT');
    assert.equal(r.body.error.details.attemptsRemaining, OTP_MAX_ATTEMPTS - i);
    assert.match(r.message, new RegExp(`${OTP_MAX_ATTEMPTS - i} attempts? left`));
  }
  const fifth = await verify(phone, body.data.signupToken, wrongOf(code));
  assert.equal(fifth.code, 'OTP_LOCKED');
  assert.match(fifth.message, /Too many incorrect attempts/);

  const right = await verify(phone, body.data.signupToken, code);
  assert.equal(right.code, 'OTP_LOCKED', 'locked even for the right code');
  assert.equal(await User.countDocuments({ phoneE164: phone }), 0);
});

test('the code expires after 10 minutes', async () => {
  const { body } = await start('9844400003');
  const phone = '+919844400003';
  const pending = await PendingPhoneSignup.findOne({ phoneE164: phone });
  const lifetime = pending!.otpExpiresAt.getTime() - pending!.lastSentAt.getTime();
  assert.equal(lifetime, 10 * 60 * 1000);

  await PendingPhoneSignup.updateOne({ phoneE164: phone }, { $set: { otpExpiresAt: new Date(Date.now() - 1) } });
  const r = await verify(phone, body.data.signupToken, codeFor(phone)!);
  assert.equal(r.code, 'OTP_EXPIRED');
  assert.match(r.message, /expired/);
});

test('a code works once, and nothing can be replayed afterwards', async () => {
  const { body } = await start('9844400004');
  const phone = '+919844400004';
  const code = codeFor(phone)!;
  assert.equal((await verify(phone, body.data.signupToken, code)).status, 201);

  const replay = await verify(phone, body.data.signupToken, code);
  assert.equal(replay.status, 400);
  assert.equal(replay.code, 'OTP_INVALID');
  assert.equal(await User.countDocuments({ phoneE164: phone }), 1);
  assert.equal(await PendingPhoneSignup.countDocuments({ phoneE164: phone }), 0, 'the pending record is gone');
});

test('only the browser that started a signup learns why a code failed', async () => {
  const stranger = 'a'.repeat(64);
  // The locked signup from above, an expired one, and a number with no signup at all: identical.
  for (const phone of ['+919844400002', '+919844400003', '+919899999999']) {
    const r = await verify(phone, stranger, '1234');
    assert.deepEqual([r.status, r.code, r.message], [400, 'OTP_INVALID', 'That code is invalid or has expired.'], phone);
  }
  const lockedAfter = await PendingPhoneSignup.findOne({ phoneE164: '+919844400003' });
  assert.equal(lockedAfter!.otpAttempts, 0, 'strangers’ guesses are not counted against the real signup');
});

test('resends wait 60 seconds, and a restart from elsewhere can’t take over the signup', async () => {
  const phone = '+919844400005';
  const first = await start('9844400005');
  ownerToken = first.body.data.signupToken;
  const firstCode = codeFor(phone)!;
  const sent = textsTo(phone);

  const early = await resend(phone, first.body.data.signupToken);
  assert.equal(early.status, 200);
  assert.ok(early.body.data.resendInSeconds > 0 && early.body.data.resendInSeconds <= 60);
  assert.equal(textsTo(phone), sent, 'no text inside the cooldown');

  // Someone else starts a signup for the same number within the cooldown: nothing is sent or
  // overwritten, and their token can't verify the real code.
  const other = await start('9844400005');
  assert.equal(textsTo(phone), sent);
  assert.equal((await verify(phone, other.body.data.signupToken, firstCode)).code, 'OTP_INVALID');

  // The real signup is untouched — but leave it unverified for the next test.
  const pending = await PendingPhoneSignup.findOne({ phoneE164: phone });
  assert.equal(pending!.otpAttempts, 0);
});

test('a signup stops texting after its send cap', async () => {
  const phone = '+919844400005';
  const pending = await PendingPhoneSignup.findOne({ phoneE164: phone });
  await PendingPhoneSignup.updateOne({ _id: pending!._id }, { $set: { sendCount: MAX_SENDS, lastSentAt: new Date(Date.now() - 120_000) } });
  const sent = textsTo(phone);
  // The owner asks, past the cooldown: still no text.
  const r = await resend(phone, ownerToken);
  assert.equal(r.status, 200);
  assert.equal(textsTo(phone), sent, 'no further texts once the cap is reached');
});

test('one number can only be texted so often per day, whatever the address or signup', async () => {
  const phone = '+919844400006';
  await PhoneSendQuota.create({
    phoneE164: phone,
    windowStartedAt: new Date(),
    count: MAX_SENDS_PER_PHONE_PER_DAY,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  const blocked = await start('9844400006');
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error.message, /Too many codes have been requested for this number/);
  assert.equal(textsTo(phone), 0);
  assert.equal(await PendingPhoneSignup.countDocuments({ phoneE164: phone }), 0, 'nothing stored either');

  // Once the 24-hour window has passed, the number can be texted again.
  await PhoneSendQuota.updateOne({ phoneE164: phone }, { $set: { windowStartedAt: new Date(Date.now() - 86_400_001) } });
  const later = await start('9844400006');
  assert.equal(later.status, 200);
  assert.equal(textsTo(phone), 1);
  assert.equal((await PhoneSendQuota.findOne({ phoneE164: phone }))!.count, 1, 'a fresh window');
});

test('guessing codes is rate limited per address', async () => {
  let status = 0;
  for (let i = 0; i < 40 && status !== 429; i++) {
    status = (await post('/api/auth/signup/mobile/verify', { phone: '+919899999998', signupToken: 'c'.repeat(64), otp: '1234' })).status;
  }
  assert.equal(status, 429);
});

test('outside development the mock never logs a code, and it never claims to deliver', async () => {
  assert.equal(env.isDevelopment, false);
  const provider = new MockSmsProvider(env.isDevelopment);
  assert.equal(provider.delivers, false);
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  try {
    await provider.send({ to: '+919844400099', body: '4821 is your Media Tool verification code.' });
  } finally {
    console.warn = original;
  }
  assert.doesNotMatch(lines.join('\n'), /4821/);
  assert.ok(isSmsDeliveryAvailable(), 'the mock is usable outside production');
});
