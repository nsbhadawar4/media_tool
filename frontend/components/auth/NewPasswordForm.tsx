'use client';

import { useState, type FormEvent } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth/AuthContext';
import { ApiError } from '@/lib/api/client';
import { AuthField } from './AuthField';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Step 3 of ForgotPasswordFlow, reachable only after VerifyOtpForm hands back a
 * `resetToken` — there is no URL or other route to this step, so there is nothing to
 * validate about how it was reached beyond the token the backend itself checks.
 */
export function NewPasswordForm({ resetToken, onSuccess }: { resetToken: string; onSuccess: () => void }) {
  const { resetPassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      await resetPassword({ resetToken, newPassword, confirmPassword });
      // The backend has replaced every older session with a fresh cookie for this browser.
      onSuccess();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="gradient-border surface-glass anim-rise-scale w-full max-w-sm !bg-surface-elevated/70 p-6 shadow-pop sm:p-8">
      <div className="flex flex-col items-center text-center">
        <Logo className="anim-logo logo-glow h-14 w-14" />
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
          className="mt-2 inline-flex items-center justify-center gap-2 btn-primary rounded-xl px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </Card>
  );
}
