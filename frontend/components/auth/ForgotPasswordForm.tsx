'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { AuthField } from './AuthField';
import { AuthCard, authLinkClass } from './AuthCard';
import { FormAlert, SubmitButton } from './FormFeedback';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Step 1 of ForgotPasswordFlow. Moves on to the OTP step once the backend has accepted the
 * request. The backend answers every address the same way — it never says whether an account
 * exists — so the next step is worded for either case.
 */
export function ForgotPasswordForm({ initialEmail = '', onSent }: { initialEmail?: string; onSent: (email: string) => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | undefined>();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError(trimmed ? 'Enter a valid email address' : 'Please enter your email');
      return;
    }
    setEmailError(undefined);
    setIsSubmitting(true);
    try {
      await authApi.forgotPassword({ email: trimmed });
      onSent(trimmed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      step={{ current: 1, total: 3, label: 'Your email' }}
      title="Forgot your password?"
      subtitle="Enter the email you signed up with and we’ll send you a 4-digit code."
      footer={
        <Link href="/login" className={`${authLinkClass} inline-flex items-center gap-1.5`}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="mt-7 flex flex-col gap-4">
        <AuthField
          id="email"
          label="Email"
          icon={<Mail className="h-4 w-4" />}
          type="email"
          autoComplete="email"
          autoFocus={!initialEmail}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(undefined);
          }}
          error={emailError}
          placeholder="you@example.com"
        />
        <FormAlert>{error}</FormAlert>
        <SubmitButton busy={isSubmitting} idle="Send code" busyLabel="Sending code…" className="mt-1" />
      </form>
    </AuthCard>
  );
}
