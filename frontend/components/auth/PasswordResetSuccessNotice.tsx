'use client';

import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

/**
 * Shown after NewPasswordForm (the last step of ForgotPasswordFlow) redirects here. The
 * backend does not log the new password in (see passwordResetService — a reset
 * invalidates every session, this account's included), so without this the sign-in form
 * would give no sign that the reset worked.
 */
export function PasswordResetSuccessNotice() {
  const reset = useSearchParams().get('reset');
  if (!reset) return null;

  return (
    <div
      role="status"
      className="animate-fade-in mb-6 flex items-start gap-2.5 rounded-xl border border-success/30 bg-success/10 px-3.5 py-3 text-xs text-success"
    >
      <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
      <span>Password reset successfully. Please sign in.</span>
    </div>
  );
}
