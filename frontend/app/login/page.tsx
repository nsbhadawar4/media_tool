import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignupSuccessNotice } from '@/components/auth/SignupSuccessNotice';

export const metadata: Metadata = {
  title: 'Sign in — media_tool',
};

export default function LoginPage() {
  return (
    <main className="app-viewport-min-h flex items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-sm">
        <Suspense fallback={null}>
          <SignupSuccessNotice />
        </Suspense>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
