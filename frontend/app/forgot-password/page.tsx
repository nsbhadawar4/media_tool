import type { Metadata } from 'next';
import { ForgotPasswordFlow } from '@/components/auth/ForgotPasswordFlow';

export const metadata: Metadata = {
  title: 'Forgot password — media_tool',
};

export default function ForgotPasswordPage() {
  return (
    <main className="app-viewport-min-h flex items-center justify-center bg-background px-6 py-16">
      <ForgotPasswordFlow />
    </main>
  );
}
