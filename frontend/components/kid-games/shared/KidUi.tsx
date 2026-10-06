import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, Star, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';
import { CLASS_INFO, SUBJECT_INFO } from '@/lib/kid-games/catalog';
import type { ClassLevel, Subject } from '@/lib/kid-games/types';

/** A rounded progress bar in the current --kg colour, with its value for screen readers. */
export function KidProgressBar({
  value,
  label,
  className,
  size = 'md',
}: {
  /** 0–100 */
  value: number;
  label: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn('w-full overflow-hidden rounded-full bg-surface-hover', size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3.5' : 'h-2.5', className)}
    >
      {clamped > 0 && <div className="kg-gradient kg-bar-fill h-full rounded-full" style={{ width: `${clamped}%` }} />}
    </div>
  );
}

/** A circular progress ring in the current --kg colours, with the percentage (or any label) inside. */
export function KidProgressRing({
  value,
  label,
  size = 72,
  stroke = 8,
  children,
}: {
  /** 0–100 */
  value: number;
  label: string;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const id = `kg-ring-${label.replace(/\W+/g, '-')}`;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--kg)" />
            <stop offset="100%" stopColor="var(--kg-2)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-hover)" strokeWidth={stroke} />
        <circle
          className="kg-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * clamped) / 100}
          style={{ '--kg-ring-len': c } as CSSProperties}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center text-sm font-bold tabular-nums text-foreground">{children ?? `${clamped}%`}</span>
    </div>
  );
}

/** 0–3 stars; earned ones are filled. Reads as "2 of 3 stars". */
export function KidStars({ value, max = 3, size = 'sm', animate = false }: { value: number; max?: number; size?: 'sm' | 'md' | 'lg'; animate?: boolean }) {
  const px = size === 'lg' ? 'h-12 w-12 sm:h-14 sm:w-14' : size === 'md' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={animate ? 'kg-star' : undefined} style={animate ? { animationDelay: `${0.3 + i * 0.22}s` } : undefined}>
          <Star aria-hidden className={cn(px, i < value ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-border-strong')} strokeWidth={1.75} />
        </span>
      ))}
    </span>
  );
}

/** One headline number with an icon: XP, streak, best score, games completed. */
export function KidStat({ icon: Icon, label, value, tone, className }: { icon: LucideIcon; label: string; value: ReactNode; tone: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface-elevated/80 px-3.5 py-3 shadow-card', className)}>
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tone)}>
        <Icon aria-hidden className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-muted">{label}</p>
        <p className="truncate text-lg font-bold tabular-nums leading-tight text-foreground">{value}</p>
      </div>
    </div>
  );
}

/** Soft shapes drifting behind a hero. Decorative; still when motion is reduced. */
export function KidFloatingShapes({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <span className="kg-float kg-float-a" />
      <span className="kg-float kg-float-b" />
      <span className="kg-float kg-float-c" />
      <span className="kg-float kg-float-d" />
    </div>
  );
}

export function KidBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl py-1 pr-2 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
    >
      <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
      {label}
    </Link>
  );
}

export function KidSectionTitle({ title, hint, action, id, icon: Icon }: { title: string; hint?: string; action?: ReactNode; id?: string; icon?: LucideIcon }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4">
      <div className="min-w-0">
        <h2 id={id} className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground sm:text-xl">
          {Icon && <Icon aria-hidden className="h-5 w-5 text-accent-2" />}
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** "Nothing here" without a big empty hole: an icon, one friendly line, and somewhere to go. */
export function KidEmptyState({ icon: Icon, title, description, actions }: { icon: LucideIcon; title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="kg-enter relative flex flex-col items-center overflow-hidden rounded-3xl border border-dashed border-border-strong bg-surface/50 px-6 py-12 text-center">
      <span className="kg-tint kg-text kg-bob mb-3 flex h-16 w-16 items-center justify-center rounded-2xl">
        <Icon aria-hidden className="h-8 w-8" />
      </span>
      <h3 className="text-lg font-bold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

/** A subject's icon from the catalogue, sized by the caller. */
export function SubjectIcon({ subject, className }: { subject: Subject; className?: string }) {
  const Icon = SUBJECT_INFO[subject].icon;
  return <Icon aria-hidden className={className} />;
}

/** A class's icon from the catalogue, sized by the caller. */
export function ClassIcon({ level, className }: { level: ClassLevel; className?: string }) {
  const Icon = CLASS_INFO[level].icon;
  return <Icon aria-hidden className={className} />;
}
