'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { RotateCcw, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { BackToGames } from './BackToGames';

interface GameResultProps {
  title: string;
  subtitle?: string;
  /** Numbers count up on arrival; a suffix such as '%' is appended to a number. */
  stats?: Array<{ label: string; value: string | number; suffix?: string }>;
  /** Extra content under the figures, e.g. a side-by-side comparison. */
  children?: ReactNode;
  /** Tints the trophy and glow, e.g. with the winning player's colour. */
  accent?: string;
  onPlayAgain: () => void;
  playAgainLabel?: string;
  /** 'win' adds the confetti; 'neutral' is a plain score screen. */
  variant?: 'win' | 'neutral';
}

/** Confetti pieces on fixed vectors (no randomness, so server and client markup agree). */
const PIECES = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const dist = 110 + (i % 3) * 36;
  return {
    cx: Math.round(Math.cos(angle) * dist),
    cy: Math.round(Math.sin(angle) * dist - 30),
    cr: (i % 2 ? 1 : -1) * (180 + i * 24),
    color: ['#7c5cff', '#9b87ff', '#22c55e', '#f59e0b', '#38bdf8', '#ec4899'][i % 6]!,
  };
});

/** Counts from 0 up to the value with an ease-out, then holds. Cancels its frame on unmount. */
function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const duration = 700;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <>
      {shown}
      {suffix}
    </>
  );
}

/** Full-cover overlay for the end of a round. Sits inside the game area, which must be `relative`. */
export function GameResult({
  title,
  subtitle,
  stats = [],
  onPlayAgain,
  playAgainLabel = 'Play again',
  variant = 'win',
  children,
  accent,
}: GameResultProps) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className="game-safe-top game-safe-bottom animate-fade-in flex items-center justify-center bg-background/75 p-4 backdrop-blur-md max-md:fixed max-md:inset-0 max-md:z-50 max-md:bg-background/95 md:absolute md:inset-0 md:z-30"
    >
      <div
        className="gradient-border anim-rise-scale relative w-full max-w-sm rounded-3xl border border-border-strong bg-surface-elevated p-6 text-center shadow-pop"
        style={accent ? { boxShadow: `0 0 70px -18px ${accent}, 0 24px 64px -12px rgba(0,0,0,.8)`, borderColor: `${accent}77` } : undefined}
      >
        {variant === 'win' && (
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-14">
            {PIECES.map((p, i) => (
              <span
                key={i}
                className="confetti-piece absolute h-2 w-2 rounded-sm"
                style={
                  {
                    backgroundColor: p.color,
                    '--cx': `${p.cx}px`,
                    '--cy': `${p.cy}px`,
                    '--cr': `${p.cr}deg`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        )}
        <div
          className={cn(
            'anim-pop mx-auto flex h-16 w-16 items-center justify-center rounded-2xl',
            variant === 'win' ? 'bg-warning/15 text-warning' : 'bg-accent/15 text-accent-2',
          )}
          style={accent ? { backgroundColor: `${accent}26`, color: accent } : undefined}
        >
          <Trophy className="h-8 w-8" strokeWidth={1.7} />
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}

        {stats.length > 0 && (
          <dl className="mt-5 grid grid-cols-2 gap-2.5">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-surface px-3 py-2.5">
                <dt className="text-[11px] uppercase tracking-wider text-subtle">{stat.label}</dt>
                <dd className="text-lg font-semibold tabular-nums text-foreground">{typeof stat.value === 'number' ? <CountUp value={stat.value} suffix={stat.suffix} /> : stat.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {children}

        <Button className="mt-6 min-h-12 w-full" size="lg" onClick={onPlayAgain}>
          <RotateCcw className="h-4 w-4" />
          {playAgainLabel}
        </Button>
        <BackToGames variant="block" className="mt-2.5" />
      </div>
    </div>
  );
}
