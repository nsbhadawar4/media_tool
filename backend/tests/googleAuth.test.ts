/**
 * "Continue with Google": the ID token is verified server-side (here by a stand-in for Google's
 * verifier), the nonce binds it to this browser, accounts are found or created without
 * duplicates, administrators can never be created or entered through Google, and new Google
 * accounts go through onboarding while everyone else does not.
 */
import './setupTestEnv';
import './helpers/setupGoogleEnv';

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ActivityLog } from '../src/models/ActivityLog';
import { setGoogleTokenVerifier, type GoogleIdentity } from '../src/services/googleAuthService';

const PASSWORD = 'Strong-Passw0rd';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;

/**
 * Stand-in for Google: a "credential" is just the identity, base64-encoded, plus a marker.
 * Anything else fails verification — exactly how a forged or tampered token behaves.
 */
function credentialFor(identity: Partial<GoogleIdentity>): string {
  return `test-google-token.${Buffer.from(JSON.stringify(identity)).toString('base64url')}`;
}

async function getConfig() {
  const res = await fetch(`${baseUrl}/api/auth/google/config`);
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  return { res, body: await res.json(), cookie };
}

/** A full sign-in: fetch a nonce like the button does, then post a token carrying it. */
async function googleSignIn(identity: Partial<GoogleIdentity>, opts: { nonce?: string | null; extraBody?: object } = {}) {
  const { body, cookie } = await getConfig();
  const nonce = opts.nonce === undefined ? body.data.nonce : opts.nonce;
  const res = await fetch(`${baseUrl}/api/auth/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ credential: credentialFor({ emailVerified: true, name: 'G User', ...identity, nonce }), ...opts.extraBody }),
  });
  return { status: res.status, body: await res.json(), cookie: (res.headers.get('set-cookie') ?? '').match(/mt_session=[^;]+/)?.[0] ?? null };
}

const me = async (cookie: string) => (await (await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } })).json()).data;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
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

beforeEach(async () => {
  await User.deleteMany({});
});

test('the config endpoint exposes only the public client id and sets a single-use nonce cookie', async () => {
  const { res, body } = await getConfig();
  assert.equal(res.status, 200);
  assert.equal(body.data.enabled, true);
  assert.equal(body.data.clientId, 'test-client-id.apps.googleusercontent.com');
  assert.match(body.data.nonce, /^[0-9a-f]{48}$/);
  const cookie = res.headers.get('set-cookie') ?? '';
  assert.match(cookie, /mt_google_nonce=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Path=\/api\/auth\/google/);
  assert.match(res.headers.get('cache-control') ?? '', /no-store/);
});

test('a new Google user is created as a plain user, with onboarding to do', async () => {
  const r = await googleSignIn({ sub: 'g-new-1', email: 'New.Person@Gmail.com', name: 'New Person' });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.created, true);
  assert.ok(r.cookie, 'signed in with the normal session cookie');

  const profile = await me(r.cookie!);
  assert.equal(profile.email, 'new.person@gmail.com');
  assert.equal(profile.role, 'user');
  assert.equal(profile.authProvider, 'google');
  assert.equal(profile.googleLinked, true);
  assert.equal(profile.onboardingRequired, true);
  assert.equal(profile.isEmailVerified, true);
  assert.ok(!JSON.stringify(profile).includes('g-new-1'), 'the Google id is never sent to clients');

  const stored = await User.findOne({ email: 'new.person@gmail.com' }).select('+passwordHash').lean();
  assert.equal(stored!.googleId, 'g-new-1');
  assert.match(stored!.passwordHash, /^\$2[aby]\$/, 'an unusable bcrypt hash, not an empty password');
  const keys = Object.keys(stored!);
  assert.ok(!keys.some((k) => /access|refresh|idToken/i.test(k)), 'no Google tokens are stored');
});

test('signing in again finds the same account — no duplicates', async () => {
  await googleSignIn({ sub: 'g-repeat', email: 'repeat@gmail.com' });
  const second = await googleSignIn({ sub: 'g-repeat', email: 'repeat@gmail.com' });
  assert.equal(second.status, 200);
  assert.equal(second.body.data.created, false);
  assert.equal(await User.countDocuments({ email: 'repeat@gmail.com' }), 1);
});

test('the client cannot choose the role, email or id — only the verified token counts', async () => {
  const r = await googleSignIn(
    { sub: 'g-escalate', email: 'escalate@gmail.com' },
    { extraBody: { role: 'admin', email: 'root@example.com', userId: '000000000000000000000000' } },
  );
  assert.equal(r.status, 201);
  const user = await User.findOne({ googleId: 'g-escalate' });
  assert.equal(user!.role, 'user');
  assert.equal(user!.email, 'escalate@gmail.com');
});

test('an existing email account is linked; a password set before the link is turned off', async () => {
  // Signed up with email + password: the address was never proved to belong to anyone.
  const existing = await User.create({ name: 'Old', email: 'owner@gmail.com', passwordHash: await bcrypt.hash(PASSWORD, 4), authProvider: 'email' });
  const oldLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@gmail.com', password: PASSWORD }) });
  const oldSession = (oldLogin.headers.get('set-cookie') ?? '').split(';')[0]!;

  const r = await googleSignIn({ sub: 'g-owner', email: 'owner@gmail.com' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.created, false);
  assert.equal(r.body.data.passwordDisabled, true);
  assert.equal(await User.countDocuments({ email: 'owner@gmail.com' }), 1, 'linked, not duplicated');

  const linked = await User.findById(existing._id);
  assert.equal(linked!.googleId, 'g-owner');
  assert.equal(linked!.onboardingRequired, undefined, 'an existing account never gets onboarding');
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: oldSession } })).status, 401, 'earlier sessions are ended');
  const passwordLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@gmail.com', password: PASSWORD }) });
  assert.equal(passwordLogin.status, 401, 'a password set by whoever registered the address no longer works');
});

test('an account whose email is already verified keeps its password when linked', async () => {
  await User.create({ name: 'V', email: 'verified@gmail.com', isEmailVerified: true, passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const r = await googleSignIn({ sub: 'g-verified', email: 'verified@gmail.com' });
  assert.equal(r.body.data.passwordDisabled, false);
  const passwordLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'verified@gmail.com', password: PASSWORD }) });
  assert.equal(passwordLogin.status, 200);
});

test('an administrator can never be signed in, linked or created through Google', async () => {
  const admin = await User.create({ name: 'Root', email: 'root@gmail.com', role: 'admin', passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const r = await googleSignIn({ sub: 'g-root', email: 'root@gmail.com' });
  assert.equal(r.status, 403);
  assert.equal(r.cookie, null, 'no session');
  const after = await User.findById(admin._id);
  assert.equal(after!.googleId, undefined, 'not linked');
  assert.equal(after!.role, 'admin');
});

test('unverified Google emails, suspended accounts and conflicting links are refused', async () => {
  assert.equal((await googleSignIn({ sub: 'g-unv', email: 'unverified@gmail.com', emailVerified: false })).status, 403);
  assert.equal(await User.countDocuments({ email: 'unverified@gmail.com' }), 0);

  await User.create({ name: 'S', email: 'suspended@gmail.com', isActive: false, googleId: 'g-susp', passwordHash: 'x' });
  assert.equal((await googleSignIn({ sub: 'g-susp', email: 'suspended@gmail.com' })).status, 401);

  await User.create({ name: 'C', email: 'conflict@gmail.com', googleId: 'g-first', passwordHash: 'x' });
  assert.equal((await googleSignIn({ sub: 'g-second', email: 'conflict@gmail.com' })).status, 409);
});

test('a token without the matching nonce, or a forged token, is refused', async () => {
  assert.equal((await googleSignIn({ sub: 'g-n1', email: 'n1@gmail.com' }, { nonce: 'not-the-nonce' })).status, 401);
  assert.equal((await googleSignIn({ sub: 'g-n2', email: 'n2@gmail.com' }, { nonce: null })).status, 401);

  const { cookie } = await getConfig();
  const forged = await fetch(`${baseUrl}/api/auth/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ credential: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.forged-signature' }),
  });
  assert.equal(forged.status, 401);
  assert.equal(await User.countDocuments({}), 0, 'nothing was created by any refused attempt');
});

