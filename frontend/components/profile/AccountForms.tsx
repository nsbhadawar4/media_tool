'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, Loader2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AuthField } from '@/components/auth/AuthField';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import type { useToast } from '@/lib/toast/ToastContext';

/**
 * Account forms shared by the user's Profile page and the admin Settings page: the same
 * change-password flow (POST /api/auth/change-password, which needs the current password)
 * wherever an account manages itself.
 */

type Toast = ReturnType<typeof useToast>;

/** Shared frame for the two editable panels, so they read as a pair. */
export function FormCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-3xl border border-border bg-surface shadow-sm">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
      </header>
      <div className="flex-1 px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

/** Inline, dismissible-by-fixing error shown under a form rather than as a toast. */
export function FormError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="animate-fade-in rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs text-danger"
    >
      {message}
    </div>
  );
}

/** Changes the password, given the current one — a live session is not proof of identity. */
export function PasswordForm({ toast }: { toast: Toast }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = currentPassword !== '' && newPassword !== '' && confirmPassword !== '';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    // Checked here as well as on the server so the mismatch is caught before a round trip.
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSaving(true);
    try {
      await authApi.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FormCard
      icon={KeyRound}
      title="Password"
      description="Your current password is required to set a new one."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthField
          id="current-password"
          label="Current password"
          icon={<KeyRound className="h-4 w-4" />}
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <AuthField
          id="new-password"
          label="New password"
          icon={<KeyRound className="h-4 w-4" />}
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <AuthField
          id="confirm-new-password"
          label="Confirm new password"
          icon={<KeyRound className="h-4 w-4" />}
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        <p className="text-xs text-muted">At least 8 characters. You stay signed in here; your other devices are signed out.</p>

        {error && <FormError message={error} />}

        <div className="pt-1">
          <Button type="submit" disabled={!canSubmit || isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSaving ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}
