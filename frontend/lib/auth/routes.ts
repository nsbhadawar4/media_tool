import type { UserRole } from '@/types/api';

/**
 * Where each of the app's three areas begins. Kept in one module so the proxy, the auth
 * gates and every post-sign-in redirect agree on them.
 *
 *  - Public website: `/` (and later /features, /pricing) — never gated.
 *  - User application: /dashboard and the library pages under the (protected) layout.
 *  - Admin panel: /admin/* under the admin/(dashboard) layout.
 */
export const LOGIN_PATH = '/login';
export const USER_HOME_PATH = '/dashboard';
export const ADMIN_HOME_PATH = '/admin/dashboard';
/** First-time setup (welcome → plan) for new accounts that need it. Never for admins. */
export const ONBOARDING_PATH = '/onboarding';

/** Where a freshly signed-in account belongs when nothing more specific was asked for. */
export function homePathForRole(role: UserRole | null | undefined): string {
  return role === 'admin' ? ADMIN_HOME_PATH : USER_HOME_PATH;
}

/**
 * Pages anyone may view signed out: the public website and the sign-in flow. A signed-in
 * visitor never lands on them (proxy.ts redirects), so nothing on them needs to know who is
 * signed in — which is what lets AuthProvider skip its session check there.
 */
const PUBLIC_PATHS = new Set(['/', '/privacy', '/terms', '/contact', LOGIN_PATH, '/signup', '/forgot-password', '/admin/login']);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/**
 * The page to land on after signing in: the `?from=` the proxy recorded when it sent the
 * visitor to sign in, if it is safe to honour, otherwise the role's home.
 *
 * `from` is visitor-controlled, so it must be a same-site path — `//evil.example` and
 * `/\evil.example` are both read by browsers as another host. A non-admin is also never sent
 * into /admin: the admin layout would only bounce them back out again.
 */
export function postLoginPath(role: UserRole, from: string | null | undefined, onboardingRequired = false): string {
  // Unfinished onboarding comes first, wherever they were heading.
  if (onboardingRequired && role !== 'admin') return ONBOARDING_PATH;
  const home = homePathForRole(role);
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return home;
  if (isAdminPath(from) && role !== 'admin') return home;
  return from;
}

/**
 * The role claim inside a session token, read *without* verifying the signature.
 *
 * Only for choosing a redirect destination in proxy.ts, which does not hold the backend's
 * secret by design. It is never an authorization decision: a forged or stale claim at most
 * sends someone to the other area's front door, where the layout's /api/auth/me check and the
 * backend's requireAdmin turn them away.
 */
export function roleHintFromToken(token: string | undefined): UserRole | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return role === 'admin' || role === 'user' ? role : null;
  } catch {
    return null;
  }
}
