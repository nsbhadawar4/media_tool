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

/** Title row plus a strip of live figures. A figure bumps whenever its value changes. */
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

      {stats.length > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-subtle">{stat.label}</dt>
              <dd className={cn('mt-0.5 text-xl font-semibold tabular-nums', TONES[stat.tone ?? 'default'])}>
                <span key={String(stat.value)} className="anim-score inline-block">
                  {stat.value}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
