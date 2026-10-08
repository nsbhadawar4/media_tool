import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/utils/cn';

interface DashboardPanelProps {
  title: string;
  /** A short line under the title saying what the panel lists. */
  description?: string;
  icon: LucideIcon;
  /** "View all"-style link in the header's corner. */
  link?: { href: string; label: string };
  /** Shown beside the title, e.g. a count. */
  badge?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * The frame every admin-dashboard section sits in: a titled card with an optional corner link.
 * min-w-0 throughout so a long email or file name truncates instead of widening the grid.
 */
export function DashboardPanel({ title, description, icon: Icon, link, badge, className, children }: DashboardPanelProps) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-2xl border border-border bg-surface shadow-card', className)}>
      {/* Wraps rather than truncating: on a phone the corner link drops below the title. */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="flex min-w-[12rem] flex-1 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
            <Icon className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
              {badge}
            </div>
            {description && <p className="truncate text-xs text-muted">{description}</p>}
          </div>
        </div>
        {link && (
          <Link
            href={link.href}
            className="group ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/10"
          >
            {link.label}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </header>
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </section>
  );
}

/** Placeholder rows matching a list's rhythm, so the panel does not jump when data lands. */
export function PanelRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-hover" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-2/5 animate-pulse rounded bg-surface-hover" />
            <div className="h-2.5 w-3/5 animate-pulse rounded bg-surface-hover" />
          </div>
          <div className="h-3 w-12 animate-pulse rounded bg-surface-hover" />
        </div>
      ))}
    </div>
  );
}

/** A quiet in-panel empty message; the full EmptyState is too tall for a dashboard tile. */
export function PanelEmpty({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-strong bg-surface-elevated text-muted">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs text-muted">{description}</p>}
    </div>
  );
}
