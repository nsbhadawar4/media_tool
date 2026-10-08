/**
 * The account data model end to end: how each sign-up method shapes a user, that no identity
 * (email, phone, Google account) can ever belong to two users, account linking, onboarding and
 * plans — and who may change a subscription (the user may only *choose*; activating, cancelling
 * and expiry dates are administrator-only).
 */
import './setupTestEnv';
import './helpers/setupGoogleEnv';

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
import { ActivityLog } from '../src/models/ActivityLog';
import { signSessionToken } from '../src/services/tokenService';
import { setGoogleTokenVerifier, type GoogleIdentity } from '../src/services/googleAuthService';
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
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

async function sessionFor(email: string, role: 'user' | 'admin' = 'user', extra: Record<string, unknown> = {}) {
  const user = await User.create({ name: email, email, role, passwordHash: await bcrypt.hash(PASSWORD, 4), ...extra });
  return { user, cookie: `${env.COOKIE_NAME}=${signSessionToken({ sub: user._id.toString(), role, email, name: email, tokenVersion: 0 })}` };
}

async function google(identity: Partial<GoogleIdentity>) {
  const cfg = await fetch(`${baseUrl}/api/auth/google/config`);
  const { data } = await cfg.json();
  const cookie = (cfg.headers.get('set-cookie') ?? '').split(';')[0]!;
  const credential = `test-google-token.${Buffer.from(JSON.stringify({ emailVerified: true, name: 'G', ...identity, nonce: data.nonce })).toString('base64url')}`;
  return json(await call('POST', '/api/auth/google', { credential }, cookie));
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  getSmsProvider().send = async (m) => {
    texts.push(m);
  };
  setGoogleTokenVerifier(async (token) => {
    const [marker, payload] = token.split('.');
    if (marker !== 'test-google-token' || !payload) throw new Error('invalid token');
    const id = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Partial<GoogleIdentity>;
    return { sub: id.sub!, email: id.email!, emailVerified: id.emailVerified ?? false, name: id.name ?? null, nonce: id.nonce ?? null };
  });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  setGoogleTokenVerifier(null);
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

// ---------------------------------------------------------------------------------------------
// How each sign-up method shapes an account
// ---------------------------------------------------------------------------------------------

test('a new email user', async () => {
  const { status, body } = await json(await call('POST', '/api/auth/signup', { name: 'Email User', email: 'Email.User@Example.com', password: PASSWORD, confirmPassword: PASSWORD, role: 'admin' }));
  assert.equal(status, 201);
  const u = body.data;
  assert.deepEqual(
    { email: u.email, role: u.role, authProvider: u.authProvider, isEmailVerified: u.isEmailVerified, mobileVerified: u.mobileVerified, onboardingCompleted: u.onboardingCompleted, plan: u.plan, effectivePlan: u.effectivePlan },
    { email: 'email.user@example.com', role: 'user', authProvider: 'email', isEmailVerified: false, mobileVerified: false, onboardingCompleted: false, plan: null, effectivePlan: 'free' },
  );
});

test('a new mobile user', async () => {
  const start = await json(await call('POST', '/api/auth/signup/mobile', { name: 'Mobile User', country: 'IN', mobile: '9833300001', password: PASSWORD, confirmPassword: PASSWORD }));
  await flushBackgroundTasks();
  const otp = /\b(\d{4})\b/.exec(texts.at(-1)!.body)![1]!;
  const { status, body } = await json(await call('POST', '/api/auth/signup/mobile/verify', { phone: start.body.data.phone, signupToken: start.body.data.signupToken, otp }));
  assert.equal(status, 201);
  const u = body.data;
  assert.deepEqual(
    { email: u.email, phone: u.phone, role: u.role, authProvider: u.authProvider, mobileVerified: u.mobileVerified, onboardingCompleted: u.onboardingCompleted },
    { email: null, phone: '+919833300001', role: 'user', authProvider: 'mobile', mobileVerified: true, onboardingCompleted: false },
  );
});

test('a new Google user', async () => {
  const { status, body } = await google({ sub: 'g-model-1', email: 'Google.User@gmail.com' });
  assert.equal(status, 201);
  const u = body.data.user;
  assert.deepEqual(
    { email: u.email, role: u.role, authProvider: u.authProvider, isEmailVerified: u.isEmailVerified, googleLinked: u.googleLinked, onboardingCompleted: u.onboardingCompleted },
    { email: 'google.user@gmail.com', role: 'user', authProvider: 'google', isEmailVerified: true, googleLinked: true, onboardingCompleted: false },
  );
});

test('an existing user from before these fields existed', async () => {
  await User.collection.insertOne({
    name: 'Legacy',
    email: 'legacy@example.com',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    role: 'user',
    isActive: true,
    isEmailVerified: false,
    tokenVersion: 0,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  });
  const { status, body } = await json(await call('POST', '/api/auth/login', { email: 'legacy@example.com', password: PASSWORD }));
  assert.equal(status, 200);
  const u = body.data;
  assert.deepEqual(
    { authProvider: u.authProvider, onboardingRequired: u.onboardingRequired, onboardingCompleted: u.onboardingCompleted, plan: u.plan, subscriptionStatus: u.subscriptionStatus, effectivePlan: u.effectivePlan, mobileVerified: u.mobileVerified },
    { authProvider: 'email', onboardingRequired: false, onboardingCompleted: true, plan: null, subscriptionStatus: null, effectivePlan: 'free', mobileVerified: false },
  );
});

// ---------------------------------------------------------------------------------------------
// No identity can belong to two users
// ---------------------------------------------------------------------------------------------

test('duplicate email: refused at signup (any letter case) and by the database', async () => {
  await sessionFor('dup@example.com');
  const res = await call('POST', '/api/auth/signup', { name: 'Again', email: 'DUP@example.com', password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(res.status, 409);
  await assert.rejects(User.create({ name: 'x', email: 'dup@example.com', passwordHash: 'x' }), /E11000/);
  assert.equal(await User.countDocuments({ email: 'dup@example.com' }), 1);
});

test('duplicate mobile number: impossible in the database, and a second signup can never verify', async () => {
  await assert.rejects(User.create({ name: 'x', phoneE164: '+919833300001', passwordHash: 'x' }), /E11000/);
  // Signing up again with the registered number creates nothing.
  const again = await json(await call('POST', '/api/auth/signup/mobile', { name: 'Thief', country: 'IN', mobile: '9833300001', password: PASSWORD, confirmPassword: PASSWORD }));
  await flushBackgroundTasks();
  assert.equal(again.status, 200, 'same answer as a new number');
  const guess = await call('POST', '/api/auth/signup/mobile/verify', { phone: '+919833300001', signupToken: again.body.data.signupToken, otp: '0000' });
  assert.equal(guess.status, 400);
  assert.equal(await User.countDocuments({ phoneE164: '+919833300001' }), 1);
});

test('duplicate Google id: impossible in the database; signing in again reuses the account', async () => {
  await assert.rejects(User.create({ name: 'x', email: 'other@gmail.com', googleId: 'g-model-1', passwordHash: 'x' }), /E11000/);
  const again = await google({ sub: 'g-model-1', email: 'google.user@gmail.com' });
  assert.equal(again.status, 200);
  assert.equal(again.body.data.created, false);
  assert.equal(await User.countDocuments({ googleId: 'g-model-1' }), 1);
});

test('emails, phones and Google ids that are absent never collide with each other', async () => {
  // Many accounts without an email / phone / Google id coexist (partial unique indexes).
  await User.create([
    { name: 'a', phoneE164: '+919833300101', passwordHash: 'x' },
    { name: 'b', phoneE164: '+919833300102', passwordHash: 'x' },
    { name: 'c', email: 'c@example.com', passwordHash: 'x' },
    { name: 'd', email: 'd@example.com', passwordHash: 'x' },
  ]);
  const names = (await User.collection.indexes()).map((i) => i.name);
  for (const index of ['email_unique_present', 'phone_unique_present', 'google_unique_present', 'createdAt_-1__id_-1', 'role_1']) {
    assert.ok(names.includes(index), `index ${index}`);
  }
});

// ---------------------------------------------------------------------------------------------
// Account linking
// ---------------------------------------------------------------------------------------------

test('Google with the email of an existing verified account links it — no second account', async () => {
  const existing = await User.create({ name: 'V', email: 'verified.owner@gmail.com', isEmailVerified: true, passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const { status, body } = await google({ sub: 'g-link-verified', email: 'verified.owner@gmail.com' });
  assert.equal(status, 200);
  assert.equal(body.data.created, false);
  assert.equal(body.data.passwordDisabled, false, 'a verified account keeps its password');
  assert.equal(await User.countDocuments({ email: 'verified.owner@gmail.com' }), 1);
  assert.equal((await User.findById(existing._id))!.googleId, 'g-link-verified');
});

test('an unverified Google email can never take over an account', async () => {
  await User.create({ name: 'U', email: 'target@gmail.com', isEmailVerified: true, passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const { status } = await google({ sub: 'g-attacker', email: 'target@gmail.com', emailVerified: false });
  assert.equal(status, 403);
  const target = await User.findOne({ email: 'target@gmail.com' });
  assert.equal(target!.googleId, undefined);
  assert.equal(await User.countDocuments({ email: 'target@gmail.com' }), 1);
});

// ---------------------------------------------------------------------------------------------
// Onboarding and plans
// ---------------------------------------------------------------------------------------------

test('onboarding completion and plan selection', async () => {
  const { cookie } = await sessionFor('onboard@example.com', 'user', { onboardingRequired: true });
  const free = await json(await call('POST', '/api/auth/onboarding', { plan: 'free' }, cookie));
  assert.equal(free.status, 200);
  assert.deepEqual([free.body.data.onboardingCompleted, free.body.data.plan, free.body.data.subscriptionStatus], [true, 'free', 'active']);

  const pro = await json(await call('POST', '/api/auth/onboarding', { plan: 'pro' }, cookie));
  assert.deepEqual([pro.body.data.plan, pro.body.data.subscriptionStatus, pro.body.data.effectivePlan], ['pro', 'pending', 'free']);
});

test('an invalid plan is refused', async () => {
  const { cookie } = await sessionFor('badplan@example.com', 'user', { onboardingRequired: true });
  for (const plan of ['gold', 'Free', '', null, 0]) {
    assert.equal((await call('POST', '/api/auth/onboarding', { plan }, cookie)).status, 400, String(plan));
  }
});

// ---------------------------------------------------------------------------------------------
// Who may change a subscription
// ---------------------------------------------------------------------------------------------

test('a user cannot activate, change another user’s, or self-promote through any endpoint', async () => {
  const me = await sessionFor('me@example.com', 'user', { onboardingRequired: true });
  const other = await sessionFor('other@example.com');

  // Choosing a paid plan with a forged status stays pending.
  await call('POST', '/api/auth/onboarding', { plan: 'premium', subscriptionStatus: 'active', userId: other.user._id.toString() }, me.cookie);
  assert.equal((await User.findById(me.user._id))!.subscriptionStatus, 'pending');
  assert.equal((await User.findById(other.user._id))!.plan, null, 'the other account is untouched');

  // The profile endpoint ignores role and subscription fields.
  await call('PATCH', '/api/auth/me', { name: 'Me', role: 'admin', plan: 'premium', subscriptionStatus: 'active', subscriptionExpiresAt: '2099-01-01' }, me.cookie);
  const after = await User.findById(me.user._id);
  assert.deepEqual([after!.role, after!.subscriptionStatus, after!.subscriptionExpiresAt], ['user', 'pending', null]);

  // And the administrator endpoint refuses users and visitors.
  const path = `/api/admin/users/${me.user._id}/subscription`;
  assert.equal((await call('PATCH', path, { plan: 'premium', subscriptionStatus: 'active' }, me.cookie)).status, 403);
  assert.equal((await call('PATCH', path, { plan: 'premium', subscriptionStatus: 'active' })).status, 401);
  assert.equal((await User.findById(me.user._id))!.subscriptionStatus, 'pending');
});

test('an administrator can activate, expire and cancel a subscription — audited', async () => {
  const admin = await sessionFor('root@example.com', 'admin');
  const { user } = await sessionFor('customer@example.com', 'user', { plan: 'pro', subscriptionStatus: 'pending', onboardingRequired: false });
  const path = `/api/admin/users/${user._id}/subscription`;
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const activated = await json(await call('PATCH', path, { plan: 'pro', subscriptionStatus: 'active', subscriptionExpiresAt: expires }, admin.cookie));
  assert.equal(activated.status, 200);
  assert.deepEqual([activated.body.data.subscriptionStatus, activated.body.data.effectivePlan], ['active', 'pro']);
  const stored = await User.findById(user._id);
  assert.ok(stored!.subscriptionStartedAt);
  assert.equal(stored!.subscriptionExpiresAt!.toISOString(), expires);

  const cancelled = await json(await call('PATCH', path, { plan: 'pro', subscriptionStatus: 'cancelled' }, admin.cookie));
  assert.deepEqual([cancelled.body.data.subscriptionStatus, cancelled.body.data.effectivePlan], ['cancelled', 'free']);
  assert.equal((await User.findById(user._id))!.subscriptionExpiresAt, null);

  assert.equal(await ActivityLog.countDocuments({ action: 'subscription_updated', targetId: user._id }), 2);
});

test('administrator subscription changes are validated', async () => {
  const admin = await sessionFor('root2@example.com', 'admin');
  const { user } = await sessionFor('customer2@example.com');
  const path = `/api/admin/users/${user._id}/subscription`;
  const past = new Date(Date.now() - 86_400_000).toISOString();
  for (const body of [
    { plan: 'gold', subscriptionStatus: 'active' },
    { plan: 'pro', subscriptionStatus: 'paid' },
    { plan: 'free', subscriptionStatus: 'pending' },
    { plan: 'free', subscriptionStatus: 'active', subscriptionExpiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    { plan: 'pro', subscriptionStatus: 'active', subscriptionExpiresAt: past },
    { plan: 'pro', subscriptionStatus: 'active', role: 'admin' },
  ]) {
    assert.equal((await call('PATCH', path, body, admin.cookie)).status, 400, JSON.stringify(body));
  }
  assert.equal((await User.findById(user._id))!.role, 'user');

  // Administrator accounts have no subscription to set.
  const otherAdmin = await sessionFor('root3@example.com', 'admin');
  assert.equal((await call('PATCH', `/api/admin/users/${otherAdmin.user._id}/subscription`, { plan: 'pro', subscriptionStatus: 'active' }, admin.cookie)).status, 400);
  assert.equal((await call('PATCH', `/api/admin/users/${new mongoose.Types.ObjectId()}/subscription`, { plan: 'pro', subscriptionStatus: 'active' }, admin.cookie)).status, 404);
});
