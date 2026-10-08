'use client';

import { useEffect, useState } from 'react';
import { Clock, RotateCw } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Seconds left until `deadline` (ms), re-rendered once a second while a countdown runs. Capped at
 * `max` (the server's figure): the ticking clock can be up to a second behind a fresh deadline.
 */
export function useSecondsUntil(deadline: number, max: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return Math.min(max, Math.max(0, Math.ceil((deadline - now) / 1000)));
}

export function mmss(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * "Code expires in 9:41". Turns amber in the last minute. Deliberately not a live region — a
 * screen reader announcing every second would drown everything else out; expiry itself is
 * announced by the alert the parent shows.
 */
export function ExpiryCountdown({ seconds }: { seconds: number }) {
  const soon = seconds <= 60;
  return (
    <p className={cn('flex items-center justify-center gap-1.5 text-xs transition-colors', soon ? 'text-warning' : 'text-muted')}>
      <Clock className="h-3.5 w-3.5" aria-hidden />
      Code expires in
      <span className={cn('tabular-nums font-medium', soon ? 'text-warning' : 'text-foreground-soft')}>{mmss(seconds)}</span>
    </p>
  );
}

const RING = 2 * Math.PI * 7;

/**
 * Resend control. While the cooldown runs, a small ring empties alongside the seconds; once it
 * is over the button becomes active; while a new code is being requested its icon turns.
 */
export function ResendButton({
  secondsLeft,
  total,
  busy,
  onResend,
  disabled = false,
}: {
  secondsLeft: number;
  total: number;
  busy: boolean;
  onResend: () => void;
  disabled?: boolean;
}) {
  const coolingDown = secondsLeft > 0;
  return (
    <button
      type="button"
      onClick={onResend}
      disabled={coolingDown || busy || disabled}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        coolingDown ? 'cursor-not-allowed text-muted' : 'text-accent hover:bg-accent/10 hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      {coolingDown ? (
        <>
          <svg viewBox="0 0 18 18" className="h-4 w-4 -rotate-90" aria-hidden>
            <circle cx="9" cy="9" r="7" fill="none" strokeWidth="2" className="stroke-border-strong" />
            <circle
              cx="9"
              cy="9"
              r="7"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              className="stroke-accent transition-[stroke-dashoffset] duration-1000 ease-linear"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - secondsLeft / Math.max(1, total))}
            />
          </svg>
          Resend in <span className="tabular-nums">{secondsLeft}s</span>
        </>
      ) : (
        <span key="ready" className="animate-fade-in inline-flex items-center gap-1.5">
          <RotateCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} aria-hidden />
          {busy ? 'Sending…' : 'Resend code'}
        </span>
      )}
    </button>
  );
}
