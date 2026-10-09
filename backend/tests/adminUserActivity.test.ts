/**
 * Admin user management and activity tracking: real sign-up, sign-in, code, reset, onboarding and
 * admin flows write the audit events they should; administrators (only) can list, search, filter,
 * sort and page through users and activity; and nothing sensitive ever comes back.
 */
import './setupTestEnv';
import './helpers/setupTrustProxy';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ActivityLog } from '../src/models/ActivityLog';
import { Media } from '../src/models/Media';
import { Folder } from '../src/models/Folder';
import { PendingPhoneSignup } from '../src/models/PendingPhoneSignup';
import { getSmsProvider, type SmsMessage } from '../src/services/sms';
import { getEmailProvider } from '../src/services/email';
import { flushBackgroundTasks } from '../src/services/backgroundTasks';
import { sanitizeMetadata } from '../src/services/activityService';
import { LAST_ACTIVE_RESOLUTION_MS } from '../src/middleware/auth';
import { describeUserAgent, maskIp } from '../src/utils/clientInfo';
import { userTimelineFilter } from '../src/services/adminQueries';

const PASSWORD = 'Strong-Passw0rd';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
const texts: SmsMessage[] = [];
const emails: Array<{ to: string; text: string }> = [];
let ipCounter = 10;
const nextIp = () => `198.51.100.${(ipCounter++ % 240) + 10}`;

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'x-forwarded-for': nextIp(),
      'user-agent': UA,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  await flushBackgroundTasks();
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  const session = (res.headers.get('set-cookie') ?? '').match(/mt_session=[^;]+/)?.[0];
  return { status: res.status, data: json?.data, meta: json?.meta, error: json?.error, raw: text, cookie: session && !session.endsWith('=') ? session : undefined };
}
const actions = async (filter: Record<string, unknown>) => (await ActivityLog.find(filter).sort({ createdAt: 1, _id: 1 }).lean()).map((e) => e.action);

let admin: string;
let userCookie: string;
let emailUserId: string;
let mobileUserId: string;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), ActivityLog.init(), PendingPhoneSignup.init()]);
  getSmsProvider().send = async (m) => {
    texts.push(m);
  };
  getEmailProvider().send = async (m) => {
    emails.push({ to: m.to, text: m.text });
  };
  await User.create({ name: 'Root', email: 'root@example.com', role: 'admin', passwordHash: await bcrypt.hash(PASSWORD, 4) });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = (await call('POST', '/api/auth/login', { email: 'root@example.com', password: PASSWORD })).cookie!;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

// ------------------------------------------------------------------------------------ tracking

