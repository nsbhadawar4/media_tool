'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Lock, ShieldAlert } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Card } from '@/components/ui/Card';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { AuthField } from './AuthField';

const MIN_PASSWORD_LENGTH = 8;

/** Shown instead of the form when the link carries no token at all — a mistyped or stale bookmark, not an expired one (the backend is what knows that). */
function MissingTokenNotice() {
  return (
    <Card className="w-full max-w-sm p-6 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
          <ShieldAlert className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-foreground">Invalid reset link</h1>
        <p className="mt-1.5 text-sm text-muted">
          This password reset link is missing its token. Request a new one below.
        </p>
      </div>
      <Link
        href="/forgot-password"
        className="mt-6 block text-center text-sm font-medium text-accent transition hover:text-accent-hover"
      >
        Request a new link
      </Link>
    </Card>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!token) return <MissingTokenNotice />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setPasswordError(undefined);
    setConfirmError(undefined);

    // Client-side purely for instant feedback; the backend runs the same rules
    // (validators/authValidators.ts's resetPasswordSchema) and is the one that decides.
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (confirmPassword !== newPassword) {
      setConfirmError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.resetPassword({ token, newPassword, confirmPassword });
      // No session to land in: a reset invalidates every session on this account, this
      // browser's included, so the sign-in form is the only place to go next.
      router.replace('/?reset=1');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-sm p-6 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <Logo className="h-14 w-14" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">Reset your password</h1>
        <p className="mt-1.5 text-sm text-muted">Choose a new password for your account.</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-4">
        <AuthField
          id="newPassword"
          label="New password"
          icon={<Lock className="h-4 w-4" />}
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={passwordError}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        />

        <AuthField
          id="confirmPassword"
          label="Confirm new password"
          icon={<Lock className="h-4 w-4" />}
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={confirmError}
          placeholder="Repeat your new password"
        />

        {formError && (
          <div
            role="alert"
            className="animate-fade-in rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </Card>
  );
}
