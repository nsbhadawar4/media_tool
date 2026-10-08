/**
 * Where each role lands after signing in, and what the proxy may infer from a cookie.
 *
 * None of this is an authorization boundary — the admin layout and the backend's
 * requireAdmin are — but a wrong answer here would send admins into the user app, users into
 * a bounce loop through /admin, or anyone off-site through a crafted `?from=`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { homePathForRole, isPublicPath, postLoginPath, roleHintFromToken } from '../lib/auth/routes';

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
  assert.equal(postLoginPath('admin', '/dashboard'), '/dashboard', 'admins may use their own library');
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
