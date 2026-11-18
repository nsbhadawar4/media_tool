'use client';

import { useState } from 'react';
import { useNavigationRouter } from '@/lib/navigation/progress';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { VerifyOtpForm } from './VerifyOtpForm';
import { NewPasswordForm } from './NewPasswordForm';
import { homePathForRole } from '@/lib/auth/routes';

type Step =
  | { name: 'email'; email?: string }
  | { name: 'otp'; email: string }
  | { name: 'password'; resetToken: string };

export function ForgotPasswordFlow() {
  const router = useNavigationRouter();
  const [step, setStep] = useState<Step>({ name: 'email' });

  switch (step.name) {
    case 'email':
      return <ForgotPasswordForm initialEmail={step.email} onSent={(email) => setStep({ name: 'otp', email })} />;
    case 'otp':
      return (
        <VerifyOtpForm
          email={step.email}
          onVerified={(resetToken) => setStep({ name: 'password', resetToken })}
          onChangeEmail={() => setStep({ name: 'email', email: step.email })}
        />
      );
    case 'password':
      return (
        <NewPasswordForm resetToken={step.resetToken} onSuccess={(user) => router.replace(homePathForRole(user.role))} />
      );
  }
}
