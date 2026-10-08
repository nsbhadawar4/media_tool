/**
 * Mobile-number login, the abuse limits around mobile signup, the mock SMS provider's log
 * hygiene, and the users email-index migration that makes email-less accounts possible.
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
import { PendingPhoneSignup } from '../src/models/PendingPhoneSignup';
import { getSmsProvider, type SmsMessage } from '../src/services/sms';
import { MockSmsProvider } from '../src/services/sms/MockSmsProvider';
import { flushBackgroundTasks } from '../src/services/backgroundTasks';
import { MAX_SENDS } from '../src/services/phoneSignupService';
import { migrateUserEmailIndex } from '../src/config/userIndexes';

const PASSWORD = 'Strong-Passw0rd';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
const texts: SmsMessage[] = [];

function call(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), PendingPhoneSignup.init()]);
  getSmsProvider().send = async (message) => {
    texts.push(message);
  };
  await User.create([
    { name: 'Mobile One', phoneE164: '+919811100001', mobile: '+91 98111 00001', phoneVerifiedAt: new Date(), passwordHash: await bcrypt.hash(PASSWORD, 4) },
    { name: 'Mobile Off', phoneE164: '+919811100002', mobile: '+91 98111 00002', phoneVerifiedAt: new Date(), passwordHash: await bcrypt.hash(PASSWORD, 4), isActive: false },
    { name: 'Email User', email: 'email.user@example.com', passwordHash: await bcrypt.hash(PASSWORD, 4) },
  ]);
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
// Login
// ---------------------------------------------------------------------------------------------

test('a verified mobile account signs in with its number and password', async () => {
  const res = await call('/api/auth/login/mobile', { country: 'IN', mobile: '98111 00001', password: PASSWORD, rememberMe: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie') ?? '', /HttpOnly/i);
  const body = await res.json();
  assert.equal(body.data.phone, '+919811100001');
  assert.equal(body.data.email, null);
});

test('wrong password, unknown number and suspended account all get the same refusal', async () => {
  const wrong = await call('/api/auth/login/mobile', { country: 'IN', mobile: '9811100001', password: 'Wrong-Passw0rd' });
  const unknown = await call('/api/auth/login/mobile', { country: 'IN', mobile: '9811199999', password: PASSWORD });
  const suspended = await call('/api/auth/login/mobile', { country: 'IN', mobile: '9811100002', password: PASSWORD });
  const msgs = await Promise.all([wrong, unknown, suspended].map(async (r) => [r.status, (await r.json()).error.message]));
  assert.deepEqual(msgs[0], [401, 'Invalid mobile number or password']);
  assert.deepEqual(msgs[1], msgs[0]);
  assert.deepEqual(msgs[2], msgs[0]);
});

test('email login is unchanged', async () => {
  const res = await call('/api/auth/login', { email: 'email.user@example.com', password: PASSWORD });
  assert.equal(res.status, 200);
});

// ---------------------------------------------------------------------------------------------
// Abuse limits
// ---------------------------------------------------------------------------------------------

test('a pending signup stops texting after the send cap', async () => {
  const res = await call('/api/auth/signup/mobile', { name: 'Cap', country: 'IN', mobile: '9811100010', password: PASSWORD, confirmPassword: PASSWORD });
  const { data } = await res.json();
  await flushBackgroundTasks();
  await PendingPhoneSignup.updateOne(
    { phoneE164: '+919811100010' },
    { $set: { sendCount: MAX_SENDS, lastSentAt: new Date(Date.now() - 120_000) } },
  );
  const before = texts.length;
  const resend = await call('/api/auth/signup/mobile/resend', { phone: '+919811100010', signupToken: data.signupToken });
  await flushBackgroundTasks();
  assert.equal(resend.status, 200);
  assert.equal(texts.length, before, 'no further texts once the cap is reached');
});

test('starting signups is rate limited per address', async () => {
  // One request was already spent above; keep going until the limiter answers.
  let status = 0;
  for (let i = 0; i < 12 && status !== 429; i++) {
    status = (await call('/api/auth/signup/mobile', { name: 'x', country: 'IN', mobile: '1', password: 'x', confirmPassword: 'x' })).status;
  }
  assert.equal(status, 429);
});

// ---------------------------------------------------------------------------------------------
// Mock provider log hygiene
// ---------------------------------------------------------------------------------------------

test('the mock provider never sends, and only logs the code outside production', async () => {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  try {
    await new MockSmsProvider(true).send({ to: '+919811100099', body: '4821 is your code' });
    await new MockSmsProvider(false).send({ to: '+919811100099', body: '4821 is your code' });
  } finally {
    console.warn = original;
  }
  assert.match(lines[0]!, /4821/, 'development log carries the code for local testing');
  assert.doesNotMatch(lines[1]!, /4821/, 'production log withholds it');
  assert.doesNotMatch(lines[1]!, /9811100099/, 'and masks the number');
});

// ---------------------------------------------------------------------------------------------
// Email index migration
// ---------------------------------------------------------------------------------------------

test('the legacy unique email index is replaced without ever dropping uniqueness', async () => {
  const legacy = mongoose.connection.collection('legacy_users');
  await legacy.createIndex({ email: 1 }, { unique: true });
  await legacy.insertOne({ email: 'a@example.com' });

  assert.equal(await migrateUserEmailIndex(legacy), 'migrated');
  const names = (await legacy.indexes()).map((i) => i.name);
  assert.ok(names.includes('email_unique_present'));
  assert.ok(!names.includes('email_1'));

  await legacy.insertMany([{ phone: '1' }, { phone: '2' }]);
  await assert.rejects(legacy.insertOne({ email: 'a@example.com' }), /E11000/, 'duplicate emails are still refused');
  assert.equal(await migrateUserEmailIndex(legacy), 'already-done', 'idempotent');
});
