/**
 * Where each role lands after signing in, and what the proxy may infer from a cookie.
 *
 * None of this is an authorization boundary — the admin layout and the backend's
 * requireAdmin are — but a wrong answer here would send admins into the user app, users into
 * a bounce loop through /admin, or anyone off-site through a crafted `?from=`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { homePathForRole, isPublicPath, postLoginPath, roleHintFromToken, showsSignInToSwitchAccount } from '../lib/auth/routes';
import { ADMIN_NAV_GROUPS, USER_NAV_GROUPS, isNavItemActive, liveNavItems } from '../components/admin/navItems';
import { adminCrumbs, userCrumbs } from '../lib/admin/breadcrumbs';

function fakeToken(payload: unknown): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

test('each role has its own home', () => {
  assert.equal(homePathForRole('admin'), '/admin/dashboard');
  assert.equal(homePathForRole('user'), '/dashboard');
  assert.equal(homePathForRole(null), '/dashboard', 'an unknown role gets the least privileged area');
});

test('signing in with no return path lands on the role home', () => {
  assert.equal(postLoginPath('admin', null), '/admin/dashboard');
  assert.equal(postLoginPath('user', null), '/dashboard');
});

test('a same-site return path is honoured', () => {
  assert.equal(postLoginPath('user', '/folders/abc'), '/folders/abc');
  assert.equal(postLoginPath('admin', '/admin/users'), '/admin/users');
});

test('an administrator always lands in the admin panel, never on the personal dashboard', () => {
  // The proxy records ?from=/dashboard when a signed-out visit to it is sent to sign in.
  assert.equal(postLoginPath('admin', '/dashboard'), '/admin/dashboard');
  assert.equal(postLoginPath('admin', '/folders/abc'), '/admin/dashboard');
  assert.equal(postLoginPath('admin', '/manage-storage'), '/admin/dashboard');
  assert.equal(postLoginPath('admin', '/admin/content/sections'), '/admin/content/sections');
});

test('a normal user is never sent into the admin panel', () => {
  assert.equal(postLoginPath('user', '/admin/dashboard'), '/dashboard');
  assert.equal(postLoginPath('user', '/admin'), '/dashboard');
});

test('an off-site return path is ignored', () => {
  for (const from of ['https://evil.example', '//evil.example', '/\\evil.example', 'dashboard']) {
    assert.equal(postLoginPath('user', from), '/dashboard', from);
  }
});

test('the role hint is read from the token payload', () => {
  assert.equal(roleHintFromToken(fakeToken({ sub: '1', role: 'admin' })), 'admin');
  assert.equal(roleHintFromToken(fakeToken({ sub: '1', role: 'user' })), 'user');
});

test('a missing, malformed or unexpected role yields no hint', () => {
  assert.equal(roleHintFromToken(undefined), null);
  assert.equal(roleHintFromToken('not-a-jwt'), null);
  assert.equal(roleHintFromToken('a.%%%.c'), null);
  assert.equal(roleHintFromToken(fakeToken({ sub: '1', role: 'super_admin' })), null);
  assert.equal(roleHintFromToken(fakeToken({ sub: '1' })), null);
});

test('only the public site and sign-in flow skip the session check', () => {
  for (const path of ['/', '/privacy', '/terms', '/contact', '/login', '/signup', '/forgot-password']) {
    assert.equal(isPublicPath(path), true, path);
  }
  for (const path of ['/dashboard', '/media', '/games/ludo', '/admin', '/admin/dashboard', '/profile', '/privacy/x']) {
    assert.equal(isPublicPath(path), false, path);
  }
});

test('unfinished onboarding comes before any destination — but never for admins', () => {
  assert.equal(postLoginPath('user', null, true), '/onboarding');
  assert.equal(postLoginPath('user', '/media', true), '/onboarding', 'even with a return path');
  assert.equal(postLoginPath('admin', null, true), '/admin/dashboard', 'admins never onboard');
  assert.equal(postLoginPath('user', null, false), '/dashboard');
  assert.equal(isPublicPath('/onboarding'), false, 'onboarding needs a session check');
});

test('Manage Storage: signed out goes to sign-in and comes back; signed in passes through', async () => {
  const { NextRequest } = await import('next/server');
  const { proxy, config } = await import('../proxy');
  assert.ok(config.matcher.includes('/manage-storage/:path*'), 'the proxy runs on /manage-storage');

  const signedOut = proxy(new NextRequest('https://app.example.com/manage-storage'));
  assert.equal(signedOut.status, 307);
  const location = new URL(signedOut.headers.get('location')!);
  assert.equal(location.pathname, '/login');
  assert.equal(location.searchParams.get('from'), '/manage-storage');
  assert.equal(postLoginPath('user', location.searchParams.get('from')), '/manage-storage', 'and back again after signing in');

  const signedIn = proxy(new NextRequest('https://app.example.com/manage-storage', { headers: { cookie: 'mt_session=token' } }));
  assert.equal(signedIn.headers.get('location'), null);
  assert.equal(isPublicPath('/manage-storage'), false, 'never treated as public');
});

test('signed in with a normal account, the admin sign-in form is reachable (to switch accounts)', () => {
  // The bug: a normal session bounced /login straight back to /dashboard, so the admin account
  // could never be signed in to without finding "sign out" first.
  assert.equal(showsSignInToSwitchAccount('/login', '/admin/dashboard', 'user'), true);
  assert.equal(showsSignInToSwitchAccount('/login', '/admin/users', null), true, 'unreadable token: still allowed to sign in');
  assert.equal(showsSignInToSwitchAccount('/login', '/admin/dashboard', 'admin'), false, 'already an admin: straight in');
  assert.equal(showsSignInToSwitchAccount('/login', '/dashboard', 'user'), false);
  assert.equal(showsSignInToSwitchAccount('/login', null, 'user'), false);
  assert.equal(showsSignInToSwitchAccount('/signup', '/admin/dashboard', 'user'), false);
});

test('admin and user navigation stay separate; the admin panel links every management page', () => {
  const admin = liveNavItems(ADMIN_NAV_GROUPS).map((i) => i.href);
  const user = liveNavItems(USER_NAV_GROUPS).map((i) => i.href);
  for (const href of [
    '/admin/dashboard',
    '/admin/users',
    '/admin/activity',
    '/admin/reviews',
    '/admin/content',
    '/admin/content/sections',
    '/admin/content/classes',
    '/admin/content/subjects',
    '/admin/content/courses',
    '/admin/content/games',
    '/admin/settings',
  ]) {
    assert.ok(admin.includes(href), href);
  }
  assert.ok(admin.every((h) => h.startsWith('/admin/')), 'no user pages in the admin nav');
  assert.ok(user.every((h) => !h.startsWith('/admin')), 'no admin pages in the user nav');
  // The content overview lights up on its own page only; its sub-pages have their own entries.
  assert.equal(isNavItemActive('/admin/content', '/admin/content', true), true);
  assert.equal(isNavItemActive('/admin/content/classes', '/admin/content', true), false);
  assert.equal(isNavItemActive('/admin/content/classes', '/admin/content/classes'), true);
});

test('admin breadcrumbs name every admin page, and only admin pages', () => {
  const labels = (p: string) => adminCrumbs(p).map((c) => c.label);
  assert.deepEqual(labels('/admin/dashboard'), ['Admin', 'Dashboard']);
  assert.deepEqual(labels('/admin/users/6a1b2c3d4e5f60718293a4b5'), ['Admin', 'Users', 'User details']);
  assert.deepEqual(labels('/admin/activity'), ['Admin', 'User activity']);
  assert.deepEqual(labels('/admin/content/sections'), ['Admin', 'Content', 'Website sections']);
  assert.deepEqual(labels('/admin/content/games'), ['Admin', 'Content', 'Educational games']);
  assert.deepEqual(labels('/admin/content/courses/new'), ['Admin', 'Content', 'Courses', 'New course']);
  assert.deepEqual(labels('/admin/content/courses/6a1b2c3d4e5f60718293a4b5'), ['Admin', 'Content', 'Courses', 'Edit course']);
  assert.deepEqual(adminCrumbs('/admin/content/classes').map((c) => c.href), ['/admin/dashboard', '/admin/content', '/admin/content/classes']);
  assert.deepEqual(adminCrumbs('/dashboard'), []);
  assert.deepEqual(adminCrumbs('/administrator'), []);
});

test('user breadcrumbs follow the library, never the admin panel', () => {
  const labels = (p: string) => userCrumbs(p).map((c) => c.label);
  assert.deepEqual(labels('/dashboard'), ['Library', 'Dashboard']);
  assert.deepEqual(labels('/media'), ['Library', 'Media']);
  assert.deepEqual(labels('/manage-storage'), ['Library', 'Storage']);
  assert.deepEqual(labels('/folders/6a1b2c3d4e5f60718293a4b5'), ['Library', 'Folders', 'Folder']);
  assert.deepEqual(labels('/games/memory-match'), ['Library', 'Games', 'Memory Match']);
  assert.deepEqual(labels('/kid-games/class-1/math'), ['Library', 'Kid Games', 'Class 1', 'Mathematics']);
  assert.deepEqual(labels('/kid-games/class-1/math/c1-math-quiz'), ['Library', 'Kid Games', 'Class 1', 'Mathematics', 'Game']);
  assert.deepEqual(labels('/courses/counting-to-20'), ['Library', 'Courses', 'Counting To 20']);
  assert.deepEqual(userCrumbs('/admin/dashboard'), [], 'no library trail inside the admin panel');
  assert.deepEqual(userCrumbs('/'), []);
});
