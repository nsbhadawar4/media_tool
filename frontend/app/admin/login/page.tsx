import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import { SessionExpiredNotice } from '@/components/auth/SessionExpiredNotice';

export const metadata: Metadata = {
  title: 'Admin sign in — media_tool',
};

export default function AdminLoginPage() {
  return (
    <main className="app-viewport-min-h flex items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-sm">
        <Suspense fallback={null}>
          <SessionExpiredNotice />
        </Suspense>
        <Suspense fallback={null}>
          <LoginForm variant="admin" />
        </Suspense>
      </div>
    </main>
  );
}
