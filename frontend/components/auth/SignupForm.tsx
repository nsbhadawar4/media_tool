'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, Mail, Phone, UserRound, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { ApiError } from '@/lib/api/client';
import { AuthField } from './AuthField';

type FieldErrors = Partial<Record<'name' | 'email' | 'password' | 'confirmPassword' | 'mobile', string>>;

const MIN_PASSWORD_LENGTH = 8;

/**
 * Validates in the browser purely so people get an answer without a round trip. The
 * backend runs the same rules (validators/authValidators.ts) and is the one that decides —
 * anything checked only here would be trivially bypassed.
 */
function validate(values: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  mobile: string;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.name.trim()) errors.name = 'Please enter your name';

  if (!values.email.trim()) errors.email = 'Please enter your email';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'Enter a valid email address';

  if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  if (!values.confirmPassword) errors.confirmPassword = 'Please confirm your password';
  else if (values.confirmPassword !== values.password) errors.confirmPassword = 'Passwords do not match';

  if (values.mobile.trim() && !/^[+]?[\d\s()-]{7,20}$/.test(values.mobile.trim())) {
    errors.mobile = 'Enter a valid mobile number';
  }

  return errors;
}

export function SignupForm() {
  const router = useRouter();
  const { signup } = useAuth();

  const [values, setValues] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    mobile: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    // Clear this field's error as soon as it is edited, rather than making people
    // resubmit to find out whether they fixed it.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const found = validate(values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    setIsSubmitting(true);
    try {
      await signup({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        confirmPassword: values.confirmPassword,
        mobile: values.mobile.trim() || undefined,
      });
      // The account exists but has no session; the login page says so and takes it from there.
      router.replace('/login?registered=1');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ email: 'An account with this email already exists' });
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <UserPlus className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">Create your account</h1>
        <p className="mt-1.5 text-sm text-muted">Your own private space for photos, videos and documents.</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-4">
        <AuthField
          id="name"
          label="Full name"
          icon={<UserRound className="h-4 w-4" />}
          autoComplete="name"
          value={values.name}
          onChange={set('name')}
          error={errors.name}
          placeholder="Your name"
        />

        <AuthField
          id="email"
          label="Email"
          icon={<Mail className="h-4 w-4" />}
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={set('email')}
          error={errors.email}
          placeholder="you@example.com"
        />

        <AuthField
          id="mobile"
          label="Mobile number (optional)"
          icon={<Phone className="h-4 w-4" />}
          type="tel"
          autoComplete="tel"
          value={values.mobile}
          onChange={set('mobile')}
          error={errors.mobile}
          placeholder="+91 98765 43210"
        />

        <AuthField
          id="password"
          label="Password"
          icon={<Lock className="h-4 w-4" />}
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={set('password')}
          error={errors.password}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        />

        <AuthField
          id="confirmPassword"
          label="Confirm password"
          icon={<Lock className="h-4 w-4" />}
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={set('confirmPassword')}
          error={errors.confirmPassword}
          placeholder="Repeat your password"
        />

        {formError && (
          <div
            role="alert"
            className="animate-fade-in rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent transition hover:text-accent-hover">
          Sign in
        </Link>
      </p>
    </div>
  );
}
