/**
 * Plan selection during onboarding. Free is activated immediately; Pro and Premium are stored
 * as pending and can never become active without a verified payment (none exists yet). Every
 * new account chooses a plan once; older accounts and administrators never have to.
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
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { signSessionToken } from '../src/services/tokenService';
import { getSmsProvider, type SmsMessage } from '../src/services/sms';
import { flushBackgroundTasks } from '../src/services/backgroundTasks';

const PASSWORD = 'Strong-Passw0rd';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
const texts: SmsMessage[] = [];

function call(method: string, path: string, body?: unknown, cookie?: string) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function cookieFor(email: string, role: 'user' | 'admin' = 'user', extra: Record<string, unknown> = {}) {
  const user = await User.create({ name: email, email, role, passwordHash: await bcrypt.hash(PASSWORD, 4), ...extra });
  return { user, cookie: `${env.COOKIE_NAME}=${signSessionToken({ sub: user._id.toString(), role, email, name: email, tokenVersion: 0 })}` };
}

const choose = (cookie: string | undefined, body: unknown) => call('POST', '/api/auth/onboarding', body, cookie);

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
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

test('new email and mobile accounts must choose a plan first', async () => {
  const email = await call('POST', '/api/auth/signup', { name: 'E', email: 'e@example.com', password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal((await email.json()).data.onboardingRequired, true);

  const start = await (await call('POST', '/api/auth/signup/mobile', { name: 'M', country: 'IN', mobile: '9822200001', password: PASSWORD, confirmPassword: PASSWORD })).json();
  await flushBackgroundTasks();
  const code = /\b(\d{4})\b/.exec(texts.at(-1)!.body)![1]!;
  const verified = await call('POST', '/api/auth/signup/mobile/verify', { phone: start.data.phone, signupToken: start.data.signupToken, otp: code });
  assert.equal((await verified.json()).data.onboardingRequired, true);
});

test('Free is activated immediately and completes onboarding', async () => {
  const { cookie } = await cookieFor('free@example.com', 'user', { onboardingRequired: true });
  const res = await choose(cookie, { plan: 'free' });
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.plan, 'free');
  assert.equal(data.subscriptionStatus, 'active');
  assert.equal(data.effectivePlan, 'free');
  assert.equal(data.onboardingRequired, false);

  const stored = await User.findOne({ email: 'free@example.com' });
  assert.ok(stored!.subscriptionStartedAt);
  assert.equal(stored!.subscriptionExpiresAt, null);
  assert.ok(stored!.onboardingCompletedAt);
});

test('a paid plan is saved as pending and never activated — whatever the client claims', async () => {
  for (const plan of ['pro', 'premium'] as const) {
    const { cookie } = await cookieFor(`${plan}@example.com`, 'user', { onboardingRequired: true });
    const res = await choose(cookie, {
      plan,
      // All ignored: status, dates and price are the server's to decide.
      subscriptionStatus: 'active',
      subscriptionStartedAt: '2026-01-01',
      subscriptionExpiresAt: '2099-01-01',
      price: 0,
      paid: true,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.message, /payment is required/i);
    assert.equal(body.data.plan, plan);
    assert.equal(body.data.subscriptionStatus, 'pending');
    assert.equal(body.data.effectivePlan, 'free', 'they keep using Free until payment is verified');
    assert.equal(body.data.onboardingRequired, false, 'they are not stuck on the pricing page');

    const stored = await User.findOne({ email: `${plan}@example.com` });
    assert.equal(stored!.subscriptionStatus, 'pending');
    assert.equal(stored!.subscriptionStartedAt, null);
    assert.equal(stored!.subscriptionExpiresAt, null);
  }
});

test('a pending paid plan can be swapped for Free, which activates', async () => {
  const { cookie } = await cookieFor('switch@example.com', 'user', { onboardingRequired: true });
  await choose(cookie, { plan: 'pro' });
  const { data } = await (await choose(cookie, { plan: 'free' })).json();
  assert.deepEqual([data.plan, data.subscriptionStatus, data.effectivePlan], ['free', 'active', 'free']);
});

test('only real plan names are accepted', async () => {
  const { cookie } = await cookieFor('invalid@example.com', 'user', { onboardingRequired: true });
  for (const plan of ['enterprise', 'PRO', '', null, 49]) {
    assert.equal((await choose(cookie, { plan })).status, 400, String(plan));
  }
  assert.equal((await User.findOne({ email: 'invalid@example.com' }))!.plan, null);
});

test('choosing a plan needs a session, the account comes from it, and admins have none', async () => {
  assert.equal((await choose(undefined, { plan: 'free' })).status, 401);

  const victim = await cookieFor('victim@example.com', 'user', { onboardingRequired: true });
  const actor = await cookieFor('actor@example.com', 'user', { onboardingRequired: true });
  await choose(actor.cookie, { plan: 'premium', userId: victim.user._id.toString(), email: 'victim@example.com' });
  const victimAfter = await User.findById(victim.user._id);
  assert.equal(victimAfter!.plan, null, 'another account cannot be changed through the body');
  assert.equal(victimAfter!.onboardingRequired, true);

  const admin = await cookieFor('admin@example.com', 'admin');
  assert.equal((await choose(admin.cookie, { plan: 'free' })).status, 403);
  const adminLogin = await (await call('POST', '/api/auth/login', { email: 'admin@example.com', password: PASSWORD })).json();
  assert.equal(adminLogin.data.onboardingRequired, false, 'admins never see pricing onboarding');
});

test('existing accounts are never sent back to pricing', async () => {
  // An account from before plans existed: no plan fields at all.
  await User.create({ name: 'Old', email: 'old@example.com', passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const old = await (await call('POST', '/api/auth/login', { email: 'old@example.com', password: PASSWORD })).json();
  assert.equal(old.data.onboardingRequired, false);
  assert.equal(old.data.plan, null);
  assert.equal(old.data.effectivePlan, 'free');

  // And one that finished onboarding stays finished on every later sign-in.
  const { cookie } = await cookieFor('done@example.com', 'user', { onboardingRequired: true });
  await choose(cookie, { plan: 'free' });
  const again = await (await call('POST', '/api/auth/login', { email: 'done@example.com', password: PASSWORD })).json();
  assert.equal(again.data.onboardingRequired, false);
});
