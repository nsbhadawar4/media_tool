import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignupSuccessNotice } from '@/components/auth/SignupSuccessNotice';
import { PasswordResetSuccessNotice } from '@/components/auth/PasswordResetSuccessNotice';
import { SessionExpiredNotice } from '@/components/auth/SessionExpiredNotice';
import { PublicReviews } from '@/components/reviews/PublicReviews';

export const metadata: Metadata = {
  title: 'Sign in — media_tool',
};

/**
 * Signing in is the root of this app.
 *
 * Nothing here is public apart from approved reviews (shown under the form once there are any),
 * so there is no landing page to show a signed-out visitor first — the form itself is the front door, and it lives at `/` so that is the only address
 * anyone needs. `/login` still works and redirects here, for links and bookmarks that
 * predate this.
 *
 * A visitor who still has a session never sees this: proxy.ts sends them to /dashboard
 * before it renders.
 */
export default function HomePage() {
  return (
    <main className="app-viewport-min-h auth-backdrop flex flex-col items-center justify-center gap-16 bg-background px-6 py-16">
      <div className="w-full max-w-sm">
        <Suspense fallback={null}>
          <SignupSuccessNotice />
        </Suspense>
        <Suspense fallback={null}>
          <PasswordResetSuccessNotice />
        </Suspense>
        <Suspense fallback={null}>
          <SessionExpiredNotice />
        </Suspense>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
      {/* Published reviews only; the section hides itself while there are none. */}
      <PublicReviews hideWhenEmpty className="max-w-6xl" />
    </main>
  );
}