test('email signup, onboarding, login, failed login, profile, password and logout are all recorded', async () => {
  const signup = await call('POST', '/api/auth/signup', { name: 'Ella Email', email: 'ella@example.com', password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(signup.status, 201);
  emailUserId = signup.data.id;
  await call('POST', '/api/auth/onboarding', { plan: 'free' }, signup.cookie);
  await call('POST', '/api/auth/login', { email: 'ella@example.com', password: 'Wrong-Passw0rd' });
  const login = await call('POST', '/api/auth/login', { email: 'ella@example.com', password: PASSWORD });
  userCookie = login.cookie!;
  await call('PATCH', '/api/auth/me', { name: 'Ella E.' }, userCookie);
  await call('POST', '/api/auth/change-password', { currentPassword: 'Nope-Passw0rd1', newPassword: 'Newer-Passw0rd', confirmPassword: 'Newer-Passw0rd' }, userCookie);
  await call('POST', '/api/auth/logout', undefined, userCookie);

  const mine = await actions({ subjectUserId: new mongoose.Types.ObjectId(emailUserId) });
  assert.deepEqual(mine, [
    'signup',
    'onboarding_started',
    'plan_selected',
    'onboarding_completed',
    'login_failed',
    'login',
    'profile_updated',
    'password_changed',
    'logout',
  ]);

  const signupEvent = await ActivityLog.findOne({ action: 'signup', subjectUserId: emailUserId }).lean();
  assert.equal(signupEvent!.authProvider, 'email');
  assert.equal(signupEvent!.performedBy!.toString(), emailUserId, 'the new account is the actor');
  const failed = await ActivityLog.findOne({ action: 'login_failed', subjectUserId: emailUserId }).lean();
  assert.equal(failed!.status, 'failure');
  assert.equal(failed!.performedBy, null, 'nobody was signed in');
  assert.equal((failed!.metadata as { reason: string }).reason, 'wrong_password');
  assert.equal((await ActivityLog.findOne({ action: 'password_changed', subjectUserId: emailUserId }).lean())!.status, 'failure');

  // Sign back in for later tests.
  userCookie = (await call('POST', '/api/auth/login', { email: 'ella@example.com', password: PASSWORD })).cookie!;
});

test('mobile signup records the code requested, resent, failed and verified, then the signup', async () => {
  const phone = '+919811100022';
  const start = await call('POST', '/api/auth/signup/mobile', { name: 'Manu Mobile', country: 'IN', mobile: '9811100022', password: PASSWORD, confirmPassword: PASSWORD });
  await PendingPhoneSignup.updateOne({ phoneE164: phone }, { $set: { lastSentAt: new Date(Date.now() - 61_000) } });
  await call('POST', '/api/auth/signup/mobile/resend', { phone, signupToken: start.data.signupToken });
  const code = /\b(\d{4})\b/.exec(texts.findLast((t) => t.to === phone)!.body)![1]!;
  await call('POST', '/api/auth/signup/mobile/verify', { phone, signupToken: start.data.signupToken, otp: code === '0000' ? '1111' : '0000' });
  const verified = await call('POST', '/api/auth/signup/mobile/verify', { phone, signupToken: start.data.signupToken, otp: code });
  assert.equal(verified.status, 201);
  mobileUserId = verified.data.id;

  assert.deepEqual(await actions({ subjectIdentifier: phone }), ['otp_requested', 'otp_resent', 'otp_failed', 'otp_verified', 'signup']);
  const failed = await ActivityLog.findOne({ action: 'otp_failed', subjectIdentifier: phone }).lean();
  assert.deepEqual([failed!.status, (failed!.metadata as { purpose: string }).purpose], ['failure', 'mobile_signup']);
  assert.ok(!JSON.stringify(await ActivityLog.find({ subjectIdentifier: phone }).lean()).includes(`"${code}"`), 'the code is never logged');

  // Their timeline joins the pre-account code events through the number.
  const timeline = await call('GET', `/api/admin/users/${mobileUserId}/activity`, undefined, admin);
  assert.deepEqual(
    timeline.data.map((e: { action: string }) => e.action),
    ['onboarding_started', 'signup', 'otp_verified', 'otp_failed', 'otp_resent', 'otp_requested'],
    'newest first',
  );
});

test('password reset records the request, a wrong code, the right code and the reset', async () => {
  await call('POST', '/api/auth/forgot-password', { email: 'ella@example.com' });
  const code = /\b(\d{4})\b/.exec(emails.findLast((e) => e.to === 'ella@example.com')!.text)![1]!;
  await call('POST', '/api/auth/verify-otp', { email: 'ella@example.com', otp: code === '0000' ? '1111' : '0000' });
  const verified = await call('POST', '/api/auth/verify-otp', { email: 'ella@example.com', otp: code });
  await call('POST', '/api/auth/reset-password', { resetToken: verified.data.resetToken, newPassword: PASSWORD, confirmPassword: PASSWORD });

  const events = await ActivityLog.find({ action: { $in: ['password_reset_requested', 'otp_failed', 'otp_verified', 'password_reset'] }, subjectIdentifier: 'ella@example.com' })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  assert.deepEqual(
    events.map((e) => [e.action, e.status]),
    [['password_reset_requested', 'success'], ['otp_failed', 'failure'], ['otp_verified', 'success'], ['password_reset', 'success']],
  );
  assert.ok(events.every((e) => !JSON.stringify(e).includes(verified.data.resetToken)), 'the reset token is never logged');
  userCookie = (await call('POST', '/api/auth/login', { email: 'ella@example.com', password: PASSWORD })).cookie!;
});

test('suspending and reactivating an account is recorded on that account', async () => {
  assert.equal((await call('PATCH', `/api/admin/users/${mobileUserId}/status`, { isActive: false }, admin)).status, 200);
  assert.equal((await call('PATCH', `/api/admin/users/${mobileUserId}/status`, { isActive: true }, admin)).status, 200);
  const events = await ActivityLog.find({ subjectUserId: mobileUserId, action: { $in: ['user_deactivated', 'user_activated'] } }).sort({ createdAt: 1, _id: 1 }).lean();
  assert.deepEqual(events.map((e) => e.action), ['user_deactivated', 'user_activated']);
  assert.ok(events.every((e) => e.performedByEmail === 'root@example.com'), 'performed by the administrator');
});

test('metadata is sanitised: anything named like a secret is dropped at any depth', () => {
  const clean = sanitizeMetadata({ plan: 'pro', password: 'x', nested: { otpCode: '1234', resetToken: 't', keep: 1, deeper: { apiKey: 'k', jwt: 'j', ok: true } }, sessionId: 's' });
  assert.deepEqual(clean, { plan: 'pro', nested: { keep: 1, deeper: { ok: true } } });
});

// ------------------------------------------------------------------------------------ last active

test('last active is recorded, but at most once every few minutes', async () => {
  await User.updateOne({ _id: emailUserId }, { $set: { lastActiveAt: new Date(Date.now() - LAST_ACTIVE_RESOLUTION_MS - 1000) } });
  await call('GET', '/api/auth/me', undefined, userCookie);
  const first = (await User.findById(emailUserId).lean())!.lastActiveAt!;
  assert.ok(Date.now() - first.getTime() < 5000, 'refreshed once it was stale');
  const logged = await ActivityLog.countDocuments({});
  await call('GET', '/api/auth/me', undefined, userCookie);
  await call('GET', '/api/folders', undefined, userCookie);
  await call('GET', '/api/dashboard/stats', undefined, userCookie);
  assert.equal((await User.findById(emailUserId).lean())!.lastActiveAt!.getTime(), first.getTime(), 'not rewritten on every request');
  assert.equal(await ActivityLog.countDocuments({}), logged, 'ordinary requests write no activity entries');
});

// ------------------------------------------------------------------------------------ access

test('only administrators can reach user management and activity (403 user, 401 signed out)', async () => {
  for (const path of ['/api/admin/users', '/api/admin/users/stats', `/api/admin/users/${emailUserId}`, `/api/admin/users/${emailUserId}/activity`, '/api/admin/activity', '/api/admin/stats']) {
    assert.equal((await call('GET', path, undefined, admin)).status, 200, path);
    assert.equal((await call('GET', path, undefined, userCookie)).status, 403, path);
    assert.equal((await call('GET', path)).status, 401, path);
  }
  assert.equal((await call('PATCH', `/api/admin/users/${mobileUserId}/status`, { isActive: false }, userCookie)).status, 403);
  assert.equal((await User.findById(mobileUserId).lean())!.isActive, true);
});

// ------------------------------------------------------------------------------------ users list

test('users: stats come from the database', async () => {
  const { data } = await call('GET', '/api/admin/users/stats', undefined, admin);
  assert.deepEqual([data.total, data.active, data.suspended], [3, 3, 0]);
  assert.deepEqual(data.byProvider, { email: 2, mobile: 1, google: 0 });
  // Manu hasn't chosen yet, so uses Free (effectivePlan); administrators have no plan.
  assert.deepEqual(data.byPlan, { free: 2, pro: 0, premium: 0 });
});

test('users: search by name, email and mobile number', async () => {
  const ids = async (q: string) => (await call('GET', `/api/admin/users?search=${encodeURIComponent(q)}`, undefined, admin)).data.map((u: { id: string }) => u.id);
  assert.deepEqual(await ids('ella e.'), [emailUserId]);
  assert.deepEqual(await ids('ELLA@EXAMPLE'), [emailUserId]);
  assert.deepEqual(await ids('98111 00022'), [mobileUserId]);
  assert.deepEqual(await ids('100022'), [mobileUserId]);
  assert.deepEqual(await ids('.*'), [], 'text, not a pattern');
});

test('users: filters by provider, plan, role, status and signup date', async () => {
  const emails = async (q: string) => (await call('GET', `/api/admin/users?${q}`, undefined, admin)).data.map((u: { email: string | null; phone: string | null }) => u.email ?? u.phone).sort();
  assert.deepEqual(await emails('provider=mobile'), ['+919811100022']);
  assert.deepEqual(await emails('provider=email'), ['ella@example.com', 'root@example.com']);
  assert.deepEqual(await emails('provider=google'), []);
  assert.deepEqual(await emails('plan=free'), ['+919811100022', 'ella@example.com']);
  assert.deepEqual(await emails('plan=pro'), []);
  assert.deepEqual(await emails('role=admin'), ['root@example.com']);
  assert.deepEqual(await emails('role=user&status=active'), ['+919811100022', 'ella@example.com']);
  const future = new Date(Date.now() + 86_400_000).toISOString();
  assert.deepEqual(await emails(`from=${future}`), []);
  assert.deepEqual((await emails(`from=${new Date(Date.now() - 3_600_000).toISOString()}&to=${future}`)).length, 3);
  assert.equal((await call('GET', `/api/admin/users?from=${future}&to=${new Date().toISOString()}`, undefined, admin)).status, 400, 'a backwards range is refused');
  assert.equal((await call('GET', '/api/admin/users?provider=facebook', undefined, admin)).status, 400);
});

test('users: sorting and pagination', async () => {
  const page1 = await call('GET', '/api/admin/users?sort=name&limit=2&page=1', undefined, admin);
  const page2 = await call('GET', '/api/admin/users?sort=name&limit=2&page=2', undefined, admin);
  assert.deepEqual(page1.data.map((u: { name: string }) => u.name), ['Ella E.', 'Manu Mobile']);
  assert.deepEqual(page2.data.map((u: { name: string }) => u.name), ['Root']);
  assert.deepEqual(page1.meta, { page: 1, limit: 2, total: 3, totalPages: 2 });
  const oldest = await call('GET', '/api/admin/users?sort=oldest&limit=1', undefined, admin);
  assert.equal(oldest.data[0].email, 'root@example.com');
  const lastActive = await call('GET', '/api/admin/users?sort=last_active', undefined, admin);
  assert.ok(lastActive.data.every((u: { lastActiveAt: string | null }) => 'lastActiveAt' in u));
});

// ------------------------------------------------------------------------------------ detail

test('user detail: profile, verification, account and usage — and no secrets', async () => {
  const { status, data, raw } = await call('GET', `/api/admin/users/${mobileUserId}`, undefined, admin);
  assert.equal(status, 200);
  assert.equal(data.user.authProvider, 'mobile');
  assert.equal(data.user.mobileVerified, true);
  assert.ok(data.user.phoneVerifiedAt);
  assert.ok(data.user.lastLoginAt);
  assert.match(data.user.lastLoginIpMasked, /^198\.51\.100\.•••$/);
  assert.deepEqual(Object.keys(data.stats).sort(), ['documentCount', 'folderCount', 'imageCount', 'storageUsedBytes', 'trashCount', 'videoCount']);
  assert.ok(data.recentActivity.length > 0);
  for (const secret of ['passwordHash', 'passwordReset', 'otpHash', 'tokenVersion', 'googleId', 'lastLoginIp"', 'userAgent', 'clientTokenHash', '$2a$', '$2b$']) {
    assert.ok(!raw.includes(secret), `no ${secret}`);
  }
  assert.ok(!/198\.51\.100\.\d+/.test(raw), 'no unmasked IP address');
});

// ------------------------------------------------------------------------------------ activity

test('activity: entries carry the account, outcome, provider, device and a masked IP — nothing raw', async () => {
  const { data, raw } = await call('GET', `/api/admin/activity?userId=${emailUserId}&limit=100`, undefined, admin);
  const failed = data.find((e: { action: string }) => e.action === 'login_failed');
  assert.deepEqual([failed.status, failed.authProvider, failed.user.id], ['failure', 'email', emailUserId]);
  assert.deepEqual([failed.device, failed.os, failed.browser], ['Mobile', 'iOS', 'Safari']);
  assert.match(failed.ipMasked, /•••$/);
  assert.ok(!/198\.51\.100\.\d+"/.test(raw) && !raw.includes('userAgent') && !raw.includes('Mozilla'), 'no raw IP or user agent');
});

test('activity: filters by category, status, provider, account, search and date; sorts; pages', async () => {
  const get = async (q: string) => call('GET', `/api/admin/activity?${q}`, undefined, admin);
  const failures = await get('status=failure&limit=100');
  assert.ok(failures.data.length >= 4 && failures.data.every((e: { status: string }) => e.status === 'failure'));
  const signups = await get('category=signup&limit=100');
  assert.ok(signups.data.every((e: { categories: string[] }) => e.categories.includes('signup')));
  const mobile = await get('provider=mobile&limit=100');
  assert.ok(mobile.data.length >= 5 && mobile.data.every((e: { authProvider: string }) => e.authProvider === 'mobile'));
  const searched = await get(`search=${encodeURIComponent('ella@example.com')}&limit=100`);
  assert.ok(searched.data.length > 0 && searched.data.every((e: { message: string; user: { label: string } | null }) => /ella/i.test(e.message) || e.user?.label === 'ella@example.com'));
  assert.equal((await get(`from=${new Date(Date.now() + 86_400_000).toISOString()}`)).data.length, 0);

  const newest = await get('limit=5');
  const oldest = await get('limit=5&sort=oldest');
  const times = (r: { data: Array<{ createdAt: string }> }) => r.data.map((e) => new Date(e.createdAt).getTime());
  assert.deepEqual(times(newest), [...times(newest)].sort((a, b) => b - a));
  assert.deepEqual(times(oldest), [...times(oldest)].sort((a, b) => a - b));
  assert.equal(oldest.data[0].action, 'login', 'the oldest event is the admin’s own first sign-in');

  const p1 = await get('limit=3&page=1');
  const p2 = await get('limit=3&page=2');
  assert.equal(p1.meta.limit, 3);
  assert.ok(p1.meta.total >= 20);
  assert.equal(new Set([...p1.data, ...p2.data].map((e: { id: string }) => e.id)).size, 6, 'pages do not overlap');
  assert.equal((await get('status=maybe')).status, 400);
});

test('dashboard: user-activity figures come from the database', async () => {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  // One document and one photo (raw rows: only the counted fields matter here).
  const owner = new mongoose.Types.ObjectId(emailUserId);
  await Media.collection.insertMany([
    { ownerId: owner, fileType: 'document', size: 10, isDeleted: false, originalName: 'a.pdf' },
    { ownerId: owner, fileType: 'image', size: 20, isDeleted: false, originalName: 'b.png' },
    { ownerId: owner, fileType: 'document', size: 30, isDeleted: true, originalName: 'c.pdf' },
  ]);
  const { data } = await call('GET', `/api/admin/stats?todayStart=${midnight.toISOString()}`, undefined, admin);
  assert.equal(data.totalUsers, 3);
  assert.equal(data.totalDocuments, 1, 'live documents only, not photos or Trash');
  assert.equal(data.users.newThisWeek, 3);
  assert.deepEqual(data.users.newThisWeekByProvider, { email: 2, mobile: 1, google: 0 });
  assert.deepEqual(data.users.byProvider, { email: 2, mobile: 1, google: 0 });
  assert.equal(data.totalDocuments, await Media.countDocuments({ isDeleted: false, fileType: 'document' }));
  assert.equal(data.totalFolders, await Folder.countDocuments({ isDeleted: false }));
  assert.equal(data.users.loginsToday, await ActivityLog.countDocuments({ action: 'login', createdAt: { $gte: midnight } }));
  assert.equal(data.users.failedLoginsToday, await ActivityLog.countDocuments({ action: 'login_failed', createdAt: { $gte: midnight } }));
  assert.ok(data.users.activeToday >= 2);
  assert.deepEqual(data.users.byPlan, { free: 2, pro: 0, premium: 0 });
});

test('client info helpers: masked addresses, coarse devices', () => {
  assert.equal(maskIp('203.0.113.42'), '203.0.113.•••');
  assert.equal(maskIp('::ffff:203.0.113.42'), '203.0.113.•••');
  assert.equal(maskIp('2001:db8:85a3:8d3:1319:8a2e:370:7348'), '2001:db8:85a3:••••');
  assert.equal(maskIp(null), null);
  assert.deepEqual(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0'), { device: 'Desktop', os: 'Windows', browser: 'Edge' });
  assert.deepEqual(describeUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'), { device: 'Mobile', os: 'Android', browser: 'Chrome' });
});

test('the admin queries are served by indexes — never a scan of the whole collection', async () => {
  const user = (await User.findById(emailUserId))!;
  const planOf = async (query: { explain: (v: string) => Promise<unknown> }) =>
    JSON.stringify((await query.explain('queryPlanner')) as object).match(/"winningPlan".*$/s)![0];
  const plans: Record<string, string> = {
    'timeline page': await planOf(ActivityLog.find(userTimelineFilter(user)).sort({ createdAt: -1, _id: -1 }).limit(15)),
    'timeline count': await planOf(ActivityLog.find(userTimelineFilter(user))),
    'activity log, newest': await planOf(ActivityLog.find({}).sort({ createdAt: -1, _id: -1 }).limit(25)),
    'activity log, oldest': await planOf(ActivityLog.find({}).sort({ createdAt: 1, _id: 1 }).limit(25)),
    'activity log, failures': await planOf(ActivityLog.find({ status: 'failure' }).sort({ createdAt: -1, _id: -1 }).limit(25)),
    'logins today': await planOf(ActivityLog.find({ action: 'login', createdAt: { $gte: new Date(Date.now() - 86_400_000) } })),
    'users, newest': await planOf(User.find({}).sort({ createdAt: -1, _id: -1 }).limit(20)),
    'users, last active': await planOf(User.find({}).sort({ lastActiveAt: -1, lastLoginAt: -1, _id: -1 }).limit(20)),
  };
  for (const [name, plan] of Object.entries(plans)) {
    assert.ok(!plan.includes('COLLSCAN'), `${name} must not scan the collection`);
  }
});

test('no admin endpoint ever returns a secret, a raw address or a user agent', async () => {
  const paths = [
    '/api/admin/users?limit=100',
    `/api/admin/users/${emailUserId}`,
    `/api/admin/users/${mobileUserId}`,
    `/api/admin/users/${emailUserId}/activity?limit=100`,
    `/api/admin/users/${mobileUserId}/activity?limit=100`,
    '/api/admin/activity?limit=100',
    '/api/admin/activity?status=failure&limit=100',
    '/api/admin/users/stats',
    '/api/admin/stats',
  ];
  const forbidden = [
    '"password":', 'passwordHash', 'passwordReset', 'otpHash', '"otp":', '"code":', 'clientTokenHash', 'resetToken', 'tokenVersion',
    'googleId', 'credential', 'accessToken', 'refreshToken', 'apiKey', 'SMTP', 'JWT_SECRET', 'mt_session', 'userAgent',
    'lastLoginIp"', 'metadata', '$2a$', '$2b$', 'Mozilla/',
  ];
  for (const path of paths) {
    const { status, raw } = await call('GET', path, undefined, admin);
    assert.equal(status, 200, path);
    for (const needle of forbidden) assert.ok(!raw.includes(needle), `${path} must not contain ${needle}`);
    assert.ok(!/198\.51\.100\.\d{1,3}(?!\d)/.test(raw), `${path} must not contain an unmasked IP`);
  }
});
