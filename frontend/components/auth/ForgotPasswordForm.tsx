'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Card } from '@/components/ui/Card';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { AuthField } from './AuthField';

/**
 * Step 1 of ForgotPasswordFlow. Always moves on to the OTP step on a successful submit,
 * whichever email was entered — the backend answers identically whether or not the
 * address has an account (see backend/src/services/passwordResetService.ts), so there is
 * no answer here that could reveal the difference either.
 */
export function ForgotPasswordForm({ onSent }: { onSent: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const trimmed = email.trim();
    try {
      await authApi.forgotPassword({ email: trimmed });
      onSent(trimmed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-sm p-6 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <Logo className="h-14 w-14" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">Forgot password?</h1>
        <p className="mt-1.5 text-sm text-muted">Enter your email and we&apos;ll send you a 4-digit code.</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <AuthField
          id="email"
          label="Email"
          icon={<Mail className="h-4 w-4" />}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        {error && (
          <div
            role="alert"
            className="animate-fade-in rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Sending…' : 'Send OTP'}
        </button>
      </form>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <ArrowLeft className="h-3.5 w-3.5" />
        <Link href="/" className="font-medium text-accent transition hover:text-accent-hover">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
