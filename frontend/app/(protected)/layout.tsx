'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { sessionEndedUrl } from '@/lib/auth/session';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { GameLoading, isGameLoaderVariant } from '@/components/games/shared/GameLoading';
import { SessionCheckFailed } from '@/components/auth/SessionCheckFailed';
import { AdminShell } from '@/components/admin/AdminShell';
import { UploadProvider } from '@/lib/upload/UploadContext';

/**
 * The authoritative auth gate for every signed-in page. proxy.ts already redirects
 * obvious logged-out visitors before this ever renders, but this is what actually
 * confirms the session is valid (via GET /api/auth/me) and reacts if it expires while
 * the app is open. The backend re-checks on every request regardless.
 */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, sessionError, refresh } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // /games/<slug>: the first thing on screen while the session is checked is that game's own loader.
  const gameSlug = /^\/games\/([^/]+)\/?$/.exec(pathname)?.[1];

  // Only a session the server has actually rejected sends anyone away, and it leaves
  // with the marker that stops proxy.ts sending them back — see lib/auth/session.ts.
  // An unanswered check means the server is unreachable, which is rendered below
  // instead: signing someone out over a backend that is merely down would be a lie.
  const shouldRedirect = !isLoading && !user && sessionError !== 'unreachable';

  useEffect(() => {
    if (shouldRedirect) {
      router.replace(sessionError === 'rejected' ? sessionEndedUrl('/') : '/');
    }
  }, [shouldRedirect, sessionError, router]);

  if (!isLoading && !user && sessionError === 'unreachable') {
    return <SessionCheckFailed onRetry={() => void refresh()} />;
  }

  if (isLoading || !user) {
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
