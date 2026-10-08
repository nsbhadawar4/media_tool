'use client';

import { ChevronDown, Smartphone } from 'lucide-react';
import { COUNTRIES } from '@/lib/phone/countries';
import { cn } from '@/utils/cn';

/**
 * Country code + mobile number, styled to match AuthField. The country is a native <select>
 * (keyboard, screen-reader and mobile-picker support for free); the number is digits only.
 */
export function PhoneField({
  id,
  label = 'Mobile number',
  country,
  onCountryChange,
  number,
  onNumberChange,
  error,
  autoComplete = 'tel-national',
}: {
  id: string;
  label?: string;
  country: string;
  onCountryChange: (iso: string) => void;
  number: string;
  onNumberChange: (value: string) => void;
  error?: string;
  autoComplete?: string;
}) {
  const selected = COUNTRIES.find((c) => c.iso === country) ?? COUNTRIES[0]!;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-foreground-soft">
        {label}
      </label>
      <div
        className={cn(
          'focus-glow flex min-h-11 rounded-xl border bg-surface-elevated hover:border-border-strong',
          error ? 'anim-shake border-danger/70' : 'border-border',
        )}
      >
        <div className="relative shrink-0 border-r border-border">
          <span aria-hidden className="pointer-events-none flex h-full items-center gap-1.5 pl-3 pr-7 text-sm text-foreground">
            <span className="text-base leading-none">{selected.flag}</span>
            <span className="tabular-nums">{selected.dial}</span>
          </span>
          <select
            aria-label="Country code"
            value={selected.iso}
            onChange={(e) => onCountryChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {COUNTRIES.map((c) => (
              <option key={c.iso} value={c.iso}>
                {c.flag} {c.name} ({c.dial})
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        </div>
        <div className="relative min-w-0 flex-1">
          <Smartphone aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            id={id}
            type="tel"
            inputMode="numeric"
            autoComplete={autoComplete}
            value={number}
            // Digits plus the separators people type out of habit; the backend normalises.
            onChange={(e) => onNumberChange(e.target.value.replace(/[^\d\s()-]/g, ''))}
            placeholder="98765 43210"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="w-full rounded-r-xl bg-transparent py-2.5 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted/60"
          />
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} className="anim-rise mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
