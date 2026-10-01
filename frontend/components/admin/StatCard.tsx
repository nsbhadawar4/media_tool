import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  /** One line under the label, saying what the number counts. */
  hint?: string;
  /** Colour for the icon and the corner tint. Defaults to the accent. */
  color?: string;
  /** Named colour, for callers that just want an intent. `color` wins when both are given. */
  accent?: 'accent' | 'success' | 'warning' | 'danger';
  /** Position in the row, for the staggered entrance. */
  index?: number;
}

/**
 * A single headline figure. Quiet by design — a small tinted icon, a large tabular number,
 * a faint corner wash in the figure's colour — but alive on hover: the card lifts, its
 * border brightens, and the icon pops.
 */
const ACCENT_COLORS = {
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
} as const;

export function StatCard({ icon: Icon, label, value, hint, accent = 'accent', color, index = 0 }: StatCardProps) {
  color = color ?? ACCENT_COLORS[accent];
  const style = { '--tile': color, '--i': index } as CSSProperties;
  return (
    <div
      style={style}
      className="stat-tile card-interactive anim-rise-scale group relative overflow-hidden rounded-2xl border border-border bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="stat-icon flex h-9 w-9 items-center justify-center rounded-xl border"
          style={{
            color,
            backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
            borderColor: `color-mix(in srgb, ${color} 28%, transparent)`,
          }}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
        </div>
      </div>
      <div className="mt-5 min-w-0">
        <p className="truncate text-[28px] font-semibold leading-none tabular-nums tracking-tight text-foreground">
          {value}
        </p>
        <p className="mt-2 truncate text-[13px] font-medium text-foreground-soft">{label}</p>
        {hint && <p className={cn('truncate text-xs text-subtle')}>{hint}</p>}
      </div>
    </div>
  );
}

/** Matches StatCard's geometry exactly, so the grid doesn't shift when data arrives. */
export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4" role="status" aria-label="Loading">
      <div className="h-9 w-9 animate-pulse rounded-xl bg-surface-hover" />
      <div className="mt-5 space-y-2">
        <div className="h-7 w-20 animate-pulse rounded bg-surface-hover" />
        <div className="h-3.5 w-16 animate-pulse rounded bg-surface-hover" />
        <div className="h-3 w-24 animate-pulse rounded bg-surface-hover" />
      </div>
    </div>
  );
}
