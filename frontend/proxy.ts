import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_ENDED_PARAM, SESSION_ENDED_VALUE } from '@/lib/auth/session';

const SESSION_COOKIE_NAME = process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? 'mt_session';

/** Signed-in areas of the app. Everything under these is gated. */
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/folders',
  '/media',
  '/documents',
  '/trash',
  '/activity',
  '/profile',
  '/settings',
  '/admin',
];

/**
 * Reached only while signed out; a live session is sent on to the app instead.
 *
 * `/` is in here because the sign-in form is the root of this app (see app/page.tsx).
 * Without it, someone already signed in would land back on a login form instead of their
 * dashboard. `/login` stays listed: it redirects to `/`, and catching it here means a
 * signed-in visitor skips that hop entirely.
 */
const AUTH_PAGES = ['/', '/login', '/signup', '/admin/login'];

/**
 * Fast, optimistic redirect based on cookie *presence* only — it never verifies the
 * JWT signature (the frontend doesn't hold the backend's secret by design, keeping the
 * two services fully decoupled), and it cannot read the role out of the token either.
 *
 * So this is a convenience layer, not a security boundary: it avoids a flash of
 * protected UI. The real decisions are made by the backend's requireAuth/requireAdmin
 * on every request, and by the client-side guards in the (protected) and admin layouts.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  const isAuthPage = AUTH_PAGES.includes(pathname);
  const isProtected =
    !isAuthPage &&
    pathname !== '/admin' && // decides its own destination server-side
    PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (isProtected && !hasSessionCookie) {
    const loginUrl = new URL(pathname.startsWith('/admin') ? '/admin/login' : '/', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && hasSessionCookie) {
    /**
     * Unless the app has already been told this session is dead. Bouncing on cookie
     * presence is an optimisation for someone who is still signed in; applied to a
     * cookie the backend has rejected it is a trap, because the auth gate on the other
     * side sends them right back here and neither party ever gives way — see
     * lib/auth/session.ts. The marker is the app reporting a verified 401, so this
     * stands aside and lets the sign-in form render.
     */
    if (request.nextUrl.searchParams.get(SESSION_ENDED_PARAM) === SESSION_ENDED_VALUE) {
      // And the cookie goes with it. Leaving it in place would send the very next visit
      // to `/` back into the same loop, and the backend's own clearing of it can't be
      // relied on here: it only happens on a request that actually reaches the backend.
      const response = NextResponse.next();
      response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }

    // Role is unknown here, so everyone goes to the user dashboard; an admin arriving
    // there can reach /admin from the sidebar.
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/signup',
    '/dashboard/:path*',
    '/folders/:path*',
    '/media/:path*',
    '/documents/:path*',
    '/trash/:path*',
    '/activity/:path*',
    '/profile/:path*',
    '/settings/:path*',
    '/admin/:path*',
  ],
};
