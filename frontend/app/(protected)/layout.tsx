'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useNavigationRouter } from '@/lib/navigation/progress';
import { useAuth } from '@/lib/auth/AuthContext';
import { sessionEndedUrl } from '@/lib/auth/session';
import { ADMIN_HOME_PATH, LOGIN_PATH, ONBOARDING_PATH, USER_HOME_PATH } from '@/lib/auth/routes';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { GameLoading, isGameLoaderVariant } from '@/components/games/shared/GameLoading';
import { SessionCheckFailed } from '@/components/auth/SessionCheckFailed';
import { AdminShell } from '@/components/admin/AdminShell';
import { UploadProvider } from '@/lib/upload/UploadContext';
import { KidGameLoader } from '@/components/kid-games/loaders/KidGameLoader';
import { kidGameRouteSubject } from '@/lib/kid-games/routes';

/**
 * The authoritative auth gate for every signed-in page. proxy.ts already redirects
 * obvious logged-out visitors before this ever renders, but this is what actually
 * confirms the session is valid (via GET /api/auth/me) and reacts if it expires while
 * the app is open. The backend re-checks on every request regardless.
 *
 * This is the user application. Administrators may use its library pages too — an admin
 * account owns files like any other — but their dashboard is the admin one: /dashboard sends
 * an administrator to /admin/dashboard, so the personal dashboard never stands in for it
 * (a bookmark, a stale session's redirect, the logo). The role is the one /api/auth/me
 * reported, never the browser's own.
 */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, sessionError, refresh } = useAuth();
  const router = useNavigationRouter();
  const pathname = usePathname();
  // /games/<slug>: the first thing on screen while the session is checked is that game's own loader.
  const gameSlug = /^\/games\/([^/]+)\/?$/.exec(pathname)?.[1];
  // A Kid Game opens on its subject's own loader in the same way.
  const kidSubject = kidGameRouteSubject(pathname);

  // Only a session the server has actually rejected sends anyone away, and it leaves
  // with the marker that stops proxy.ts sending them back — see lib/auth/session.ts.
  // An unanswered check means the server is unreachable, which is rendered below
  // instead: signing someone out over a backend that is merely down would be a lie.
  const shouldRedirect = !isLoading && !user && sessionError !== 'unreachable';

  // A new account with onboarding still to do finishes it before using the app.
  const needsOnboarding = Boolean(user?.onboardingRequired);
  useEffect(() => {
    if (needsOnboarding) router.replace(ONBOARDING_PATH);
  }, [needsOnboarding, router]);

  const adminOnUserDashboard = user?.role === 'admin' && pathname === USER_HOME_PATH;
  useEffect(() => {
    if (adminOnUserDashboard) router.replace(ADMIN_HOME_PATH);
  }, [adminOnUserDashboard, router]);

  useEffect(() => {
    if (shouldRedirect) {
      router.replace(sessionError === 'rejected' ? sessionEndedUrl() : LOGIN_PATH);
    }
  }, [shouldRedirect, sessionError, router]);

  if (!isLoading && !user && sessionError === 'unreachable') {
    return <SessionCheckFailed onRetry={() => void refresh()} />;
  }

  if (isLoading || !user || needsOnboarding || adminOnUserDashboard) {
    if (kidSubject) return <KidGameLoader variant={kidSubject} layout="boot" />;
    return gameSlug && isGameLoaderVariant(gameSlug) ? <GameLoading variant={gameSlug} layout="boot" /> : <FullPageSpinner />;
  }

  // Inside the gate, not outside it: the queue and its progress panel belong to a signed-in
  // session, and tearing them down on sign-out is the point.
  return (
    <UploadProvider>
      <AdminShell>{children}</AdminShell>
    </UploadProvider>
  );
}
