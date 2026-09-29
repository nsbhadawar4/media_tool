'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Card } from '@/components/ui/Card';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { OtpInput } from './OtpInput';

const OTP_LENGTH = 4;
/** Matches the backend's resend cooldown (passwordResetService.ts) — see that file for why. */
const RESEND_COOLDOWN_SECONDS = 60;

/** Step 2 of ForgotPasswordFlow: the 4-digit code just emailed to `email`. */
export function VerifyOtpForm({
  email,
  onVerified,
}: {
  email: string;
  onVerified: (resetToken: string) => void;
}) {
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsVerifying(true);
    try {
      const { data } = await authApi.verifyOtp({ email, otp });
      onVerified(data.resetToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setResendMessage(null);
    setIsResending(true);
    try {
      await authApi.forgotPassword({ email });
      setOtp('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setResendMessage('A new code has been sent.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Card className="w-full max-w-sm p-6 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <Logo className="h-14 w-14" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">Verify OTP</h1>
        <p className="mt-1.5 text-sm text-muted">Enter the 4-digit OTP sent to your email.</p>
      </div>

      <form onSubmit={handleVerify} className="mt-8 flex flex-col items-center gap-4">
        <OtpInput length={OTP_LENGTH} value={otp} onChange={setOtp} error={Boolean(error)} disabled={isVerifying} />

        {error && (
          <div
            role="alert"
            className="animate-fade-in w-full rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-center text-xs text-danger"
          >
            {error}
          </div>
        )}
        {resendMessage && !error && (
          <div
            role="status"
            className="animate-fade-in w-full rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-center text-xs text-success"
          >
            {resendMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={otp.length !== OTP_LENGTH || isVerifying}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isVerifying && <Loader2 className="h-4 w-4 animate-spin" />}
          {isVerifying ? 'Verifying…' : 'Verify OTP'}
        </button>

        <p className="text-xs text-muted">
          {cooldown > 0 ? (
            `Resend code in ${cooldown}s`
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={isResending}
              className="font-medium text-accent transition hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResending ? 'Sending…' : 'Resend OTP'}
            </button>
          )}
        </p>
      </form>
    </Card>
  );
}
