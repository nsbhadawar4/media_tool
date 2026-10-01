import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'app-content-enter relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border-strong bg-surface/40 px-6 py-16 text-center',
        className,
      )}
    >
      {/* A faint radial wash behind the icon: depth without a glow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_srgb,var(--accent)_10%,transparent),transparent)]"
      />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-border-strong bg-surface-elevated text-accent shadow-card">
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </div>
      <h3 className="relative mt-5 text-base font-semibold tracking-tight text-foreground">{title}</h3>
      {description && <p className="relative mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="relative mt-6">{action}</div>}
    </div>
  );
}
