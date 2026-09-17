import type { Metadata } from 'next';
import { SignupForm } from '@/components/auth/SignupForm';

export const metadata: Metadata = {
  title: 'Create account — media_tool',
};

export default function SignupPage() {
  return (
    <main className="app-viewport-min-h flex items-center justify-center bg-background px-6 py-16">
      <SignupForm />
    </main>
  );
}
