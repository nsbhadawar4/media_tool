'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { ApiError } from '@/lib/api/client';
import { AuthField } from './AuthField';

interface LoginFormProps {
  /**
   * 'admin' only changes the wording and where a successful sign-in lands. It grants
   * nothing: an account without the admin role is bounced by the admin layout, and the
   * backend refuses its requests regardless of which form was used.
   */
  variant?: 'user' | 'admin';
}

export function LoginForm({ variant = 'user' }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdminVariant = variant === 'admin';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = await login(email, password, rememberMe);

      if (isAdminVariant && user.role !== 'admin') {
        setError('This account does not have administrator access.');
        return;
      }

      const fallback = isAdminVariant ? '/admin' : '/dashboard';
      router.replace(searchParams.get('from') ?? fallback);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">
          {isAdminVariant ? 'Admin sign in' : 'Welcome back to login'}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {isAdminVariant ? 'Private area. Authorized access only.' : 'Sign in to your media library.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
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

        <label className="flex select-none items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border accent-accent"
          />
          Remember me on this device
        </label>

        {error && (
          <div
            role="alert"
            className="animate-fade-in rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {!isAdminVariant && (
        <p className="mt-6 text-center text-xs text-muted">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-medium text-accent transition hover:text-accent-hover">
            Create one
          </Link>
        </p>
      )}
    </div>
  );
}
