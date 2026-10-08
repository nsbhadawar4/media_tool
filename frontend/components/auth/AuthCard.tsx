import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { Card } from '@/components/ui/Card';
import { cn } from '@/utils/cn';

/**
 * The card every sign-in, sign-up and recovery screen sits in: brand mark, an optional step
 * indicator, the heading, then the screen's own content. One component so the screens can't
 * drift apart in spacing or hierarchy.
 */
export function AuthCard({
  title,
  subtitle,
  step,
  width = 'sm',
  footer,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** For multi-step flows: shown above the heading. */
  step?: { current: number; total: number; label: string };
  width?: 'sm' | 'md';
  /** The muted line under the card's content, e.g. "Already have an account? Sign in". */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card
      className={cn(
        'gradient-border surface-glass anim-rise-scale w-full !bg-surface-elevated/70 p-5 shadow-pop sm:p-8',
        width === 'md' ? 'max-w-md' : 'max-w-sm',
      )}
    >
      <header className="flex flex-col items-center text-center">
        <Logo className="anim-logo logo-glow h-12 w-12 sm:h-14 sm:w-14" />
        {step && <StepIndicator {...step} />}
        <h1 className={cn('text-balance text-xl font-semibold tracking-tight text-foreground sm:text-[22px]', step ? 'mt-3' : 'mt-4')}>
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted">{subtitle}</p>}
      </header>

      {children}

      {footer && <div className="mt-6 text-center text-xs text-muted">{footer}</div>}
    </Card>
  );
}

/** "Step 2 of 3 · Verify code" with a bar per step; the text is what screen readers get. */
export function StepIndicator({ current, total, label }: { current: number; total: number; label: string }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1 rounded-full transition-all duration-300 ease-[var(--ease-out)]',
              i + 1 === current ? 'w-6 bg-accent' : i + 1 < current ? 'w-3 bg-accent/60' : 'w-3 bg-border-strong',
            )}
          />
        ))}
      </div>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
        Step {current} of {total} <span aria-hidden>·</span> <span className="text-accent-2">{label}</span>
      </p>
    </div>
  );
}

/** Text link in the accent colour, with a visible keyboard focus ring. */
export const authLinkClass =
  'rounded font-medium text-accent transition hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40';
