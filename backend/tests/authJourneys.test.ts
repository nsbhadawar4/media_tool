/**
 * End-to-end journeys through authentication and onboarding, one test per audited scenario,
 * run in order against one database — the way real accounts accumulate. Each journey goes
 * through the public HTTP API only (cookies included), as the browser does.
 *
 * The finer-grained rules have their own suites (mobileSignup, phoneOtpSecurity, googleAuth,
 * planSelection, accountModel, securityAudit, userIsolation); this file checks that the pieces
 * join up into the flows people actually take. Google is answered by a stand-in verifier — a
 * real ID token can only come from Google itself. "Google not configured" runs in
 * googleAuthDisabled.test.ts, which needs a process without a client id.
 */
import './setupTestEnv';
import './helpers/setupGoogleEnv';

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
import { getSmsProvider, type SmsMessage } from '../src/services/sms';
import { flushBackgroundTasks } from '../src/services/backgroundTasks';
import { setGoogleTokenVerifier, type GoogleIdentity } from '../src/services/googleAuthService';

const PASSWORD = 'Strong-Passw0rd';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
const texts: SmsMessage[] = [];

// ------------------------------------------------------------------------------------ helpers

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  await flushBackgroundTasks();
  const json = (await res.json().catch(() => null)) as { data?: any; error?: { message: string; code?: string; details?: any }; message?: string } | null;
  const session = (res.headers.get('set-cookie') ?? '').match(/mt_session=[^;]+/)?.[0];
  return { status: res.status, data: json?.data, error: json?.error, message: json?.message, cookie: session && !session.endsWith('=') ? session : undefined };
}
const me = async (cookie: string) => (await call('GET', '/api/auth/me', undefined, cookie)).data;
const chooseFree = (cookie: string) => call('POST', '/api/auth/onboarding', { plan: 'free' }, cookie);
/** What the user dashboard loads: works only with a live session. */
const dashboard = (cookie?: string) => call('GET', '/api/dashboard/stats', undefined, cookie);

const lastCodeTo = (to: string) => {
  const t = [...texts].reverse().find((m) => m.to === to);
  return t ? (/\b(\d{4})\b/.exec(t.body)?.[1] ?? null) : null;
};
const otherThan = (code: string) => (code === '0000' ? '1111' : '0000');

/** The stand-in for Google's verifier: a credential is just the identity, marked and encoded. */
const credentialFor = (identity: Partial<GoogleIdentity>) =>
  `test-google-token.${Buffer.from(JSON.stringify({ emailVerified: true, name: 'G User', ...identity })).toString('base64url')}`;
async function google(identity: Partial<GoogleIdentity>, credential?: string) {
  const config = await fetch(`${baseUrl}/api/auth/google/config`);
  const nonceCookie = (config.headers.get('set-cookie') ?? '').split(';')[0]!;
  const { data } = (await config.json()) as { data: { nonce: string } };
  return call('POST', '/api/auth/google', { credential: credential ?? credentialFor({ ...identity, nonce: data.nonce }) }, nonceCookie);
}

/** Expected state of a freshly signed-up account that has not chosen a plan yet. */
function assertAtPricing(user: any) {
  assert.equal(user.role, 'user');
  assert.equal(user.onboardingRequired, true, 'sent to pricing first');
  assert.equal(user.plan, null);
}
/** …and once Free is chosen. */
function assertOnFree(user: any) {
  assert.equal(user.onboardingRequired, false, 'onboarding complete → dashboard');
  assert.deepEqual([user.plan, user.subscriptionStatus, user.effectivePlan], ['free', 'active', 'free']);
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), PendingPhoneSignup.init()]);
  getSmsProvider().send = async (m) => {
    texts.push(m);
  };
  setGoogleTokenVerifier(async (token) => {
    const [marker, payload] = token.split('.');
    if (marker !== 'test-google-token' || !payload) throw new Error('invalid token');
    const id = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Partial<GoogleIdentity>;
    return { sub: id.sub!, email: id.email!, emailVerified: id.emailVerified ?? false, name: id.name ?? null, nonce: id.nonce ?? null };
  });
  // Accounts that exist before the journeys start: an administrator and a long-standing user.
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  await User.create([
    { name: 'Admin', email: 'admin@journey.test', role: 'admin', passwordHash },
    { name: 'Old Timer', email: 'old@journey.test', passwordHash },
  ]);
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

