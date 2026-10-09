import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface DistributionSegment {
  label: string;
  value: number;
  color: string;
  icon: LucideIcon;
  /** A second figure for the legend, e.g. "+2 this week". */
  detail?: string;
}

/**
 * How a total splits into parts — the plans accounts are on, how they sign in. One stacked bar
 * and a legend with the counts and shares; nothing is drawn for a part that is zero, and an
 * empty total says so instead of drawing an empty bar. The figures are the server's.
 */
export function Distribution({
  title,
  description,
  icon: Icon,
  segments,
  className,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  segments: readonly DistributionSegment[];
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const share = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <section className={cn('card-interactive rounded-2xl border border-border bg-surface p-5 sm:p-6', className)} aria-label={title}>
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted">{description}</p>
        </div>
        <span className="shrink-0 text-right">
          <span className="block text-xl font-semibold tabular-nums text-foreground">{total.toLocaleString()}</span>
          <span className="block text-[11px] text-subtle">accounts</span>
        </span>
      </header>

      {total === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted">No accounts yet.</p>
      ) : (
        <div
          className="mt-5 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-hover"
          role="img"
          aria-label={segments.map((s) => `${s.label}: ${s.value} (${share(s.value)}%)`).join(', ')}
        >
          {segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <span key={s.label} className="dist-bar h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }} />
            ))}
        </div>
      )}

      <ul className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {segments.map(({ label, value, color, icon: SegmentIcon, detail }) => (
          <li key={label} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-surface-hover/40 px-3 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ color, backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}>
              <SegmentIcon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-muted">{label}</span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-base font-semibold tabular-nums text-foreground">{value.toLocaleString()}</span>
                <span className="text-[11px] tabular-nums text-subtle">{share(value)}%</span>
              </span>
              {detail && <span className="block truncate text-[11px] text-subtle">{detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
