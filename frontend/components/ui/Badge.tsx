import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'accent';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'bg-surface-hover text-muted',
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning',
  accent: 'bg-accent/10 text-accent',
};

export function Badge({
  children,
  variant = 'default',
  className,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  /**
   * Overrides the variant's colours. For the one case the variants cannot cover: a file's
   * badge takes the colour of its own type (see toneForMedia), and those are per-format
   * rather than per-intent, so enumerating them here would mean a variant per file format.
   */
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize',
        className ?? VARIANT_CLASSES[variant],
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover"
    >
      <div
        className="relative h-full overflow-hidden rounded-full bg-linear-to-r from-accent to-accent-2 transition-[width] duration-300 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      >
        {/* The sheen only runs while the transfer is still going. */}
        {value < 100 && <span className="progress-live absolute inset-0" />}
      </div>
    </div>
  );
}
