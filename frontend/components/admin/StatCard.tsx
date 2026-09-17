import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/utils/cn';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  accent?: 'accent' | 'success' | 'warning' | 'danger';
}

const ACCENT_CLASSES = {
  accent: 'bg-accent/10 text-accent',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
} as const;

/**
 * Stacked rather than icon-beside-text: six of these across a desktop row leaves each one
 * too narrow for a side-by-side layout, and values like "18.4 MB" and labels like
 * "Storage used" were being truncated to "18 …" and "Storage us…". Giving the text the
 * full card width means the number a stat exists to show always fits.
 */
export function StatCard({ icon: Icon, label, value, accent = 'accent' }: StatCardProps) {
  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors duration-150 hover:border-accent/30">
      <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', ACCENT_CLASSES[accent])}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className="truncate text-xs text-muted">{label}</p>
      </div>
    </Card>
  );
}

/** Matches StatCard's geometry exactly, so the grid doesn't shift when data arrives. */
export function StatCardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="h-9 w-9 animate-pulse rounded-xl bg-surface-hover" />
      <div className="space-y-2">
        <div className="h-6 w-16 animate-pulse rounded bg-surface-hover" />
        <div className="h-3 w-20 animate-pulse rounded bg-surface-hover" />
      </div>
    </Card>
  );
}
