/**
 * In production the mock SMS provider can't deliver anything, so mobile signup must say it is
 * unavailable — never answer "we sent you a code" — and must store nothing. Mobile *login*
 * doesn't send texts and keeps working.
 */
import './setupTestEnv';
import './helpers/setupProductionEnv';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { PendingPhoneSignup } from '../src/models/PendingPhoneSignup';
import { PhoneSendQuota } from '../src/models/PhoneSendQuota';
import { getSmsProvider, isSmsDeliveryAvailable } from '../src/services/sms';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let sends = 0;

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  getSmsProvider().send = async () => {
    sends++;
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

test('this file really runs as production with the mock provider', () => {
  assert.equal(env.isProduction, true);
  assert.equal(getSmsProvider().name, 'mock');
  assert.equal(isSmsDeliveryAvailable(), false);
});

test('the sign-up form is told mobile signup is unavailable', async () => {
  const body = await (await fetch(`${baseUrl}/api/auth/signup/mobile/config`)).json();
  assert.deepEqual(body.data, { enabled: false });
});

test('starting or resending fails safely: a clear 503, nothing stored, nothing "sent"', async () => {
  const startRes = await post('/api/auth/signup/mobile', { name: 'P', country: 'IN', mobile: '9855500001', password: 'Strong-Passw0rd', confirmPassword: 'Strong-Passw0rd' });
  const start = await startRes.json();
  assert.equal(startRes.status, 503);
  assert.equal(start.error.code, 'SMS_UNAVAILABLE');
  assert.match(start.error.message, /isn’t available/);
  assert.doesNotMatch(JSON.stringify(start), /sent/i, 'never claims a code was sent');

  const resendRes = await post('/api/auth/signup/mobile/resend', { phone: '+919855500001', signupToken: 'a'.repeat(64) });
  assert.equal(resendRes.status, 503);

  assert.equal(sends, 0);
  assert.equal(await PendingPhoneSignup.countDocuments({}), 0);
  assert.equal(await PhoneSendQuota.countDocuments({}), 0);
});

test('mobile login still works — it sends no texts', async () => {
  await User.create({ name: 'M', phoneE164: '+919855500002', phoneVerifiedAt: new Date(), passwordHash: await bcrypt.hash('Strong-Passw0rd', 4) });
  const res = await post('/api/auth/login/mobile', { country: 'IN', mobile: '9855500002', password: 'Strong-Passw0rd' });
  assert.equal(res.status, 200);
});
