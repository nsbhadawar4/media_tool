'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import type { MobileSignupStarted, UserProfile } from '@/types/api';
import { OtpInput } from './OtpInput';
import { ExpiryCountdown, ResendButton, useSecondsUntil } from './OtpTimers';
import { FormAlert, SubmitButton } from './FormFeedback';

/**
 * Why the last code was refused, from the server's error code. `incorrect` leaves the code usable
 * (with fewer tries); the others mean this code is finished and only a new one (or, for
 * `invalid`, starting again) can help.
 */
type Failure = 'incorrect' | 'expired' | 'locked' | 'invalid';
const FAILURE_BY_CODE: Record<string, Failure> = {
  OTP_INCORRECT: 'incorrect',
  OTP_EXPIRED: 'expired',
  OTP_LOCKED: 'locked',
  OTP_INVALID: 'invalid',
};

/**
 * Step 2 of mobile signup: the 4-digit code. Typing the fourth digit submits; the code's own
 * 10-minute expiry and the 60-second resend cooldown are shown as live countdowns taken from
 * the server's answer (the server enforces both regardless).
 */
export function MobileOtpStep({
  started,
  onVerified,
  verify,
  onChangeNumber,
}: {
  started: MobileSignupStarted;
  /** Called once the account exists and is signed in. */
  onVerified: (user: UserProfile) => void;
  verify: (otp: string) => Promise<UserProfile>;
  onChangeNumber: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [deadlines, setDeadlines] = useState(() => ({
    expiresAt: Date.now() + started.expiresInSeconds * 1000,
    resendAt: Date.now() + started.resendInSeconds * 1000,
    expiresInSeconds: started.expiresInSeconds,
    resendInSeconds: started.resendInSeconds,
  }));
  const submittedFor = useRef<string | null>(null);

  const expiresIn = useSecondsUntil(deadlines.expiresAt, deadlines.expiresInSeconds);
  const resendIn = useSecondsUntil(deadlines.resendAt, deadlines.resendInSeconds);
  const expired = expiresIn === 0 || failure === 'expired';
  // Nothing typed into this code can succeed any more.
  const finished = expired || failure === 'locked' || failure === 'invalid';

  const submit = async (otp: string) => {
    if (otp.length !== 4 || isVerifying || verified || finished) return;
    submittedFor.current = otp;
    setError(null);
    setFailure(null);
    setNotice(null);
    setIsVerifying(true);
    try {
      const user = await verify(otp);
      setVerified(true);
      // A beat to see the success state before leaving the page.
      window.setTimeout(() => onVerified(user), 900);
    } catch (err) {
      setFailure(err instanceof ApiError && err.code ? (FAILURE_BY_CODE[err.code] ?? null) : null);
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setErrorKey((k) => k + 1);
      setCode('');
    } finally {
      setIsVerifying(false);
    }
  };

  // The fourth digit submits — once per code, so a failed code isn't retried on its own.
  useEffect(() => {
    if (code.length === 4 && submittedFor.current !== code) void submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const resend = async () => {
    if (resendIn > 0 || isResending) return;
    setError(null);
    setNotice(null);
    setIsResending(true);
    try {
      const { data } = await authApi.resendMobileSignupCode({ phone: started.phone, signupToken: started.signupToken });
      setFailure(null);
      setDeadlines({
        expiresAt: Date.now() + data.expiresInSeconds * 1000,
        resendAt: Date.now() + data.resendInSeconds * 1000,
        expiresInSeconds: data.expiresInSeconds,
        resendInSeconds: data.resendInSeconds,
      });
      setCode('');
      submittedFor.current = null;
      setNotice(`A new code is on its way to ${started.maskedPhone}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send a new code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submittedFor.current = null;
    void submit(code);
  };

  if (verified) {
    return (
      <div className="flex flex-col items-center gap-5 py-2 text-center" role="status">
        <OtpInput value={code.padEnd(4, '•').slice(0, 4)} onChange={() => {}} success disabled />
        <span className="anim-pop flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success ring-8 ring-success/5">
          <Check className="h-7 w-7" strokeWidth={3} aria-hidden />
        </span>
        <div>
          <p className="text-base font-semibold text-foreground">Number verified</p>
          <p className="mt-1 text-sm text-muted">Setting up your account…</p>
        </div>
      </div>
    );
  }

  const errorId = 'mobile-otp-error';

  return (
    <form onSubmit={onSubmit} className="anim-rise flex flex-col gap-5" noValidate>
      <p className="text-center text-sm text-muted">
        Code sent to <span className="font-semibold text-foreground">{started.maskedPhone}</span>
      </p>

      <OtpInput
        value={code}
        onChange={setCode}
        error={Boolean(error)}
        errorKey={errorKey}
        disabled={isVerifying || finished}
        autoFocus
        describedBy={error || expired ? errorId : undefined}
      />

      {!finished && <ExpiryCountdown seconds={expiresIn} />}

      {(error || expired) && (
        <FormAlert id={errorId} data-otp-state={failure ?? (expired ? 'expired' : 'error')}>
          {error ?? 'This code has expired. Request a new one.'}
          {failure === 'invalid' && (
            <>
              {' '}
              Use <strong className="font-semibold">Change number</strong> to start again.
            </>
          )}
        </FormAlert>
      )}
      <FormAlert tone="success">{!error ? notice : null}</FormAlert>

      <SubmitButton busy={isVerifying} disabled={code.length !== 4 || finished} idle="Verify & create account" busyLabel="Verifying…" />

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onChangeNumber}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Change number
        </button>
        <ResendButton secondsLeft={resendIn} total={deadlines.resendInSeconds} busy={isResending} onResend={() => void resend()} />
      </div>
    </form>
  );
}
