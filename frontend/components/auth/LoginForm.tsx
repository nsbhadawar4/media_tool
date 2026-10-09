'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useNavigationRouter } from '@/lib/navigation/progress';
import { Lock, Mail, Smartphone } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { ApiError } from '@/lib/api/client';
import { postLoginPath } from '@/lib/auth/routes';
import { DEFAULT_COUNTRY } from '@/lib/phone/countries';
import { AuthField } from './AuthField';
import { AuthTabs } from './AuthTabs';
import { PhoneField } from './PhoneField';
import { AuthDivider, GoogleSignInButton } from './GoogleSignInButton';
import { AuthCard, authLinkClass } from './AuthCard';
import { FormAlert, SubmitButton } from './FormFeedback';

const TABS = [
  { value: 'email' as const, label: 'Email', icon: <Mail className="h-4 w-4" /> },
  { value: 'mobile' as const, label: 'Mobile', icon: <Smartphone className="h-4 w-4" /> },
];

/**
 * The single sign-in form. Where a successful sign-in lands is decided by the account's role
 * (admin → /admin/dashboard, user → /dashboard) — that choice grants nothing on its own: the
 * admin layout re-checks the role, and the backend's requireAdmin refuses non-admins anyway.
 *
 * Two ways to identify the account: email (unchanged), or the verified mobile number of an
 * account created by mobile signup. Either way it is the same password check and session.
 */
export function LoginForm() {
  const router = useNavigationRouter();
  const searchParams = useSearchParams();
  const { login, loginWithMobile } = useAuth();

  const [method, setMethod] = useState<'email' | 'mobile'>('email');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user =
        method === 'email'
          ? await login(email, password, rememberMe)
          : await loginWithMobile({ country, mobile: mobile.trim(), password, rememberMe });
      // Stays in its "signed in" state while the next page loads, rather than flashing back.
      setSignedIn(true);
      router.replace(postLoginPath(user.role, searchParams.get('from'), user.onboardingRequired));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your media library."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/signup" className={authLinkClass}>
            Create one
          </Link>
        </>
      }
    >
      <div className="mt-6 flex flex-col gap-4">
        <GoogleSignInButton from={searchParams.get('from')} />
        <AuthDivider label="or sign in with" />
      </div>

      <div className="mt-4">
        <AuthTabs
          tabs={TABS}
          value={method}
          onChange={(m) => {
            setMethod(m);
            setError(null);
          }}
          idPrefix="login"
          label="Sign in with"
        />
      </div>

      <form
        onSubmit={handleSubmit}
        role="tabpanel"
        id={`login-panel-${method}`}
        aria-labelledby={`login-tab-${method}`}
        className="mt-6 flex flex-col gap-4"
      >
        {/* Keyed by method, so the identifier field fades in when the tab changes. */}
        <div key={method} className="animate-fade-in">
          {method === 'mobile' ? (
            <PhoneField id="login-mobile" country={country} onCountryChange={setCountry} number={mobile} onNumberChange={setMobile} />
          ) : (
            <AuthField
              id="email"
              label="Email"
              icon={<Mail className="h-4 w-4" />}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          )}
        </div>

        <AuthField
          id="password"
          label="Password"
          icon={<Lock className="h-4 w-4" />}
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-muted">
          <label className="flex cursor-pointer select-none items-center gap-2 transition hover:text-foreground-soft">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-border accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
            Remember me
          </label>
          {/* Password reset works by email; mobile-only accounts can't use it yet. */}
          {method === 'email' && (
            <Link href="/forgot-password" className={authLinkClass}>
              Forgot password?
            </Link>
          )}
        </div>

        <FormAlert>{error}</FormAlert>

        <SubmitButton busy={isSubmitting} done={signedIn} idle="Sign in" busyLabel="Signing in…" doneLabel="Signed in" className="mt-1" />
      </form>
    </AuthCard>
  );
}
