'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { VerifyOtpForm } from './VerifyOtpForm';
import { NewPasswordForm } from './NewPasswordForm';

type Step =
  | { name: 'email' }
  | { name: 'otp'; email: string }
  | { name: 'password'; resetToken: string };

/**
 * The three-step forgot-password flow, kept as one client component with in-memory step
 * state rather than three routed pages. There is no link in the reset email anymore —
 * just a 4-digit code — so there is nothing to deep-link into: the `resetToken` that
 * authorizes the final step only ever exists as this component's state, never in a URL,
 * never in browser history.
 */
export function ForgotPasswordFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'email' });

  switch (step.name) {
    case 'email':
      return <ForgotPasswordForm onSent={(email) => setStep({ name: 'otp', email })} />;
    case 'otp':
      return (
        <VerifyOtpForm
          email={step.email}
          onVerified={(resetToken) => setStep({ name: 'password', resetToken })}
        />
      );
    case 'password':
      return (
        <NewPasswordForm resetToken={step.resetToken} onSuccess={() => router.replace('/dashboard')} />
      );
  }
}
