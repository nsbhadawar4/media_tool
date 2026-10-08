import type { Metadata } from 'next';
import { ForgotPasswordFlow } from '@/components/auth/ForgotPasswordFlow';
import { AuthHomeLink } from '@/components/auth/AuthHomeLink';

export const metadata: Metadata = {
  title: 'Forgot password — media_tool',
};

export default function ForgotPasswordPage() {
  return (
    <main className="app-viewport-min-h auth-backdrop relative flex items-center justify-center bg-background px-4 py-20 sm:px-6 sm:py-16">
      <AuthHomeLink />
      <ForgotPasswordFlow />
    </main>
  );
}
