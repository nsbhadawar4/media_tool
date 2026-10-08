'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Info, Lock, Mail, Smartphone, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { ApiError } from '@/lib/api/client';
import { authApi } from '@/lib/api/auth';
import { postLoginPath } from '@/lib/auth/routes';
import { passwordProblem } from '@/lib/auth/passwordRules';
import { DEFAULT_COUNTRY, looksLikeNationalNumber } from '@/lib/phone/countries';
import type { MobileSignupStarted, UserProfile } from '@/types/api';
import { AuthField } from './AuthField';
import { AuthTabs } from './AuthTabs';
import { PhoneField } from './PhoneField';
import { PasswordChecklist } from './PasswordChecklist';
import { MobileOtpStep } from './MobileOtpStep';
import { AuthDivider, GoogleSignInButton } from './GoogleSignInButton';
import { AuthCard, authLinkClass } from './AuthCard';
import { FormAlert, SubmitButton } from './FormFeedback';

type Method = 'email' | 'mobile';
type Errors = Partial<Record<string, string>>;

const TABS = [
  { value: 'email' as const, label: 'Email', icon: <Mail className="h-4 w-4" /> },
  { value: 'mobile' as const, label: 'Mobile', icon: <Smartphone className="h-4 w-4" /> },
];

/** Field errors from the backend's validation response, keyed by field name. */
function serverFieldErrors(err: unknown): Errors {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return {};
  const out: Errors = {};
  for (const d of err.details as Array<{ path?: string; message?: string }>) {
    if (d?.path && d.message && !out[d.path]) out[d.path] = d.message;
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ */
/* Email                                                                                       */
/* ------------------------------------------------------------------------------------------ */

function EmailSignupPanel({ onSignedUp }: { onSignedUp: (user: UserProfile) => void }) {
  const { signup } = useAuth();
  const [v, setV] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (key: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setV((prev) => ({ ...prev, [key]: e.target.value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  // Browser-side checks are only for a quicker answer; the backend applies the same rules.
  const validate = (): Errors => {
    const e: Errors = {};
    if (!v.name.trim()) e.name = 'Please enter your name';
    if (!v.email.trim()) e.email = 'Please enter your email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Enter a valid email address';
    const pw = passwordProblem(v.password);
    if (pw) e.password = pw;
    if (!v.confirmPassword) e.confirmPassword = 'Please confirm your password';
    else if (v.confirmPassword !== v.password) e.confirmPassword = 'Passwords do not match';
    return e;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const found = validate();
    if (Object.keys(found).length) return setErrors(found);

    setBusy(true);
    try {
      const user = await signup({ name: v.name.trim(), email: v.email.trim(), password: v.password, confirmPassword: v.confirmPassword });
      setDone(true);
      onSignedUp(user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrors({ email: 'An account with this email already exists' });
      else {
        const fields = serverFieldErrors(err);
        if (Object.keys(fields).length) setErrors(fields);
        else setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <AuthField id="email-name" label="Full name" icon={<UserRound className="h-4 w-4" />} autoComplete="name" value={v.name} onChange={set('name')} error={errors.name} placeholder="Your name" />
      <AuthField id="email-email" label="Email" icon={<Mail className="h-4 w-4" />} type="email" autoComplete="email" value={v.email} onChange={set('email')} error={errors.email} placeholder="you@example.com" />
      <div className="flex flex-col gap-2">
        <AuthField id="email-password" label="Password" icon={<Lock className="h-4 w-4" />} type="password" autoComplete="new-password" value={v.password} onChange={set('password')} error={errors.password} placeholder="Create a strong password" />
        <PasswordChecklist password={v.password} />
      </div>
      <AuthField id="email-confirm" label="Confirm password" icon={<Lock className="h-4 w-4" />} type="password" autoComplete="new-password" value={v.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword} placeholder="Repeat your password" />
      <FormAlert>{formError}</FormAlert>
      <SubmitButton busy={busy} done={done} idle="Create account" busyLabel="Creating account…" doneLabel="Account created" className="mt-1" />
    </form>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Mobile                                                                                      */
/* ------------------------------------------------------------------------------------------ */

function MobileSignupPanel({
  started,
  onStarted,
  onSignedUp,
}: {
  started: MobileSignupStarted | null;
  onStarted: (state: MobileSignupStarted | null) => void;
  onSignedUp: (user: UserProfile) => void;
}) {
  const { verifyMobileSignup } = useAuth();
  const [v, setV] = useState({ name: '', country: DEFAULT_COUNTRY, mobile: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Whether codes can be texted at all (false in production without a real SMS provider).
  // Unknown until the server answers; the server refuses to start a signup either way.
  const [smsAvailable, setSmsAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    authApi
      .mobileSignupConfig()
      .then(({ data }) => {
        if (!cancelled) setSmsAvailable(data.enabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (key: keyof typeof v, value: string) => {
    setV((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!v.name.trim()) e.name = 'Please enter your name';
    if (!v.mobile.trim()) e.mobile = 'Please enter your mobile number';
    else if (!looksLikeNationalNumber(v.mobile)) e.mobile = 'Enter a valid mobile number';
    const pw = passwordProblem(v.password);
    if (pw) e.password = pw;
    if (!v.confirmPassword) e.confirmPassword = 'Please confirm your password';
    else if (v.confirmPassword !== v.password) e.confirmPassword = 'Passwords do not match';
    return e;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const found = validate();
    if (Object.keys(found).length) return setErrors(found);

    setBusy(true);
    try {
      const { data } = await authApi.startMobileSignup({
        name: v.name.trim(),
        country: v.country,
        mobile: v.mobile.trim(),
        password: v.password,
        confirmPassword: v.confirmPassword,
      });
      onStarted(data);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SMS_UNAVAILABLE') return setSmsAvailable(false);
      const fields = serverFieldErrors(err);
      if (Object.keys(fields).length) setErrors(fields);
      else setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (started) {
    return (
      <MobileOtpStep
        started={started}
        verify={(otp) => verifyMobileSignup({ phone: started.phone, signupToken: started.signupToken, otp })}
        onVerified={onSignedUp}
        // Back to the form with everything still filled in.
        onChangeNumber={() => onStarted(null)}
      />
    );
  }

  if (smsAvailable === false) {
    return (
      <div
        role="status"
        data-mobile-signup="unavailable"
        className="animate-fade-in flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-strong bg-surface/40 px-5 py-7 text-center"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Info className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-foreground">Mobile sign-up isn’t available right now</p>
        <p className="text-xs text-muted">We can’t send verification texts at the moment. Please sign up with your email address instead.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <AuthField id="mobile-name" label="Full name" icon={<UserRound className="h-4 w-4" />} autoComplete="name" value={v.name} onChange={(e) => update('name', e.target.value)} error={errors.name} placeholder="Your name" />
      <PhoneField id="mobile-number" country={v.country} onCountryChange={(c) => update('country', c)} number={v.mobile} onNumberChange={(n) => update('mobile', n)} error={errors.mobile ?? errors.country} />
      <div className="flex flex-col gap-2">
        <AuthField id="mobile-password" label="Password" icon={<Lock className="h-4 w-4" />} type="password" autoComplete="new-password" value={v.password} onChange={(e) => update('password', e.target.value)} error={errors.password} placeholder="Create a strong password" />
        <PasswordChecklist password={v.password} />
      </div>
      <AuthField id="mobile-confirm" label="Confirm password" icon={<Lock className="h-4 w-4" />} type="password" autoComplete="new-password" value={v.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} error={errors.confirmPassword} placeholder="Repeat your password" />
      <FormAlert>{formError}</FormAlert>
      <SubmitButton busy={busy} idle="Send verification code" busyLabel="Sending code…" className="mt-1" />
      <p className="text-center text-[11px] text-muted">We’ll text a 4-digit code to confirm the number is yours.</p>
    </form>
  );
}

/* ------------------------------------------------------------------------------------------ */

/**
 * Sign-up with two methods. Email creates the account straight away; mobile creates it only
 * after the number is verified with a texted code. Both panels stay mounted while switching,
 * so nothing typed is lost; the backend applies every rule shown here.
 */
export function SignupForm() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>('email');
  const [mobileStarted, setMobileStarted] = useState<MobileSignupStarted | null>(null);

  // Signup sets the session cookie, so there is nothing left to sign in to.
  const onSignedUp = (user: UserProfile) => router.replace(postLoginPath(user.role, null, user.onboardingRequired));
  const verifying = method === 'mobile' && mobileStarted !== null;

  return (
    <AuthCard
      width="md"
      title={verifying ? 'Verify your number' : 'Create your account'}
      subtitle={verifying ? 'Enter the 4-digit code we just texted you.' : 'Your own private space for photos, videos and documents.'}
      footer={
        verifying ? undefined : (
          <>
            Already have an account?{' '}
            <Link href="/login" className={authLinkClass}>
              Sign in
            </Link>
          </>
        )
      }
    >
      {!verifying && (
        <>
          <div className="mt-6 flex flex-col gap-4">
            <GoogleSignInButton mode="signup" />
            <AuthDivider label="or sign up with" />
          </div>
          <div className="mt-4">
            <AuthTabs tabs={TABS} value={method} onChange={setMethod} idPrefix="signup" label="Sign up with" />
          </div>
        </>
      )}

      {/* Both panels stay mounted (nothing typed is lost); the shown one fades in. */}
      <div className="mt-6">
        <div role="tabpanel" id="signup-panel-email" aria-labelledby="signup-tab-email" hidden={method !== 'email'} className="animate-fade-in">
          <EmailSignupPanel onSignedUp={onSignedUp} />
        </div>
        <div role="tabpanel" id="signup-panel-mobile" aria-labelledby="signup-tab-mobile" hidden={method !== 'mobile'} className="animate-fade-in">
          <MobileSignupPanel started={mobileStarted} onStarted={setMobileStarted} onSignedUp={onSignedUp} />
        </div>
      </div>
    </AuthCard>
  );
}
