import type { HTMLAttributes, ReactNode } from 'react';
import { AlertCircle, Check, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

const TONE = {
  error: { icon: AlertCircle, className: 'border-danger/30 bg-danger/10 text-danger', role: 'alert' },
  success: { icon: CheckCircle2, className: 'border-success/30 bg-success/10 text-success', role: 'status' },
  info: { icon: Info, className: 'border-accent/25 bg-accent/10 text-foreground-soft', role: 'status' },
} as const;

/**
 * A message under a form: errors are announced at once (role=alert), success and info politely.
 * Renders nothing without a message, so callers can pass state straight through.
 */
export function FormAlert({
  tone = 'error',
  children,
  className,
  ...rest
}: {
  tone?: keyof typeof TONE;
  children?: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'className' | 'children'>) {
  if (!children) return null;
  const { icon: Icon, className: toneClass, role } = TONE[tone];
  return (
    <div role={role} className={cn('animate-fade-in flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed', toneClass, className)} {...rest}>
      <Icon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * The primary button of an auth form. `busy` shows a spinner and the busy label; `done` shows a
 * tick while the page moves on, so a successful submit never flashes back to its idle label.
 */
export function SubmitButton({
  busy = false,
  done = false,
  disabled = false,
  idle,
  busyLabel,
  doneLabel,
  className,
}: {
  busy?: boolean;
  done?: boolean;
  disabled?: boolean;
  idle: ReactNode;
  busyLabel: ReactNode;
  doneLabel?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy || done || disabled}
      aria-busy={busy || undefined}
      className={cn(
        'btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-accent-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:cursor-not-allowed',
        // A finished button stays fully opaque; only a waiting/unusable one is dimmed.
        done ? 'disabled:opacity-100' : 'disabled:opacity-55',
        className,
      )}
    >
      {done ? (
        <span className="anim-pop inline-flex items-center gap-2">
          <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
          {doneLabel}
        </span>
      ) : (
        <>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {busy ? busyLabel : idle}
        </>
      )}
    </button>
  );
}
