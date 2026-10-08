import type { Metadata } from 'next';
import { SignupForm } from '@/components/auth/SignupForm';
import { AuthHomeLink } from '@/components/auth/AuthHomeLink';

export const metadata: Metadata = {
  title: 'Create account — media_tool',
};

export default function SignupPage() {
  return (
    <main className="app-viewport-min-h auth-backdrop relative flex items-center justify-center bg-background px-4 py-20 sm:px-6 sm:py-16">
      <AuthHomeLink />
      <SignupForm />
    </main>
  );
}
