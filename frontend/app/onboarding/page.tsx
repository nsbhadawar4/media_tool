'use client';

import { useEffect, useState } from 'react';
import { useNavigationRouter } from '@/lib/navigation/progress';
import { ArrowRight, CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { PricingCards } from '@/components/billing/PricingCards';
import { useAuth } from '@/lib/auth/AuthContext';
import { ApiError } from '@/lib/api/client';
import { ADMIN_HOME_PATH, LOGIN_PATH, USER_HOME_PATH } from '@/lib/auth/routes';
import { formatPrice, planInfo, type PlanId } from '@/lib/billing/plans';

/**
 * First-time onboarding: choose a plan → dashboard. Shown only to accounts the server marks as
 * needing it (every new signup); existing users and admins are sent straight on.
 *
 * Free activates at once. Pro and Premium are saved as pending — there is no payment gateway,
 * so nothing is charged or activated — and the user sees a clear "payment required" state,
 * then continues on Free until payment is possible.
 */
export default function OnboardingPage() {
  const router = useNavigationRouter();
  const { user, isLoading, completeOnboarding } = useAuth();
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);
  // Free is the honest default: nothing is pre-chosen that would cost money.
  const [choice, setChoice] = useState<PlanId>('free');
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Once a paid plan is chosen onboarding is complete, but this page stays to show the result —
  // and while a choice is being saved it must not redirect on its own (the session updates first).
  const destination = !user
    ? LOGIN_PATH
    : user.role === 'admin'
      ? ADMIN_HOME_PATH
      : !user.onboardingRequired && !pendingPlan && !busyPlan
        ? USER_HOME_PATH
        : null;
  useEffect(() => {
    if (!isLoading && destination) router.replace(destination);
  }, [isLoading, destination, router]);

  if (isLoading) return <OnboardingSkeleton />;
  if (destination) return <FullPageSpinner />;

  const firstName = user!.name.trim().split(/\s+/)[0];

  const choose = async (plan: PlanId) => {
    setBusyPlan(plan);
    setError(null);
    try {
      const updated = await completeOnboarding(plan);
      if (updated.subscriptionStatus === 'pending') {
        setPendingPlan(plan);
        setBusyPlan(null);
      } else {
        router.replace(USER_HOME_PATH);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setBusyPlan(null);
    }
  };

  return (
    <main className="app-viewport-min-h auth-backdrop bg-background px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex flex-col items-center text-center">
          <Logo className="anim-logo logo-glow h-12 w-12" />
          {pendingPlan ? null : (
            <>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-accent-2">Welcome, {firstName}</p>
              <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Choose your plan</h1>
              <p className="mt-2 max-w-xl text-sm text-muted sm:text-[15px]">
                Pick the plan that suits you. Free is ready straight away, and you can upgrade any time.
              </p>
            </>
          )}
        </div>

        {pendingPlan ? (
          <PaymentRequired
            plan={pendingPlan}
            busy={busyPlan === 'free'}
            onContinue={() => router.replace(USER_HOME_PATH)}
            onChooseFree={() => void choose('free')}
          />
        ) : (
          <>
            <div className="anim-rise mt-12">
              <PricingCards mode="select" selected={choice} onSelect={setChoice} disabled={busyPlan !== null} />
            </div>
            <ConfirmBar choice={choice} busy={busyPlan !== null} onConfirm={() => void choose(choice)} />
          </>
        )}

        {error && (
          <div role="alert" className="animate-fade-in mx-auto mt-6 max-w-md rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-center text-xs text-danger">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}

/** Shown after choosing Pro or Premium: saved, but not active, and nothing charged. */
function PaymentRequired({ plan, busy, onContinue, onChooseFree }: { plan: PlanId; busy: boolean; onContinue: () => void; onChooseFree: () => void }) {
  const info = planInfo(plan);
  return (
    <section className="anim-rise-scale mx-auto mt-10 max-w-lg rounded-3xl border border-warning/30 bg-surface p-6 text-center shadow-card sm:p-8" aria-labelledby="payment-required-title">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/15 text-warning">
        <CreditCard className="h-6 w-6" />
      </span>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-warning">Payment required</p>
      <h1 id="payment-required-title" className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {info.name} is reserved for you
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {info.name} ({formatPrice(info.price)}/month) becomes active once payment is completed. Online payments aren’t available yet,
        so <strong className="font-semibold text-foreground-soft">nothing has been charged</strong> and {info.name} isn’t active. Until then you
        have full access to the Free plan.
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button type="button" onClick={onContinue} disabled={busy} className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-60">
          Continue to dashboard
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onChooseFree}
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface-elevated px-5 py-3 text-sm font-semibold text-foreground transition hover:border-border-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Use Free instead
        </button>
      </div>
    </section>
  );
}

/**
 * The confirm step under the cards. On phones it sticks to the bottom of the screen, so the
 * choice and its button stay in view while scrolling through the plans.
 */
function ConfirmBar({ choice, busy, onConfirm }: { choice: PlanId; busy: boolean; onConfirm: () => void }) {
  const info = planInfo(choice);
  const paid = info.price > 0;
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-8 border-t border-border bg-background/85 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:static sm:mx-auto sm:mt-10 sm:max-w-md sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        aria-busy={busy || undefined}
        className="btn-primary inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {busy ? 'Saving your choice…' : paid ? `Continue with ${info.name} · ${formatPrice(info.price)}/month` : 'Start with Free'}
        {!busy && <ArrowRight className="h-4 w-4" aria-hidden />}
      </button>
      <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted" aria-live="polite">
        <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
        {paid ? 'Nothing is charged today — online payments aren’t live yet.' : 'No card needed. Upgrade any time.'}
      </p>
    </div>
  );
}

/** Placeholder while the session loads: the page's own shape, so nothing jumps when it arrives. */
function OnboardingSkeleton() {
  return (
    <main className="app-viewport-min-h auth-backdrop bg-background px-4 py-10 sm:px-6 sm:py-14" aria-busy="true">
      <span className="sr-only" role="status">Loading…</span>
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center" aria-hidden>
        <Logo className="h-12 w-12 opacity-80" />
        <div className="mt-6 h-3 w-28 rounded-full bg-surface-hover animate-pulse" />
        <div className="mt-3 h-8 w-64 max-w-full rounded-lg bg-surface-hover animate-pulse" />
        <div className="mt-3 h-3.5 w-80 max-w-full rounded-full bg-surface-hover animate-pulse" />
        <div className="mt-12 grid w-full gap-5 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[420px] rounded-3xl border border-border bg-surface p-7">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-surface-hover animate-pulse" />
                <div className="h-4 w-24 rounded-full bg-surface-hover animate-pulse" />
              </div>
              <div className="mt-7 h-10 w-28 rounded-lg bg-surface-hover animate-pulse" />
              <div className="mt-8 space-y-3">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="h-3 rounded-full bg-surface-hover animate-pulse" style={{ width: `${80 - j * 10}%` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
