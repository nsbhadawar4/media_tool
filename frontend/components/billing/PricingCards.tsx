'use client';

import { useRef, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Check, Crown, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { PLANS, type PlanId, type PlanInfo } from '@/lib/billing/plans';
import { cn } from '@/utils/cn';

const PLAN_ICON: Record<PlanId, LucideIcon> = { free: Sparkles, pro: Zap, premium: Crown };

/**
 * The three plan cards. Two uses:
 *  - `select`: onboarding — the cards are a radio group (click, or arrow keys); the chosen card
 *    is clearly marked and the page confirms the choice with its own button.
 *  - `marketing`: the public site — each card links to sign-up.
 */
export function PricingCards({
  mode,
  selected = null,
  onSelect,
  disabled = false,
}: {
  mode: 'select' | 'marketing';
  selected?: PlanId | null;
  onSelect?: (plan: PlanId) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  const selectable = mode === 'select';
  // Roving focus: the selected card (or the first) is the one Tab lands on.
  const focusIndex = Math.max(0, PLANS.findIndex((p) => p.id === selected));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (disabled) return;
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (delta) {
      event.preventDefault();
      const next = (index + delta + PLANS.length) % PLANS.length;
      onSelect?.(PLANS[next]!.id);
      refs.current[next]?.focus();
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      onSelect?.(PLANS[index]!.id);
    }
  };

  return (
    <div
      className="grid gap-5 md:grid-cols-3 md:items-stretch"
      role={selectable ? 'radiogroup' : undefined}
      aria-label={selectable ? 'Choose a plan' : 'Plans'}
      aria-disabled={selectable && disabled ? true : undefined}
    >
      {PLANS.map((plan, index) => {
        const isSelected = selectable && selected === plan.id;
        // Marketing view: the recommended plan is the featured one. Selection view: only the choice.
        const featured = selectable ? isSelected : Boolean(plan.recommended);

        return (
          <div
            key={plan.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role={selectable ? 'radio' : undefined}
            aria-checked={selectable ? isSelected : undefined}
            aria-labelledby={`plan-${plan.id}-name`}
            aria-describedby={`plan-${plan.id}-price`}
            tabIndex={selectable ? (index === focusIndex ? 0 : -1) : undefined}
            onClick={selectable && !disabled ? () => onSelect?.(plan.id) : undefined}
            onKeyDown={selectable ? (e) => onKeyDown(e, index) : undefined}
            data-selected={isSelected || undefined}
            className={cn(
              'plan-card group relative flex flex-col rounded-3xl border p-6 sm:p-7',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background',
              selectable && !disabled && 'cursor-pointer',
              selectable && disabled && 'cursor-not-allowed',
              featured ? 'plan-card-featured border-accent' : 'border-border bg-surface hover:border-border-strong',
            )}
          >
            {plan.recommended && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-linear-to-r from-accent to-accent-2 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-accent-foreground shadow-card">
                Most popular
              </span>
            )}
            {selectable && <SelectionMark selected={isSelected} />}

            <PlanHeader plan={plan} featured={featured} />

            <ul className="mt-6 flex-1 space-y-3 border-t border-border/70 pt-6">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground-soft">
                  <span className={cn('mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full', featured ? 'bg-accent text-accent-foreground' : 'bg-accent/15 text-accent')}>
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            {plan.price > 0 && (
              <p className="mt-6 rounded-xl border border-warning/20 bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-warning">
                Payments coming soon — reserve now, pay when it launches.
              </p>
            )}

            {mode === 'marketing' && (
              <Link
                href="/signup"
                className={cn(
                  'mt-6 inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                  plan.recommended ? 'btn-primary text-accent-foreground' : 'border border-border bg-surface-elevated text-foreground hover:border-border-strong hover:bg-surface-hover',
                )}
              >
                {plan.price > 0 ? `Get ${plan.name}` : 'Start free'}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlanHeader({ plan, featured }: { plan: PlanInfo; featured: boolean }) {
  const Icon = PLAN_ICON[plan.id];
  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-2xl transition-colors duration-300',
            featured ? 'bg-linear-to-br from-accent-2 to-accent text-accent-foreground shadow-[0_8px_24px_-8px_var(--accent)]' : 'bg-accent/12 text-accent',
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h3 id={`plan-${plan.id}-name`} className="text-lg font-semibold tracking-tight text-foreground">
            {plan.name}
          </h3>
          <p className="text-xs text-muted">{plan.tagline}</p>
        </div>
      </div>

      <p id={`plan-${plan.id}-price`} className="mt-6 flex items-end gap-1.5">
        <span className="flex items-start text-foreground">
          <span className="mt-1.5 text-xl font-semibold text-foreground-soft">₹</span>
          <span className="text-5xl font-semibold tracking-tight tabular-nums">{plan.price}</span>
        </span>
        <span className="mb-1.5 text-sm text-muted">{plan.price > 0 ? '/ month' : 'forever'}</span>
      </p>
      <p className="mt-1.5 text-xs text-subtle">{plan.billing}</p>
    </div>
  );
}

/** The radio mark in the corner: an empty ring, or a filled tick with "Selected". */
function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <span className="absolute right-5 top-5 flex items-center gap-2" aria-hidden>
      {selected && <span className="animate-fade-in text-[11px] font-semibold uppercase tracking-wider text-accent">Selected</span>}
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-200',
          selected ? 'border-accent bg-accent text-accent-foreground' : 'border-border-strong group-hover:border-accent/60',
        )}
      >
        {selected && <Check className="anim-pop h-3.5 w-3.5" strokeWidth={3.5} />}
      </span>
    </span>
  );
}
