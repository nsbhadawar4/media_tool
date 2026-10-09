import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_ENDED_PARAM, SESSION_ENDED_VALUE } from '@/lib/auth/session';
import { LOGIN_PATH, homePathForRole, roleHintFromToken, showsSignInToSwitchAccount } from '@/lib/auth/routes';

const SESSION_COOKIE_NAME = process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? 'mt_session';

/**
 * Signed-in areas of the app. Everything under these is gated: the user application, and
 * the admin panel under /admin. The public website (`/`, /privacy, /terms, /contact) is
 * deliberately absent — a signed-out visitor must be able to read it.
 */
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/folders',
  '/media',
  '/documents',
  '/games',
  '/kid-games',
  '/courses',
  '/trash',
  '/activity',
  '/profile',
  '/settings',
  '/manage-storage',
  '/onboarding',
  '/admin',
];

/**
 * Reached only while signed out; a live session is sent on to its own area instead.
 *
 * `/` is the public website, and is here so that someone already signed in — opening the
 * bare domain, a bookmark, or the "media_tool home" link — lands in their app rather than on
 * the marketing page. A cookie the backend no longer accepts does not trap them: the app's
 * auth gate turns the 401 into /login?session=expired, which clears it (below), after which
 * `/` shows the public site as normal.
 *
 * `/admin/login` is a legacy address that forwards to /login, listed so a signed-in visitor
 * skips that hop.
 */
const AUTH_PAGES = ['/', LOGIN_PATH, '/signup', '/admin/login'];

/**
 * Fast, optimistic redirect based on cookie *presence* — it never verifies the JWT signature
 * (the frontend doesn't hold the backend's secret by design, keeping the two services fully
 * decoupled).
 *
 * So this is a convenience layer, not a security boundary: it avoids a flash of protected UI.
 * The real decisions are made by the backend's requireAuth/requireAdmin on every request,
 * and by the client-side guards in the (protected) and admin layouts, which check the role
 * the server reports — never the one in the cookie.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const hasSessionCookie = Boolean(sessionToken);

  const isAuthPage = AUTH_PAGES.includes(pathname);
  const isProtected =
    !isAuthPage && PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (isProtected && !hasSessionCookie) {
    // One sign-in page for both areas; the role decides where it lands afterwards.
    const loginUrl = new URL(LOGIN_PATH, request.url);
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
      // back into the same loop, and the backend's own clearing of it can't be relied on
      // here: it only happens on a request that actually reaches the backend.
      const response = NextResponse.next();
      response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }

    const roleHint = roleHintFromToken(sessionToken);

    /**
     * Switching to the administrator account. Someone signed in with a normal account who
     * asks to sign in for the admin panel (/login?from=/admin/…) gets the sign-in form rather
     * than a bounce back to their own dashboard — otherwise there is no way to reach the
     * admin sign-in without finding "sign out" first. Showing a public form grants nothing:
     * signing in replaces the session, and the server decides the role.
     */
    if (showsSignInToSwitchAccount(pathname, request.nextUrl.searchParams.get('from'), roleHint)) {
      return NextResponse.next();
    }

    // The token's role claim only picks the door; if it is stale (role changed since
    // sign-in) the layout on the other side corrects it from the live account.
    return NextResponse.redirect(new URL(homePathForRole(roleHint), request.url));
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
    '/games/:path*',
    '/kid-games/:path*',
    '/courses/:path*',
    '/trash/:path*',
    '/activity/:path*',
    '/profile/:path*',
    '/settings/:path*',
    '/manage-storage/:path*',
    '/onboarding/:path*',
    '/admin/:path*',
  ],
};