// Cookies carried from one journey to the next.
const sessions: Record<string, string> = {};

// ------------------------------------------------------------------------------------ 1–3: new users

test('1. new email user: signup → pricing → Free → dashboard', async () => {
  const signup = await call('POST', '/api/auth/signup', { name: 'Email New', email: 'Email.New@Journey.test', password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(signup.status, 201);
  assert.ok(signup.cookie, 'signed in straight away (this app has no email-verification step)');
  assertAtPricing(signup.data);
  assert.equal(signup.data.email, 'email.new@journey.test');

  const chosen = await chooseFree(signup.cookie!);
  assert.equal(chosen.status, 200);
  assertOnFree(chosen.data);
  assertOnFree(await me(signup.cookie!));
  assert.equal((await dashboard(signup.cookie)).status, 200);
  sessions.email = signup.cookie!;
});

test('2. new mobile user: signup → 4-digit OTP → pricing → Free → dashboard', async () => {
  const start = await call('POST', '/api/auth/signup/mobile', { name: 'Mobile New', country: 'IN', mobile: '98111 22233', password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(start.status, 200);
  assert.equal(start.cookie, undefined, 'no session until the number is proved');
  assert.equal(await User.countDocuments({ phoneE164: '+919811122233' }), 0, 'no account yet');
  const code = lastCodeTo('+919811122233')!;
  assert.match(code, /^\d{4}$/);

  const verified = await call('POST', '/api/auth/signup/mobile/verify', { phone: start.data.phone, signupToken: start.data.signupToken, otp: code });
  assert.equal(verified.status, 201);
  assert.ok(verified.cookie);
  assertAtPricing(verified.data);
  assert.equal(verified.data.mobileVerified, true);
  assert.equal(verified.data.authProvider, 'mobile');

  assertOnFree((await chooseFree(verified.cookie!)).data);
  assert.equal((await dashboard(verified.cookie)).status, 200);
});

test('3. new Google user: Google → pricing → Free → dashboard', async () => {
  const signedIn = await google({ sub: 'g-journey-1', email: 'google.new@journey.test' });
  assert.equal(signedIn.status, 201, 'created');
  assert.ok(signedIn.cookie);
  assertAtPricing(signedIn.data.user ?? signedIn.data);
  assertOnFree((await chooseFree(signedIn.cookie!)).data);
  assert.equal((await dashboard(signedIn.cookie)).status, 200);
});

// ------------------------------------------------------------------------------------ 4–7: returning users

test('4. existing email user: login → dashboard (no pricing)', async () => {
  for (const email of ['email.new@journey.test', 'old@journey.test']) {
    const login = await call('POST', '/api/auth/login', { email, password: PASSWORD });
    assert.equal(login.status, 200, email);
    assert.equal(login.data.onboardingRequired, false, `${email} is not sent back to pricing`);
    assert.equal((await dashboard(login.cookie)).status, 200);
  }
});

test('5. existing Google user: Google → dashboard, same account', async () => {
  const again = await google({ sub: 'g-journey-1', email: 'google.new@journey.test' });
  assert.equal(again.status, 200);
  const user = again.data.user ?? again.data;
  assert.equal(user.onboardingRequired, false);
  assert.equal(user.plan, 'free');
  assert.equal(await User.countDocuments({ googleId: 'g-journey-1' }), 1);
});

test('6. existing mobile user: mobile login → dashboard', async () => {
  const login = await call('POST', '/api/auth/login/mobile', { country: 'IN', mobile: '9811122233', password: PASSWORD });
  assert.equal(login.status, 200);
  assert.equal(login.data.onboardingRequired, false);
  assert.equal((await dashboard(login.cookie)).status, 200);
  sessions.mobile = login.cookie!;

  const wrong = await call('POST', '/api/auth/login/mobile', { country: 'IN', mobile: '9811122233', password: 'Wrong-Passw0rd' });
  assert.equal(wrong.status, 401);
});

test('7. admin: login → admin area, never pricing', async () => {
  const login = await call('POST', '/api/auth/login', { email: 'admin@journey.test', password: PASSWORD });
  assert.equal(login.status, 200);
  assert.equal(login.data.role, 'admin');
  assert.equal(login.data.onboardingRequired, false, 'admins never see pricing onboarding');
  for (const path of ['/api/admin/stats', '/api/admin/users', '/api/admin/reviews']) {
    assert.equal((await call('GET', path, undefined, login.cookie)).status, 200, path);
  }
  assert.equal((await chooseFree(login.cookie!)).status, 403, 'and cannot be given a plan');
  sessions.admin = login.cookie!;
});

// ------------------------------------------------------------------------------------ 8: admin area

test('8. a normal user is refused by every admin endpoint (403), a signed-out one with 401', async () => {
  const paths = ['/api/admin/stats', '/api/admin/users', '/api/admin/users/stats', '/api/admin/reviews', '/api/admin/reviews/stats', '/api/admin/activity'];
  for (const path of paths) {
    assert.equal((await call('GET', path, undefined, sessions.email)).status, 403, path);
    assert.equal((await call('GET', path)).status, 401, path);
  }
  const target = await User.findOne({ email: 'old@journey.test' });
  assert.equal((await call('PATCH', `/api/admin/users/${target!._id}/subscription`, { plan: 'premium', subscriptionStatus: 'active' }, sessions.email)).status, 403);
  assert.equal((await call('PATCH', `/api/admin/users/${target!._id}/status`, { isActive: false }, sessions.email)).status, 403);
  assert.equal((await User.findById(target!._id))!.isActive, true);
});

// ------------------------------------------------------------------------------------ 9: mobile OTP

test('9. mobile OTP: wrong, early resend, resend after 60s, old code reuse, expiry, 5 failures', async () => {
  const phone = '+919822233344';
  const start = await call('POST', '/api/auth/signup/mobile', { name: 'Otp', country: 'IN', mobile: '9822233344', password: PASSWORD, confirmPassword: PASSWORD });
  const { signupToken } = start.data;
  const verify = (otp: string) => call('POST', '/api/auth/signup/mobile/verify', { phone, signupToken, otp });
  const firstCode = lastCodeTo(phone)!;

  // Wrong code: counted, explained.
  const wrong = await verify(otherThan(firstCode));
  assert.deepEqual([wrong.status, wrong.error!.code, wrong.error!.details.attemptsRemaining], [400, 'OTP_INCORRECT', 4]);

  // Resend inside 60 seconds: nothing sent, the countdown is returned.
  const sentBefore = texts.length;
  const early = await call('POST', '/api/auth/signup/mobile/resend', { phone, signupToken });
  assert.equal(early.status, 200);
  assert.ok(early.data.resendInSeconds > 0);
  assert.equal(texts.length, sentBefore);

  // Resend after 60 seconds: a new code, fresh attempts.
  await PendingPhoneSignup.updateOne({ phoneE164: phone }, { $set: { lastSentAt: new Date(Date.now() - 61_000) } });
  const later = await call('POST', '/api/auth/signup/mobile/resend', { phone, signupToken });
  assert.equal(later.status, 200);
  assert.equal(texts.length, sentBefore + 1);
  const secondCode = lastCodeTo(phone)!;
  assert.equal((await PendingPhoneSignup.findOne({ phoneE164: phone }))!.otpAttempts, 0);

  // The old code no longer works (unless the new one happens to be the same digits).
  if (secondCode !== firstCode) assert.equal((await verify(firstCode)).error!.code, 'OTP_INCORRECT');

  // Expired.
  await PendingPhoneSignup.updateOne({ phoneE164: phone }, { $set: { otpExpiresAt: new Date(Date.now() - 1), otpAttempts: 0 } });
  assert.equal((await verify(secondCode)).error!.code, 'OTP_EXPIRED');

  // Five failures lock it; the right code is then refused too.
  await PendingPhoneSignup.updateOne({ phoneE164: phone }, { $set: { otpExpiresAt: new Date(Date.now() + 600_000), otpAttempts: 0 } });
  const codes: string[] = [];
  for (let i = 0; i < 5; i++) codes.push((await verify(otherThan(secondCode))).error!.code!);
  assert.deepEqual(codes, ['OTP_INCORRECT', 'OTP_INCORRECT', 'OTP_INCORRECT', 'OTP_INCORRECT', 'OTP_LOCKED']);
  assert.equal((await verify(secondCode)).error!.code, 'OTP_LOCKED');
  assert.equal(await User.countDocuments({ phoneE164: phone }), 0);

  // A used code can't be replayed: journey 2's code, after its account exists.
  const replay = await call('POST', '/api/auth/signup/mobile/verify', { phone: '+919811122233', signupToken: 'f'.repeat(64), otp: '1234' });
  assert.equal(replay.error!.code, 'OTP_INVALID');
});

// ------------------------------------------------------------------------------------ 10: pricing

test('10. pricing: Free, Pro, Premium, invalid, signed out, and no paid activation without payment', async () => {
  const fresh = async (email: string) =>
    (await call('POST', '/api/auth/signup', { name: email, email, password: PASSWORD, confirmPassword: PASSWORD })).cookie!;

  assertOnFree((await chooseFree(await fresh('p-free@journey.test'))).data);

  for (const plan of ['pro', 'premium']) {
    const cookie = await fresh(`p-${plan}@journey.test`);
    // The client tries to say it has paid: every extra field is ignored.
    const res = await call('POST', '/api/auth/onboarding', { plan, subscriptionStatus: 'active', paid: true, price: 0, subscriptionExpiresAt: '2099-01-01' }, cookie);
    assert.equal(res.status, 200);
    assert.deepEqual([res.data.plan, res.data.subscriptionStatus, res.data.effectivePlan, res.data.onboardingRequired], [plan, 'pending', 'free', false]);
    // Choosing again can't activate it either.
    assert.equal((await call('POST', '/api/auth/onboarding', { plan, subscriptionStatus: 'active' }, cookie)).data.subscriptionStatus, 'pending');
    // Nor can the profile endpoint.
    await call('PATCH', '/api/auth/me', { name: 'Paid?', subscriptionStatus: 'active', plan: 'premium', effectivePlan: plan }, cookie);
    const after = await me(cookie);
    assert.deepEqual([after.plan, after.subscriptionStatus, after.effectivePlan], [plan, 'pending', 'free']);
  }

  const invalidCookie = await fresh('p-invalid@journey.test');
  for (const plan of ['enterprise', 'FREE', '', null, 0, { $ne: null }]) {
    assert.equal((await call('POST', '/api/auth/onboarding', { plan }, invalidCookie)).status, 400, JSON.stringify(plan));
  }
  assert.equal((await call('POST', '/api/auth/onboarding', {}, invalidCookie)).status, 400);
  assertAtPricing(await me(invalidCookie));

  assert.equal((await call('POST', '/api/auth/onboarding', { plan: 'free' })).status, 401);
  assert.equal((await call('POST', '/api/auth/onboarding', { plan: 'free' }, 'mt_session=forged.token.value')).status, 401);
});

// ------------------------------------------------------------------------------------ 11: Google

test('11. Google: new, existing, duplicates linked not created, invalid tokens refused', async () => {
  // New and existing: covered by journeys 3 and 5. An existing *email* account is linked:
  const linked = await google({ sub: 'g-journey-2', email: 'email.new@journey.test' });
  assert.equal(linked.status, 200);
  assert.equal(await User.countDocuments({ email: 'email.new@journey.test' }), 1, 'no second account for the same email');
  assert.equal((await User.findOne({ email: 'email.new@journey.test' }))!.googleId, 'g-journey-2');
  // That email was never proved, so the old password is switched off and older sessions end —
  // whoever registered the address first can't keep a way in once its owner arrives via Google.
  assert.equal((await call('GET', '/api/auth/me', undefined, sessions.email)).status, 401);

  // The same Google id with a different email is still that one account.
  const moved = await google({ sub: 'g-journey-1', email: 'google.renamed@journey.test' });
  assert.equal(moved.status, 200);
  assert.equal(await User.countDocuments({ googleId: 'g-journey-1' }), 1);

  // Forged, garbage, nonce-less, unverified-email and admin attempts.
  assert.equal((await google({}, 'not-a-real-token')).status, 400, 'not even shaped like a token');
  assert.equal((await google({}, `test-google-token.${'x'.repeat(40)}`)).status, 401, 'fails verification');
  assert.equal((await call('POST', '/api/auth/google', { credential: credentialFor({ sub: 'x', email: 'x@journey.test' }) })).status, 401, 'no nonce cookie');
  assert.notEqual((await google({ sub: 'g-unverified', email: 'old@journey.test', emailVerified: false })).status, 200);
  assert.equal((await User.findOne({ email: 'old@journey.test' }))!.googleId ?? null, null, 'unverified email never links');
  const adminAttempt = await google({ sub: 'g-admin', email: 'admin@journey.test' });
  assert.notEqual(adminAttempt.status, 200, 'administrators are never signed in through Google');
  assert.equal((await User.findOne({ email: 'admin@journey.test' }))!.googleId ?? null, null);
  assert.equal((await call('POST', '/api/auth/google', {})).status, 400);
});

// ------------------------------------------------------------------------------------ 12: security

test('12. security: no self-promotion, no status forging, no cross-account changes, no onboarding bypass', async () => {
  // role=admin at signup, at onboarding and in the profile is ignored.
  const signup = await call('POST', '/api/auth/signup', { name: 'Sneaky', email: 'sneaky@journey.test', password: PASSWORD, confirmPassword: PASSWORD, role: 'admin', onboardingRequired: false, plan: 'premium', subscriptionStatus: 'active' });
  assert.equal(signup.status, 201);
  assertAtPricing(signup.data);
  const cookie = signup.cookie!;
  await call('PATCH', '/api/auth/me', { name: 'Sneaky', role: 'admin', onboardingRequired: false, onboardingCompleted: true, plan: 'premium', subscriptionStatus: 'active' }, cookie);
  let user = await me(cookie);
  assert.equal(user.role, 'user');
  assertAtPricing(user);
  assert.equal(user.subscriptionStatus, null);
  assert.equal((await call('GET', '/api/admin/users', undefined, cookie)).status, 403);

  // Onboarding can only be finished by choosing a real plan.
  assert.equal((await call('POST', '/api/auth/onboarding', { onboardingRequired: false }, cookie)).status, 400);
  assertAtPricing(await me(cookie));

  // A forged token claiming admin, or someone else's id, gets nothing.
  const forged = `mt_session=${['{"alg":"HS256","typ":"JWT"}', JSON.stringify({ sub: user.id, role: 'admin' }), 'sig'].map((p) => Buffer.from(p).toString('base64url')).join('.')}`;
  assert.equal((await call('GET', '/api/admin/users', undefined, forged)).status, 401);

  // Another user's account: the body can't point the change elsewhere.
  const victim = await User.findOne({ email: 'p-invalid@journey.test' });
  await call('POST', '/api/auth/onboarding', { plan: 'premium', userId: victim!._id.toString(), email: victim!.email }, cookie);
  assert.equal((await User.findById(victim!._id))!.plan, null, 'the victim is untouched');
  user = await me(cookie);
  assert.equal(user.plan, 'premium', 'only the caller changed');
  assert.equal(user.subscriptionStatus, 'pending');

  // Ownership: content created by one account is invisible to another.
  sessions.email = (await call('POST', '/api/auth/login', { email: 'old@journey.test', password: PASSWORD })).cookie!;
  const folder = await call('POST', '/api/folders', { name: `Private ${crypto.randomUUID().slice(0, 8)}` }, sessions.email);
  assert.equal(folder.status, 201);
  const mine = await call('GET', '/api/folders', undefined, sessions.email);
  const theirs = await call('GET', '/api/folders', undefined, sessions.mobile);
  const names = (r: typeof mine) => JSON.stringify(r.data);
  assert.ok(names(mine).includes(folder.data.name));
  assert.ok(!names(theirs).includes(folder.data.name), 'another account never sees it');
  assert.equal((await call('GET', `/api/folders/${folder.data.id ?? folder.data._id}`, undefined, sessions.mobile)).status, 404);
  assert.equal((await call('DELETE', `/api/folders/${folder.data.id ?? folder.data._id}`, undefined, sessions.mobile)).status, 404);
  assert.ok(names(await call('GET', '/api/folders', undefined, sessions.email)).includes(folder.data.name), 'still there');
});
