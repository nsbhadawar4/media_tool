import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Small line above the title — a count, a path, a greeting. */
  eyebrow?: ReactNode;
  /** Icon shown in a tinted tile before the title. */
  icon?: LucideIcon;
}

export function PageHeader({ title, description, actions, eyebrow, icon: Icon }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        {Icon && (
          <span className="gradient-border hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-accent/25 to-accent/5 text-accent-2 shadow-card sm:flex">
            <Icon className="h-6 w-6" strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-2">{eyebrow}</div>
          )}
          <h1 className="bg-linear-to-b from-foreground to-foreground/85 bg-clip-text text-[28px] font-semibold leading-tight tracking-tight text-transparent sm:text-[34px]">
            {title}
          </h1>
          {description && <p className="mt-1.5 max-w-2xl text-sm text-muted sm:text-[15px]">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
