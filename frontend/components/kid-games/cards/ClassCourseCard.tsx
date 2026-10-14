import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { cn } from '@/utils/cn';
import { resolveAssetUrl } from '@/lib/api/client';

/**
 * The one card for a learning class (Class 1–5, and any class an administrator adds), used
 * everywhere classes are shown: the public Kid Games section, the Kid Games hub in the app, and
 * the admin preview. Presentation only — every page passes its own data, link and wording.
 *
 * No hooks and no 'use client', so server components (the public home page) render it too.
 */

/**
 * Each built-in class's own photograph (public/images/classes, Unsplash License — see CREDITS.md
 * there), its second line, and where the child sits in the frame so both crops keep the face.
 * The children get older from Class 1 to Class 5.
 */
const CLASS_LOOK: Record<number, { image: string; subtitle: string; alt: string; focus: string }> = {
  1: { image: '/images/classes/class-1.jpg', subtitle: 'Foundation', alt: 'A young girl reading a picture book at the table', focus: '40% 30%' },
  2: { image: '/images/classes/class-2.jpg', subtitle: 'Building Skills', alt: 'A girl in a pink jumper writing in her book', focus: '50% 25%' },
  3: { image: '/images/classes/class-3.jpg', subtitle: 'Explore & Learn', alt: 'A boy reading a large book in a library', focus: '40% 35%' },
  4: { image: '/images/classes/class-4.jpg', subtitle: 'Grow Smarter', alt: 'A smiling boy with glasses doing homework at his desk', focus: '50% 25%' },
  5: { image: '/images/classes/class-5.jpg', subtitle: 'Be Future Ready', alt: 'Students in school uniform writing in class', focus: '50% 35%' },
};

/**
 * A class's picture wherever it is shown: the administrator's image, else the built-in photograph
 * (Classes 1–5), else none. `local`: a file in /public (for next/image); otherwise a usable URL.
 */
export function classPicture(level: number, image: string | null | undefined, title: string, builtIn: boolean) {
  const look = builtIn ? CLASS_LOOK[level] : undefined;
  if (image) return { src: image.startsWith('/api/') || !image.startsWith('/') ? resolveAssetUrl(image) : image, local: image.startsWith('/') && !image.startsWith('/api/'), alt: `${title} picture`, focus: undefined };
  if (look) return { src: look.image, local: true, alt: look.alt, focus: look.focus };
  return null;
}

/** The built-in second line of Classes 1–5 ("Foundation"), if this is one. */
export function builtInSubtitle(level: number): string | undefined {
  return CLASS_LOOK[level]?.subtitle;
}

/**
 * The photo treatment: an emerald-and-mint veil with a soft glow, tinted towards the class colour
 * at the foot, so five different photographs read as one set in light and dark mode alike.
 */
function PhotoVeil() {
  return <span aria-hidden className="kg-photo-veil pointer-events-none absolute inset-0" />;
}

/** Class colours (globals.css --kid-class-N); classes beyond 5 reuse the five in turn. */
export function classVars(level: number): CSSProperties {
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
   * The picture. Built-in classes use their own photograph unless one is given; an
   * administrator-added class shows its thumbnail, or the class colours with an icon.
   */
  image?: string | null;
  /** Use the built-in photograph for this level (Classes 1–5 implemented in the app). */
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
  /** compact: picture, class and its line only — the row of classes under the home page hero. */
  variant?: 'full' | 'compact';
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
  variant = 'full',
}: ClassCourseCardProps) {
  const look = builtIn ? CLASS_LOOK[level] : undefined;
  // An administrator's picture wins; a built-in class falls back to its own photograph.
  const stored = image || look?.image || null;
  // Files in /public go through next/image; uploads (/api/content/images/…) and links load as they are.
  const isLocal = Boolean(stored?.startsWith('/') && !stored.startsWith('/api/'));
  const src = stored && !isLocal ? resolveAssetUrl(stored) : stored;
  const alt = image ? `${title} picture` : (look?.alt ?? '');
  const second = subtitle ?? look?.subtitle ?? 'Courses & activities';
  const percent = progress ? Math.max(0, Math.min(100, Math.round(progress.percent))) : null;

  if (variant === 'compact') {
    return (
      <article
        style={{ ...classVars(level), '--i': index } as CSSProperties}
        className={cn('kg-course-card group relative flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border shadow-card', className)}
      >
        {href && (
          <Link href={href} aria-label={linkLabel ?? `${title}: ${second}`} className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)" />
        )}
        <div className="relative aspect-[5/4] shrink-0 overflow-hidden">
          {src && isLocal ? (
            <Image src={src} alt={alt} fill unoptimized={src.endsWith('.svg')} sizes="(min-width: 1024px) 260px, (min-width: 640px) 33vw, 70vw" className="kg-course-art object-cover" style={look && !image ? { objectPosition: look.focus } : undefined} />
          ) : src ? (
            // eslint-disable-next-line @next/next/no-img-element -- an administrator's image from any https host
            <img src={src} alt={alt} className="kg-course-art absolute inset-0 h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <div aria-hidden className="kg-course-art absolute inset-0 flex items-center justify-center bg-linear-to-br from-(--kg) to-(--kg-2)">
              <GraduationCap className="h-8 w-8 text-white" strokeWidth={1.8} />
            </div>
          )}
          {src && <PhotoVeil />}
        </div>
        <div className="flex flex-1 items-center justify-between gap-2 p-3.5 sm:p-4">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{title}</h3>
            <p className="truncate text-xs font-medium text-[color-mix(in_srgb,var(--kg)_68%,var(--foreground))]">{second}</p>
          </div>
          <span aria-hidden className="kg-course-cta flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-(--kg) to-(--kg-2) text-white">
            <ArrowRight className="kg-course-cta-arrow h-4 w-4" />
          </span>
        </div>
      </article>
    );
  }

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

      {/* Picture: about half the card (each photo's focus point keeps the child inside a 4:3 crop). */}
      <div className="relative aspect-[4/3] shrink-0 overflow-hidden">
        {src ? (
          isLocal ? (
            // From /public: photographs go through the image optimiser; an SVG is served as is.
            <Image
              src={src}
              alt={alt}
              fill
              unoptimized={src.endsWith('.svg')}
              sizes="(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw"
              className="kg-course-art object-cover"
              style={look && !image ? { objectPosition: look.focus } : undefined}
              priority={index < 3}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- an administrator's image from any https host
            <img src={src} alt={alt} className="kg-course-art absolute inset-0 h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
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
        {src && <PhotoVeil />}
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

/**
 * A class's picture as a small rounded tile (class page headers): the administrator's image or the
 * built-in photograph, with the class colours behind it; null when the class has neither.
 */
export function ClassPictureThumb({ level, image, title, builtIn, className }: { level: number; image: string | null | undefined; title: string; builtIn: boolean; className?: string }) {
  const picture = classPicture(level, image, title, builtIn);
  if (!picture) return null;
  return (
    <span style={classVars(level)} className={cn('relative block shrink-0 overflow-hidden rounded-2xl bg-linear-to-br from-(--kg) to-(--kg-2) shadow-lift ring-2 ring-white/40', className)}>
      {picture.local ? (
        <Image src={picture.src} alt={picture.alt} fill sizes="96px" className="object-cover" style={picture.focus ? { objectPosition: picture.focus } : undefined} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- an uploaded or linked picture
        <img src={picture.src} alt={picture.alt} className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" />
      )}
    </span>
  );
}
