'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { AdminShell } from '@/components/admin/AdminShell';
import { UploadProvider } from '@/lib/upload/UploadContext';

/**
 * The authoritative auth gate for every signed-in page. proxy.ts already redirects
 * obvious logged-out visitors before this ever renders, but this is what actually
 * confirms the session is valid (via GET /api/auth/me) and reacts if it expires while
 * the app is open. The backend re-checks on every request regardless.
 */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return <FullPageSpinner />;
  }

  // Inside the gate, not outside it: the queue and its progress panel belong to a signed-in
  // session, and tearing them down on sign-out is the point.
  return (
    <UploadProvider>
      <AdminShell>{children}</AdminShell>
    </UploadProvider>
  );
}
