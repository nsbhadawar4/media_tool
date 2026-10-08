'use client';

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/utils/cn';

interface OtpInputProps {
  length?: number;
  /** The digits entered so far, e.g. "12" while the user is still typing. Never has gaps. */
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  /** Bump after each failed attempt: the boxes shake once and focus returns to the first. */
  errorKey?: number;
  success?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Id of the message that explains an error, for screen readers. */
  describedBy?: string;
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * `length` separate boxes that behave like one field:
 *  - typing a digit advances; the code always fills left to right, so it never has gaps
 *  - Backspace clears the current box, or steps back and clears the previous one
 *  - ← / → / Home / End move between boxes; focusing a box selects its digit to overtype
 *  - pasting (or an SMS autofill dropping the whole code into one box) fills every box
 * Each box is `type="text"` with `inputMode="numeric"` rather than `type="number"`, which would
 * strip leading zeros ("0042" must stay four characters).
 */
export function OtpInput({ length = 4, value, onChange, error, errorKey = 0, success, disabled, autoFocus, describedBy }: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const groupRef = useRef<HTMLDivElement>(null);
  // The latest value, updated the moment we emit one. Moving focus fires the next box's onFocus
  // before React re-renders, and that handler must see the new value, not this render's.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const emit = (next: string) => {
    latest.current = next;
    onChange(next);
  };

  const focusBox = (index: number) => {
    const box = refs.current[Math.max(0, Math.min(length - 1, index))];
    box?.focus();
    box?.select();
  };

  useEffect(() => {
    if (autoFocus && !disabled) focusBox(Math.min(value.length, length - 1));
    // Only on mount: later focus moves are driven by typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A failed attempt: one shake, then back to the first box for the next try.
  useEffect(() => {
    if (errorKey === 0) return;
    if (!prefersReducedMotion()) {
      groupRef.current?.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-6px)' },
          { transform: 'translateX(5px)' },
          { transform: 'translateX(-3px)' },
          { transform: 'translateX(0)' },
        ],
        { duration: 380, easing: 'ease-in-out' },
      );
    }
    if (!disabled) focusBox(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorKey]);

  const fillFrom = (index: number, typed: string) => {
    const next = (latest.current.slice(0, index) + typed).slice(0, length);
    emit(next);
    focusBox(next.length >= length ? length - 1 : next.length);
  };

  const handleChange = (index: number, raw: string) => {
    let typed = raw.replace(/\D/g, '');
    if (!typed) return;
    const value = latest.current;
    // Typing over an unselected digit gives both characters; keep the new one.
    const current = value[index];
    if (current && typed.length === 2) typed = typed[0] === current ? typed[1]! : typed[0]!;
    if (current && typed.length === 1) {
      // Correcting one digit of the code keeps the ones after it.
      emit(value.slice(0, index) + typed + value.slice(index + 1));
      focusBox(index + 1);
      return;
    }
    fillFrom(Math.min(index, value.length), typed);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    const value = latest.current;
    switch (event.key) {
      case 'Backspace':
        event.preventDefault();
        if (value[index]) {
          emit(value.slice(0, index));
          focusBox(index);
        } else if (index > 0) {
          emit(value.slice(0, index - 1));
          focusBox(index - 1);
        }
        break;
      case 'Delete':
        event.preventDefault();
        emit(value.slice(0, index));
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusBox(index - 1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        focusBox(Math.min(index + 1, value.length));
        break;
      case 'Home':
        event.preventDefault();
        focusBox(0);
        break;
      case 'End':
        event.preventDefault();
        focusBox(value.length);
        break;
    }
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    event.preventDefault();
    if (!pasted) return;
    // A whole code replaces everything; a fragment continues from where the user is.
    fillFrom(pasted.length >= length ? 0 : Math.min(index, latest.current.length), pasted);
  };

  return (
    <div ref={groupRef} className="flex justify-center gap-2.5 sm:gap-3" role="group" aria-label={`${length}-digit verification code`}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          value={digit}
          disabled={disabled}
          // Boxes fill in order: clicking ahead lands on the next empty one.
          onFocus={(e) => (index > latest.current.length ? focusBox(latest.current.length) : e.currentTarget.select())}
          onClick={(e) => e.currentTarget.select()}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={(e) => handlePaste(index, e)}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={error || undefined}
          aria-describedby={describedBy}
          data-filled={digit ? 'true' : 'false'}
          className={cn(
            'otp-box focus-glow h-14 w-12 rounded-xl border bg-surface-elevated text-center text-2xl font-semibold tabular-nums text-foreground caret-accent outline-none sm:h-16 sm:w-14',
            success
              ? 'border-success/70 bg-success/10 text-success'
              : error
                ? 'border-danger/70 bg-danger/5'
                : digit
                  ? 'border-accent/60 bg-accent/5'
                  : 'border-border hover:border-border-strong',
            disabled && !success && 'cursor-not-allowed opacity-55',
          )}
        />
      ))}
    </div>
  );
}
