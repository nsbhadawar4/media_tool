import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? 'mt_session';

/** Signed-in areas of the app. Everything under these is gated. */
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/folders',
  '/media',
  '/documents',
  '/trash',
  '/activity',
  '/settings',
  '/admin',
];

/** Reached only while signed out; a live session is sent on to the app instead. */
const AUTH_PAGES = ['/login', '/signup', '/admin/login'];

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
    const loginUrl = new URL(pathname.startsWith('/admin') ? '/admin/login' : '/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && hasSessionCookie) {
    // Role is unknown here, so everyone goes to the user dashboard; an admin arriving
    // there can reach /admin from the sidebar.
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/signup',
    '/dashboard/:path*',
    '/folders/:path*',
    '/media/:path*',
    '/documents/:path*',
    '/trash/:path*',
    '/activity/:path*',
    '/settings/:path*',
    '/admin/:path*',
  ],
};
