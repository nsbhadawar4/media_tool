import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * The one card for a learning class (Class 1–5, and any class an administrator adds), used
 * everywhere classes are shown: the public Kid Games section, the Kid Games hub in the app, and
 * the admin preview. Presentation only — every page passes its own data, link and wording.
 *
 * No hooks and no 'use client', so server components (the public home page) render it too.
 */

/** Each built-in class's own illustration (public/images/classes) and second line. */
const CLASS_LOOK: Record<number, { image: string; subtitle: string; alt: string }> = {
  1: { image: '/images/classes/class-1.svg', subtitle: 'Foundation Learning', alt: 'A young child holding an alphabet block' },
  2: { image: '/images/classes/class-2.svg', subtitle: 'Growing Skills', alt: 'A child reading an open storybook' },
  3: { image: '/images/classes/class-3.svg', subtitle: 'Explore & Learn', alt: 'A child exploring with a magnifying glass and a plant' },
  4: { image: '/images/classes/class-4.svg', subtitle: 'Build Your Knowledge', alt: 'A child with glasses solving maths in a notebook' },
  5: { image: '/images/classes/class-5.svg', subtitle: 'Smart Learning', alt: 'A child learning on a tablet beside a stack of books' },
};

/** Class colours (globals.css --kid-class-N); classes beyond 5 reuse the five in turn. */
function classVars(level: number): CSSProperties {
  const slot = ((Math.max(1, level) - 1) % 5) + 1;
  return { '--kg': `var(--kid-class-${slot})`, '--kg-2': `var(--kid-class-${slot}-2)` } as CSSProperties;
}

export interface ClassCourseFact {
  /** Shown as a small chip: "30 games", "3 subjects", "12 / 45 stars". */
  label: string;
  icon?: ReactNode;
}

export interface ClassCourseCardProps {
  level: number;
  /** "Class 1", or the administrator's title. */
  title: string;
  /** Defaults to the class's own second line (Foundation Learning, …). */
  subtitle?: string;
  /** The administrator's description, if any. */
  description?: string;
  /**
   * The picture. Built-in classes use their own illustration unless one is given; an
   * administrator-added class shows its thumbnail, or the class colours with an icon.
   */
  image?: string | null;
  /** Use the built-in illustration for this level (Classes 1–5 implemented in the app). */
  builtIn?: boolean;
  /** Where the whole card leads. Without it the card is a picture (the admin preview). */
  href?: string;
  /** The link's accessible name; defaults to the title and subtitle. */
  linkLabel?: string;
  /** Facts the page already has — counts, stars, XP. Never invented here. */
  facts?: ClassCourseFact[];
  /** Real progress only (0–100), with what it measures. */
  progress?: { percent: number; label: string } | null;
  cta?: string;
  /** Position in its grid, for the staggered entrance. */
  index?: number;
  className?: string;
}

export function ClassCourseCard({
  level,
  title,
  subtitle,
  description,
  image,
  builtIn = false,
  href,
  linkLabel,
  facts = [],
  progress = null,
  cta = 'Explore',
  index = 0,
  className,
}: ClassCourseCardProps) {
  const look = builtIn ? CLASS_LOOK[level] : undefined;
  const src = image || look?.image || null;
  const isLocal = Boolean(src?.startsWith('/'));
  const second = subtitle ?? look?.subtitle ?? 'Courses & activities';
  const percent = progress ? Math.max(0, Math.min(100, Math.round(progress.percent))) : null;

  return (
    <article
      style={{ ...classVars(level), '--i': index } as CSSProperties}
      className={cn('kg-course-card group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-border shadow-card', className)}
    >
      {href && (
        <Link
          href={href}
          aria-label={linkLabel ?? `${title}: ${second}`}
          className="absolute inset-0 z-10 rounded-[1.75rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)"
        />
      )}

      {/* Picture: about half the card (the illustrations keep their subject inside a 4:3 crop). */}
      <div className="relative aspect-[4/3] shrink-0 overflow-hidden">
        {src ? (
          isLocal ? (
            // Static SVG from /public: served as is (no optimiser needed), sized by the frame.
            <Image src={src} alt={look?.alt ?? ''} fill unoptimized sizes="(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw" className="kg-course-art object-cover" priority={index < 3} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- an administrator's image from any https host
            <img src={src} alt="" className="kg-course-art absolute inset-0 h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          )
        ) : (
          <div aria-hidden className="kg-course-art absolute inset-0 bg-linear-to-br from-(--kg) to-(--kg-2)">
            <span className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/20" />
            <span className="absolute -bottom-12 left-6 h-28 w-28 rounded-full bg-black/10" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/30 bg-white/15 backdrop-blur-sm">
                <GraduationCap className="h-8 w-8 text-white" strokeWidth={1.8} />
              </span>
            </span>
          </div>
        )}
        {/* Soft fade at the foot of the picture, so it settles into the card. */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/35 via-black/10 to-transparent" />
        <span className="kg-course-badge absolute left-4 top-4 rounded-full border border-white/30 bg-slate-900/40 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white shadow-[0_4px_14px_-6px_rgba(0,0,0,0.45)] backdrop-blur-md [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
          {builtIn ? `Class ${level}` : title}
        </span>
        {percent !== null && (
          <span className="absolute right-4 top-4 rounded-full border border-white/45 bg-black/25 px-2.5 py-1 text-[11px] font-bold tabular-nums text-white backdrop-blur-md">
            {percent}%
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-(--kg) to-(--kg-2) text-lg font-bold text-white shadow-[0_10px_20px_-12px_var(--kg)]"
          >
            {level}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-xl font-semibold tracking-tight text-foreground">{title}</h3>
            {/* Class colour mixed with the text colour: readable on light and dark surfaces alike. */}
            <p className="truncate text-sm font-medium text-[color-mix(in_srgb,var(--kg)_68%,var(--foreground))]">{second}</p>
          </div>
        </div>

        {description && <p className="line-clamp-2 text-sm leading-relaxed text-muted">{description}</p>}

        {facts.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="About this class">
            {facts.map((fact) => (
              <li
                key={fact.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover/60 px-2.5 py-1 text-xs font-medium text-foreground-soft"
              >
                {fact.icon}
                {fact.label}
              </li>
            ))}
          </ul>
        )}

        {progress && percent !== null && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-muted">{progress.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">{percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={progress.label}>
              <div className="h-full rounded-full bg-linear-to-r from-(--kg) to-(--kg-2)" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}

        {/* The action always sits on the bottom line, so cards in a row line up. */}
        <div aria-hidden className="flex-1" />
        <div className="flex justify-end">
          <span className="kg-course-cta inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-(--kg) to-(--kg-2) px-5 text-sm font-semibold text-white sm:w-auto">
            {cta}
            <ArrowRight aria-hidden className="kg-course-cta-arrow h-4 w-4" />
          </span>
        </div>
      </div>
    </article>
  );
}
