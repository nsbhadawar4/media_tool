'use client';

import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { ApiError } from '@/lib/api/client';
import { passwordProblem } from '@/lib/auth/passwordRules';
import type { UserProfile } from '@/types/api';
import { AuthField } from './AuthField';
import { AuthCard } from './AuthCard';
import { FormAlert, SubmitButton } from './FormFeedback';
import { PasswordChecklist } from './PasswordChecklist';

/**
 * Step 3 of ForgotPasswordFlow, reachable only after VerifyOtpForm hands back a
 * `resetToken` — there is no URL or other route to this step, so there is nothing to
 * validate about how it was reached beyond the token the backend itself checks.
 *
 * Asks for the same strength as a new account (the live checklist); the backend's own minimum
 * is the final word.
 */
export function NewPasswordForm({ resetToken, onSuccess }: { resetToken: string; onSuccess: (user: UserProfile) => void }) {
  const { resetPassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setPasswordError(undefined);
    setConfirmError(undefined);

    const problem = passwordProblem(newPassword);
    if (problem) return setPasswordError(problem);
    if (!confirmPassword) return setConfirmError('Please confirm your new password');
    if (confirmPassword !== newPassword) return setConfirmError('Passwords do not match');

    setIsSubmitting(true);
    try {
      const user = await resetPassword({ resetToken, newPassword, confirmPassword });
      // The backend has replaced every older session with a fresh cookie for this browser.
      setDone(true);
      window.setTimeout(() => onSuccess(user), 900);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard step={{ current: 3, total: 3, label: 'New password' }} title="Choose a new password" subtitle="You’ll be signed in on this device, and signed out everywhere else.">
      <form onSubmit={handleSubmit} noValidate className="mt-7 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <AuthField
            id="newPassword"
            label="New password"
            icon={<Lock className="h-4 w-4" />}
            type="password"
            autoComplete="new-password"
            autoFocus
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setPasswordError(undefined);
            }}
            error={passwordError}
            placeholder="Create a strong password"
            disabled={done}
          />
          <PasswordChecklist password={newPassword} />
        </div>

        <AuthField
          id="confirmPassword"
          label="Confirm new password"
          icon={<Lock className="h-4 w-4" />}
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setConfirmError(undefined);
          }}
          error={confirmError}
          placeholder="Repeat your new password"
          disabled={done}
        />

        <FormAlert>{formError}</FormAlert>
        <FormAlert tone="success">{done ? 'Password updated. Taking you to your account…' : null}</FormAlert>

        <SubmitButton busy={isSubmitting} done={done} idle="Update password" busyLabel="Updating…" doneLabel="Password updated" className="mt-1" />
      </form>
    </AuthCard>
  );
}
