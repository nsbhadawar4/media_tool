'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/utils/cn';

interface OtpInputProps {
  length?: number;
  /** The digits entered so far, e.g. "12" while the user is still typing. */
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
}

/**
 * `length` separate boxes that behave like one field: typing a digit advances focus,
 * backspace on an empty box retreats to the previous one, and pasting a full code fills
 * every box at once. Each box is `type="text"` with `inputMode="numeric"` rather than
 * `type="number"` — a number input strips leading zeros, which a 4-digit code depends on
 * ("0042" must stay four characters).
 */
export function OtpInput({ length = 4, value, onChange, error, disabled }: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const setDigit = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join(''));
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    setDigit(index, digit);
    if (digit && index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div className="flex justify-center gap-3" role="group" aria-label={`${length}-digit verification code`}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          aria-label={`Digit ${index + 1} of ${length}`}
          className={cn(
            'h-14 w-12 rounded-xl border bg-surface text-center text-xl font-semibold text-foreground outline-none transition focus:ring-2 sm:w-14',
            error
              ? 'border-danger/60 focus:border-danger focus:ring-danger/20'
              : 'border-border focus:border-accent focus:ring-accent/20',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        />
      ))}
    </div>
  );
}