test('a nonce works once', async () => {
  const { body, cookie } = await getConfig();
  const post = () =>
    fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ credential: credentialFor({ sub: 'g-once', email: 'once@gmail.com', emailVerified: true, nonce: body.data.nonce }) }),
    });
  const first = await post();
  assert.equal(first.status, 201);
  assert.match(first.headers.get('set-cookie') ?? '', /mt_google_nonce=;/, 'the nonce cookie is cleared');
});

test('onboarding: choosing the plan finishes it; admins and older accounts never have any', async () => {
  const r = await googleSignIn({ sub: 'g-onboard', email: 'onboard@gmail.com' });
  const bad = await fetch(`${baseUrl}/api/auth/onboarding`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: r.cookie! }, body: JSON.stringify({ plan: 'enterprise' }) });
  assert.equal(bad.status, 400, 'only real plans can be chosen');

  const ok = await fetch(`${baseUrl}/api/auth/onboarding`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: r.cookie! }, body: JSON.stringify({ plan: 'free' }) });
  assert.equal(ok.status, 200);
  const done = await me(r.cookie!);
  assert.equal(done.onboardingRequired, false);
  assert.equal(done.plan, 'free');

  assert.equal((await fetch(`${baseUrl}/api/auth/onboarding`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: 'free' }) })).status, 401);

  await User.create({ name: 'Legacy', email: 'legacy@example.com', passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const legacyLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'legacy@example.com', password: PASSWORD }) });
  const legacy = await legacyLogin.json();
  assert.equal(legacy.data.onboardingRequired, false, 'accounts created before onboarding existed skip it');
  assert.equal(legacy.data.authProvider, 'email');
});

test('Google sign-ins are recorded in the activity log, failures included', async () => {
  await ActivityLog.deleteMany({});
  const created = await googleSignIn({ sub: 'g-activity', email: 'activity@example.com' });
  assert.equal(created.status, 201);
  const userId = created.body.data.user.id;
  await googleSignIn({ sub: 'g-activity', email: 'activity@example.com' });
  await googleSignIn({ sub: 'g-x' }, { nonce: null });
  const forged = await fetch(`${baseUrl}/api/auth/google`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: 'forged.token.value-long-enough' }) });
  assert.equal(forged.status, 401);

  const mine = await ActivityLog.find({ subjectUserId: userId }).sort({ createdAt: 1, _id: 1 }).lean();
  assert.deepEqual(mine.map((e) => [e.action, e.authProvider, e.status]), [
    ['signup', 'google', 'success'],
    ['onboarding_started', null, 'success'],
    ['login', 'google', 'success'],
  ]);
  const failures = await ActivityLog.find({ action: 'login_failed', authProvider: 'google' }).lean();
  assert.ok(failures.length >= 2 && failures.every((e) => e.status === 'failure'));
  assert.ok(!JSON.stringify(failures).includes('forged.token'), 'the token itself is never logged');
});
