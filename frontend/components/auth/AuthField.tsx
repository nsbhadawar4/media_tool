'use client';

import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> {
  id: string;
  label: string;
  icon: ReactNode;
  /** Field-level validation message, shown under the input and wired up for screen readers. */
  error?: string;
}

/**
 * The single input style shared by the login and signup forms, so the two pages cannot
 * drift apart. A password field gets a show/hide toggle automatically.
 */
export function AuthField({ id, label, icon, error, type = 'text', ...rest }: AuthFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && revealed ? 'text' : type;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{icon}</span>
        <input
          id={id}
          type={inputType}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`w-full rounded-xl border bg-surface py-2.5 pl-9 text-sm text-foreground outline-none transition focus:ring-2 ${
            isPassword ? 'pr-9' : 'pr-3'
          } ${
            error
              ? 'border-danger/60 focus:border-danger focus:ring-danger/20'
              : 'border-border focus:border-accent focus:ring-accent/20'
          }`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-foreground"
            aria-label={revealed ? 'Hide password' : 'Show password'}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
