import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import { AuthHomeLink } from '@/components/auth/AuthHomeLink';
import { SignupSuccessNotice } from '@/components/auth/SignupSuccessNotice';
import { PasswordResetSuccessNotice } from '@/components/auth/PasswordResetSuccessNotice';
import { SessionExpiredNotice } from '@/components/auth/SessionExpiredNotice';

export const metadata: Metadata = {
  title: 'Sign in — media_tool',
};

/**
 * The one sign-in page, for normal users and administrators alike — the account's role
 * decides where a successful sign-in lands (see lib/auth/routes.ts), not which form was used.
 *
 * A visitor who still has a session never sees this: proxy.ts sends them to their own area
 * before it renders.
 */
export default function LoginPage() {
  return (
    <main className="app-viewport-min-h auth-backdrop relative flex flex-col items-center justify-center bg-background px-4 py-20 sm:px-6 sm:py-16">
      <AuthHomeLink />
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
    </main>
  );
}
