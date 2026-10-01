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
 * too narrow for a side-by-side layout, and values like "18.4 MB" were being truncated.
 * Quiet on purpose — a small tinted icon and a tabular number, not a coloured block.
 */
export function StatCard({ icon: Icon, label, value, accent = 'accent' }: StatCardProps) {
  return (
    <Card className="flex flex-col gap-4 p-4 transition-colors duration-150 hover:border-border-strong">
      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', ACCENT_CLASSES[accent])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{label}</p>
      </div>
    </Card>
  );
}

/** Matches StatCard's geometry exactly, so the grid doesn't shift when data arrives. */
export function StatCardSkeleton() {
  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="h-8 w-8 animate-pulse rounded-lg bg-surface-hover" />
      <div className="space-y-2">
        <div className="h-7 w-16 animate-pulse rounded bg-surface-hover" />
        <div className="h-3 w-20 animate-pulse rounded bg-surface-hover" />
      </div>
    </Card>
  );
}
