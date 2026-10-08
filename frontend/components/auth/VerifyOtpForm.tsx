'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { OtpInput } from './OtpInput';
import { ExpiryCountdown, ResendButton, useSecondsUntil } from './OtpTimers';
import { AuthCard } from './AuthCard';
import { FormAlert, SubmitButton } from './FormFeedback';

const OTP_LENGTH = 4;
/** Match the backend (passwordResetService.ts): codes last 10 minutes, resends wait 60 seconds. */
const CODE_TTL_SECONDS = 10 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

const deadlinesFromNow = () => ({ expiresAt: Date.now() + CODE_TTL_SECONDS * 1000, resendAt: Date.now() + RESEND_COOLDOWN_SECONDS * 1000 });

/**
 * Step 2 of ForgotPasswordFlow: the 4-digit code just emailed to `email`. Typing the fourth
 * digit submits. Every failure gets the same message from the server — it never says whether
 * the address has an account.
 */
export function VerifyOtpForm({
  email,
  onVerified,
  onChangeEmail,
}: {
  email: string;
  onVerified: (resetToken: string) => void;
  onChangeEmail: () => void;
}) {
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [deadlines, setDeadlines] = useState(deadlinesFromNow);
  const submittedFor = useRef<string | null>(null);

  const expiresIn = useSecondsUntil(deadlines.expiresAt, CODE_TTL_SECONDS);
  const resendIn = useSecondsUntil(deadlines.resendAt, RESEND_COOLDOWN_SECONDS);
  const expired = expiresIn === 0;

  const verify = async (code: string) => {
    if (code.length !== OTP_LENGTH || isVerifying || verified || expired) return;
    submittedFor.current = code;
    setError(null);
    setResendMessage(null);
    setIsVerifying(true);
    try {
      const { data } = await authApi.verifyOtp({ email, otp: code });
      setVerified(true);
      window.setTimeout(() => onVerified(data.resetToken), 600);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setErrorKey((k) => k + 1);
      setOtp('');
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    if (otp.length === OTP_LENGTH && submittedFor.current !== otp) void verify(otp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const handleVerify = (event: FormEvent) => {
    event.preventDefault();
    submittedFor.current = null;
    void verify(otp);
  };

  const handleResend = async () => {
    setError(null);
    setResendMessage(null);
    setIsResending(true);
    try {
      await authApi.forgotPassword({ email });
      setOtp('');
      submittedFor.current = null;
      setDeadlines(deadlinesFromNow());
      setResendMessage('If an account exists for that email, a new code is on its way.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const errorId = 'reset-otp-error';

  return (
    <AuthCard
      step={{ current: 2, total: 3, label: 'Enter code' }}
      title="Check your email"
      subtitle={
        <>
          If an account exists for <span className="break-all font-semibold text-foreground">{email}</span>, we’ve sent it a 4-digit code.
        </>
      }
    >
      <form onSubmit={handleVerify} noValidate className="mt-7 flex flex-col gap-5">
        <OtpInput
          length={OTP_LENGTH}
          value={otp}
          onChange={setOtp}
          error={Boolean(error)}
          errorKey={errorKey}
          success={verified}
          disabled={isVerifying || verified || expired}
          autoFocus
          describedBy={error || expired ? errorId : undefined}
        />

        {!expired && !verified && <ExpiryCountdown seconds={expiresIn} />}

        <FormAlert id={errorId}>{error ?? (expired ? 'This code has expired. Request a new one.' : null)}</FormAlert>
        <FormAlert tone="success">{!error ? resendMessage : null}</FormAlert>

        <SubmitButton
          busy={isVerifying}
          done={verified}
          disabled={otp.length !== OTP_LENGTH || expired}
          idle="Verify code"
          busyLabel="Verifying…"
          doneLabel="Code verified"
        />

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onChangeEmail}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Change email
          </button>
          <ResendButton secondsLeft={resendIn} total={RESEND_COOLDOWN_SECONDS} busy={isResending} disabled={verified} onResend={() => void handleResend()} />
        </div>
      </form>
    </AuthCard>
  );
}
