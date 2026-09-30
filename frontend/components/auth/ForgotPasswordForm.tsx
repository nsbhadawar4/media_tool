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
 * Step 1 of ForgotPasswordFlow. Moves on to the OTP step only once the backend has
 * confirmed the account exists and sent a code; an unknown address is a 404 shown as an
 * error on the email field.
 */
export function ForgotPasswordForm({ onSent }: { onSent: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | undefined>();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setEmailError(undefined);
    setIsSubmitting(true);
    const trimmed = email.trim();
    try {
      await authApi.forgotPassword({ email: trimmed });
      onSent(trimmed);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setEmailError('No existing account on this email address.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      }
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
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(undefined);
          }}
          error={emailError}
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
