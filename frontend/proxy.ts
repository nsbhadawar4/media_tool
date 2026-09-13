import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? 'mt_session';

/**
 * Fast, optimistic redirect based on cookie *presence* only — it never verifies the
 * JWT signature (the frontend doesn't hold the backend's secret by design, keeping the
 * two services fully decoupled). AuthProvider + the backend's requireAuth middleware
 * remain the real authority; this just avoids a flash of protected UI before that
 * client-side check resolves.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  const isLoginPage = pathname === '/admin/login';
  const isProtectedAdminRoute = pathname.startsWith('/admin') && pathname !== '/admin' && !isLoginPage;

  if (isProtectedAdminRoute && !hasSessionCookie) {
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoginPage && hasSessionCookie) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
