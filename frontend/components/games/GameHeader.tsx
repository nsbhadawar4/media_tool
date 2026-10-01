import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import type { GameMeta } from './games';

export interface GameStat {
  label: string;
  value: string | number;
  /** Highlights the figure, e.g. a timer that is running low. */
  tone?: 'default' | 'accent' | 'danger' | 'success';
}

const TONES = {
  default: 'text-foreground',
  accent: 'text-accent-2',
  danger: 'text-danger',
  success: 'text-success',
} as const;

/**
 * The live figures. A figure bumps whenever its value changes. `compact` is the one-row
 * strip used in the phone header, where all four have to fit across a narrow screen.
 */
export function StatsStrip({ stats, compact = false }: { stats: GameStat[]; compact?: boolean }) {
  if (stats.length === 0) return null;
  return (
    <dl
      className={cn(
        'grid',
        compact ? 'grid-cols-4 gap-1.5 px-3 pb-2.5' : 'mt-5 grid-cols-2 gap-3 sm:grid-cols-4',
      )}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={cn(
            'min-w-0 border border-border bg-surface shadow-card',
            compact ? 'rounded-lg px-1.5 py-1.5 text-center' : 'rounded-xl px-4 py-3',
          )}
        >
          <dt
            className={cn(
              'truncate font-medium uppercase text-subtle',
              compact ? 'text-[9px] tracking-wide' : 'text-[11px] tracking-wider',
            )}
          >
            {stat.label}
          </dt>
          <dd className={cn('font-semibold tabular-nums', compact ? 'text-sm' : 'mt-0.5 text-xl', TONES[stat.tone ?? 'default'])}>
            <span key={String(stat.value)} className="anim-score inline-block max-w-full truncate align-bottom">
              {stat.value}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Desktop and tablet header: icon, title and the figures. */
export function GameHeader({ game, stats, actions }: { game: GameMeta; stats: GameStat[]; actions?: ReactNode }) {
  const Icon = game.icon;
  const [c1, c2] = game.colors;
  return (
    <header className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lift"
            style={{ backgroundImage: `linear-gradient(135deg, ${c1}, ${c2})` }}
          >
            <Icon className="h-6 w-6" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-[30px]">
              {game.name}
            </h1>
            <p className="text-sm text-muted">{game.description}</p>
          </div>
        </div>
        {actions}
      </div>
      <StatsStrip stats={stats} />
    </header>
  );
}
