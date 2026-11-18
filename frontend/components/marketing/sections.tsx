import Image from "next/image";
import Link from "next/link";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { ClassSubjectPicker } from "@/components/courses/ClassSubjectPicker";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlay,
  Crown,
  CloudUpload,
  FileSpreadsheet,
  File as FileIcon,
  FileText,
  Files,
  Flame,
  FolderClosed,
  Gamepad2,
  GraduationCap,
  KeyRound,
  Layers,
  LayoutGrid,
  LibraryBig,
  Lock,
  LogIn,
  MonitorSmartphone,
  MoveRight,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  Trash2,
  Trophy,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { GameMeta } from "@/components/games/games";
import type { ClassView } from "@/lib/content/catalog";
import { builtInSubtitle, classPicture, classVars } from "@/components/kid-games/cards/ClassCourseCard";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { PricingCards } from "@/components/billing/PricingCards";
import { cn } from "@/utils/cn";
import { AuroraArt, GreenHillsArt, MountainSunsetArt, NightSkyArt, WaterfallArt } from "./visuals";

/*
 * The public home page's sections. Server components only: the page ships no JavaScript for
 * them (the header's menu and the reviews carousel are the only client islands). Every claim
 * describes something the app does today; where content comes from the admin-managed catalog
 * (games, classes, subjects), it is passed in rather than assumed.
 */

/* ------------------------------------------------------------------------------------------
 * Shared pieces
 * ---------------------------------------------------------------------------------------- */

/** Width, gutters and vertical rhythm every section shares. */
function Section({
  id,
  className,
  inner,
  children,
}: {
  id?: string;
  className?: string;
  inner?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        // mk-section: a header link lands on the heading, not on this padding (globals.css).
        "mk-section relative px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-[88px]",
        className,
      )}
    >
      <div className={cn("relative mx-auto max-w-7xl", inner)}>{children}</div>
    </section>
  );
}

function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mk-eyebrow inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-2",
        className,
      )}
    >
      <span
        aria-hidden
        className="h-px w-6 bg-linear-to-r from-transparent to-accent-2"
      />
      {children}
    </p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mk-reveal max-w-2xl",
        align === "center" ? "mx-auto text-center" : "text-left",
        className,
      )}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-[44px]">
        {title}
      </h2>
      {description && (
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-muted sm:text-[17px]">
          {description}
        </p>
      )}
    </div>
  );
}

/** A violet gradient on the words that matter. */
function Highlight({ children }: { children: ReactNode }) {
  return <span className="mk-text-gradient">{children}</span>;
}

function IconTile({
  icon: Icon,
  color = "var(--accent)",
  className,
}: {
  icon: LucideIcon;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
        className,
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 26%, transparent)`,
      }}
    >
      <Icon className="h-5 w-5" strokeWidth={1.85} />
    </span>
  );
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function PrimaryCta({
  href = "/signup",
  children = "Get Started",
  className,
  pill = false,
}: {
  href?: string;
  children?: ReactNode;
  className?: string;
  /** Fully rounded ends instead of the usual rounded corners. */
  pill?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "btn-primary mk-sheen group inline-flex min-h-12 items-center justify-center gap-2 px-6 text-sm font-semibold text-accent-foreground",
        pill ? "rounded-full" : "rounded-xl",
        focusRing,
        className,
      )}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

function SecondaryCta({
  href,
  children,
  className,
  pill = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  /** Fully rounded ends instead of the usual rounded corners. */
  pill?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "mk-btn-ghost inline-flex min-h-12 items-center justify-center gap-2 px-6 text-sm font-semibold text-foreground",
        pill ? "rounded-full" : "rounded-xl",
        focusRing,
        className,
      )}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------------------------------
 * Hero
 * ---------------------------------------------------------------------------------------- */

const TRUST = [
  { icon: Lock, label: "Private to your account" },
  { icon: MonitorSmartphone, label: "Runs in your browser" },
  { icon: Zap, label: "Free plan, no card needed" },
] as const;

/** The subjects the built-in classes teach, as chips beside the student. */
const HERO_SUBJECTS = [
  { label: "Hindi", tile: "bg-[#22c55e] text-white", mark: <BookOpen className="h-5 w-5" strokeWidth={2.2} /> },
  { label: "English", tile: "bg-[#8b5cf6] text-white", mark: <span className="text-lg font-extrabold leading-none">A</span> },
  { label: "Maths", tile: "bg-[#f59e0b] text-white", mark: <Calculator className="h-5 w-5" strokeWidth={2.2} /> },
] as const;

/** What the platform offers, in four words each — every one of them true of the app. */
const HERO_FEATURES = [
  { icon: BookOpen, label: "Interactive Learning" },
  { icon: Gamepad2, label: "Fun Games & Activities" },
  { icon: TrendingUp, label: "Progress Tracking" },
  { icon: ShieldCheck, label: "Safe & Secure Platform" },
] as const;

/** A class under the hero: its picture, name and line, in a glowing frame (the first wears a crown). */
function HeroClassCard({ c, index }: { c: ClassView; index: number }) {
  const picture = classPicture(c.level, c.thumbnailUrl, c.title, c.isCode);
  const subtitle = c.subtitle || builtInSubtitle(c.level);
  return (
    <Link
      href={`/classes/${c.key}`}
      aria-label={`Explore ${c.title}`}
      className={cn(
        "group relative block rounded-[1.75rem] border-2 border-accent-2/80 bg-surface-elevated p-1.5 shadow-[0_0_0_4px_var(--glow),0_0_36px_-4px_var(--accent-2)] transition-transform duration-300 hover:-translate-y-1",
        focusRing,
      )}
    >
      {index === 0 && (
        <Crown aria-hidden className="absolute -right-5 -top-6 z-10 h-10 w-10 rotate-[18deg] text-[#facc15] drop-shadow-[0_0_10px_rgba(250,204,21,0.6)]" strokeWidth={2.2} />
      )}
      <span className="relative block aspect-[16/10] overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-[#14532d] to-[#052e16]">
        {picture ? (
          <Image
            src={picture.src}
            alt={picture.alt}
            fill
            unoptimized={!picture.local}
            sizes="(min-width: 1024px) 300px, 70vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            style={picture.focus ? { objectPosition: picture.focus } : undefined}
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-accent-2">
            <GraduationCap className="h-12 w-12" />
          </span>
        )}
        {/* Fades the picture into the card's caption. */}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-surface-elevated to-transparent" />
      </span>
      <span className="flex items-center justify-between gap-3 px-4 pb-3 pt-2">
        <span className="min-w-0">
          <span className="block truncate text-2xl font-bold text-foreground">{c.title}</span>
          {subtitle && <span className="block truncate text-[15px] text-foreground-soft">{subtitle}</span>}
        </span>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-2 to-accent text-accent-foreground shadow-[0_0_18px_var(--glow)] transition-transform group-hover:translate-x-0.5">
          <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
        </span>
      </span>
    </Link>
  );
}

/** Graduation cap on two books between leaves, drawn in glowing emerald lines (decorative). */
function HeroLearnIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 260" className={className} aria-hidden fill="none">
      <defs>
        <linearGradient id="hl-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--accent-2)", stopOpacity: 0.35 }} />
          <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0.12 }} />
        </linearGradient>
        <linearGradient id="hl-leaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--accent-2)", stopOpacity: 0.45 }} />
          <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0.08 }} />
        </linearGradient>
        <filter id="hl-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Leaves */}
      <path d="M70 250 C 40 200, 50 150, 90 120 C 110 170, 100 220, 70 250 Z" fill="url(#hl-leaf)" />
      <path d="M60 252 C 20 240, 0 200, 10 170 C 50 185, 70 220, 60 252 Z" fill="url(#hl-leaf)" />
      <path d="M350 250 C 380 200, 370 150, 330 120 C 310 170, 320 220, 350 250 Z" fill="url(#hl-leaf)" />
      <path d="M362 252 C 400 240, 420 200, 410 168 C 372 184, 352 220, 362 252 Z" fill="url(#hl-leaf)" />
      <g style={{ stroke: "var(--accent-2)" }} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" filter="url(#hl-glow)">
        {/* Bottom book */}
        <path d="M96 214 L320 214 Q332 214 332 226 L332 238 Q332 250 320 250 L96 250 Z" fill="url(#hl-fill)" />
        <path d="M150 224 L310 224 M150 240 L310 240" opacity="0.7" />
        {/* Top book */}
        <path d="M110 170 L300 170 Q312 170 312 182 L312 196 Q312 208 300 208 L110 208 Z" fill="url(#hl-fill)" />
        <path d="M160 180 L292 180 M160 198 L292 198" opacity="0.7" />
        {/* Cap crown */}
        <path d="M150 92 L150 132 Q210 160 270 132 L270 92" fill="url(#hl-fill)" />
        {/* Cap board */}
        <path d="M210 30 L330 76 L210 122 L90 76 Z" fill="url(#hl-fill)" />
        {/* Tassel */}
        <path d="M210 76 L300 92 L300 132" />
        <path d="M292 132 L308 132 L312 150 L288 150 Z" style={{ fill: "var(--accent-2)" }} fillOpacity="0.6" />
      </g>
    </svg>
  );
}

/** A four-pointed sparkle. */
function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 0 C 13 8, 16 11, 24 12 C 16 13, 13 16, 12 24 C 11 16, 8 13, 0 12 C 8 11, 11 8, 12 0 Z" />
    </svg>
  );
}

/**
 * The home page's first screen, education first (the Emerald Mint reference): "Learn by Class /
 * Class 1 to 5" beside a student, the classes as a row of the shared cards, and what the platform
 * offers. `classes`: the listed classes (empty while Kid Games is off — the row then doesn't
 * show and "Explore Classes" becomes "Explore Features").
 */
export function Hero({ featuresLink = true, classes = [] }: { featuresLink?: boolean; classes?: readonly ClassView[] }) {
  const hasClasses = classes.length > 0;
  return (
    <section
      id="home"
      className="relative overflow-hidden pb-16 sm:pb-20 lg:pb-24"
    >
      {/* The headline and the student: a full-width banner on the shared emerald surface (it follows
          the theme), its content kept to the page width. */}
      <div className="mk-panel-banner relative overflow-hidden">
          {/* Soft waves along the bottom right. */}
          <svg aria-hidden viewBox="0 0 600 200" preserveAspectRatio="none" className="pointer-events-none absolute bottom-0 right-0 h-32 w-[55%] text-accent-2">
            <path d="M0 200 C 200 190, 380 120, 600 60 L600 200 Z" fill="currentColor" opacity="0.14" />
            <path d="M120 200 C 300 190, 450 150, 600 120 L600 200 Z" fill="currentColor" opacity="0.12" />
          </svg>

          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-6 lg:px-8 lg:py-16">
            <div className="text-center lg:text-left">
              <p
                style={{ "--i": 0 } as CSSProperties}
                className="anim-rise inline-flex items-center gap-2 rounded-full border border-accent-2/40 bg-accent/10 py-1.5 pl-2 pr-4 text-sm font-semibold text-foreground"
              >
                <LayoutGrid className="h-4 w-4 text-accent-2" fill="currentColor" />
                All-in-one Learning Space
              </p>
              <h1
                style={{ "--i": 1 } as CSSProperties}
                className="anim-rise mt-5 text-[40px] font-extrabold leading-[1.08] tracking-[-0.03em] text-foreground min-[400px]:text-[46px] sm:text-[58px] lg:text-[54px] xl:text-[62px]"
              >
                <span className="block">Learn by Class</span>
                <span className="mt-2 inline-block rounded-full bg-gradient-to-r from-accent-2 to-accent px-6 py-1 text-accent-foreground shadow-[0_0_36px_-6px_var(--glow)]">
                  Class 1 to 5
                </span>
              </h1>
              <p
                style={{ "--i": 2 } as CSSProperties}
                className="anim-rise mx-auto mt-5 max-w-lg text-pretty text-base leading-relaxed text-foreground-soft sm:text-lg lg:mx-0"
              >
                Fun, engaging and structured learning for every young learner — with your photos, videos and documents kept safe
                in the same private place.
              </p>
              <div
                style={{ "--i": 3 } as CSSProperties}
                className="anim-rise mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start"
              >
                {hasClasses ? (
                  <PrimaryCta href="/#kid-games" pill className="px-7 shadow-[0_0_30px_-6px_var(--glow)]">Explore Classes</PrimaryCta>
                ) : (
                  <PrimaryCta pill className="px-7 shadow-[0_0_30px_-6px_var(--glow)]">Get Started free</PrimaryCta>
                )}
                {hasClasses ? (
                  <SecondaryCta href="/signup" pill className="border border-border-strong px-7">Create a free account</SecondaryCta>
                ) : (
                  featuresLink && <SecondaryCta href="/#features" pill className="border border-border-strong px-7">Explore Features</SecondaryCta>
                )}
              </div>
              <ul
                style={{ "--i": 4 } as CSSProperties}
                className="anim-rise mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[13px] text-foreground-soft lg:justify-start"
              >
                {TRUST.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-accent-2" strokeWidth={2.2} />
                    {label}
                  </li>
                ))}
              </ul>
            </div>

            {/* The student on a green shape, cheered on, with the subjects beside them. */}
            <div style={{ "--i": 2 } as CSSProperties} className="anim-rise-scale relative mx-auto w-full max-w-[520px]">
              <svg aria-hidden viewBox="0 0 400 400" className="pointer-events-none absolute inset-[4%] h-[92%] w-[92%]">
                <defs>
                  <linearGradient id="hero-blob" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" style={{ stopColor: "var(--accent-2)" }} />
                    <stop offset="1" style={{ stopColor: "var(--accent)" }} />
                  </linearGradient>
                </defs>
                <path
                  d="M248 30 C 330 40, 360 120, 350 190 C 340 270, 380 330, 300 370 C 220 410, 110 390, 70 320 C 30 250, 60 200, 90 150 C 130 80, 170 20, 248 30 Z"
                  fill="url(#hero-blob)"
                  opacity="0.9"
                />
              </svg>
              {/* Excitement lines by the head */}
              <svg aria-hidden viewBox="0 0 60 40" className="absolute left-[30%] top-[2%] h-10 w-14 text-[#facc15]">
                <path d="M10 30 L4 18 M28 22 L28 6 M46 30 L54 18" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
              </svg>
              <div className="relative aspect-square w-[86%]">
                <Image
                  src="/images/classes/hero-student.svg"
                  alt="A smiling student with a backpack holding a stack of books"
                  fill
                  unoptimized
                  priority
                  sizes="(min-width: 1024px) 460px, 80vw"
                  className="object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.3)]"
                />
              </div>
              <ul aria-label="Subjects" className="absolute right-0 top-1/2 hidden -translate-y-1/2 flex-col gap-3 sm:flex">
                {HERO_SUBJECTS.map(({ label, tile, mark }, i) => (
                  <li
                    key={label}
                    className={cn(
                      "mk-float flex items-center gap-3 rounded-2xl border border-accent-2/40 bg-surface-elevated/90 py-2.5 pl-2.5 pr-6 text-lg font-bold text-foreground shadow-[var(--shadow-lift)] backdrop-blur",
                      i === 1 && "-translate-x-6",
                    )}
                    style={{ animationDelay: `${i * 0.6}s` }}
                  >
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", tile)}>{mark}</span>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* The classes and what the platform offers, on one dark emerald panel (dark in both themes). */}
        <div
          style={{ "--i": 5 } as CSSProperties}
          className="anim-rise mk-panel relative mt-12 overflow-hidden rounded-[2rem] px-5 py-8 sm:px-8 sm:py-10"
        >
          {hasClasses && (
            <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
              <ul
                aria-label="Classes"
                className="-mx-5 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-2 pt-6 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] sm:overflow-visible sm:px-2 sm:pb-0"
              >
                {classes.map((c, i) => (
                  <li key={c.key} className="w-[75%] min-w-[220px] shrink-0 snap-start sm:w-auto sm:min-w-0">
                    <HeroClassCard c={c} index={i} />
                  </li>
                ))}
              </ul>
              <div aria-hidden className="relative hidden lg:block">
                <Sparkle className="absolute left-[4%] top-[38%] h-5 w-5 text-accent-2" />
                <Sparkle className="absolute right-[8%] top-[2%] h-6 w-6 text-accent-2" />
                <HeroLearnIllustration className="mx-auto w-full max-w-md" />
              </div>
            </div>
          )}

          <ul className={cn("grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4", hasClasses && "mt-10")}>
            {HERO_FEATURES.map(({ icon: Icon, label }, i) => (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-4 sm:gap-4 sm:px-6 sm:py-5",
                  i === 0
                    ? "bg-gradient-to-br from-accent-2 to-accent text-accent-foreground shadow-[0_0_30px_-6px_var(--glow)]"
                    : "border border-accent-2/25 bg-surface-elevated/60 text-foreground",
                )}
              >
                <Icon className={cn("h-7 w-7 shrink-0", i === 0 ? "text-accent-foreground" : "text-accent-2")} strokeWidth={1.9} />
                <span className="text-[15px] font-semibold leading-snug sm:text-base">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Product highlights — everything the product brings together, in one bento
 * ---------------------------------------------------------------------------------------- */

const HIGHLIGHT_POINTS = [
  "All your media in one place",
  "Easy to organise and search",
  "Preview files without downloading",
  "Private and secure by default",
] as const;

/** Rounded picture tile of the highlights collage, with a soft accent ring. */
const HL_TILE = "relative overflow-hidden rounded-2xl ring-1 ring-accent-2/40 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)]";

/**
 * One home for everything, on the shared emerald panel: the promise and a checklist on the left; on
 * the right a photo, a video, a PDF and a Word file side by side, and the library they fill
 * (decorative: the figures are an example, not anyone's account).
 */
export function Highlights() {
  return (
    <Section id="highlights" className="pt-6 sm:pt-10 lg:pt-12">
      <div className="mk-panel relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-12 lg:px-12">
        {/* A green hill rising along the bottom left. */}
        <svg aria-hidden viewBox="0 0 600 160" preserveAspectRatio="none" className="pointer-events-none absolute bottom-0 left-0 h-28 w-[60%] text-accent-2">
          <path d="M0 160 L0 120 C 150 120, 260 40, 420 60 C 500 70, 560 110, 600 160 Z" fill="currentColor" opacity="0.16" />
          <path d="M0 120 C 150 120, 260 40, 420 60 C 500 70, 560 110, 600 160" stroke="currentColor" strokeWidth="2.5" opacity="0.45" fill="none" />
        </svg>

        <div className="relative grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
          <div className="mk-reveal">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent-2/40 bg-accent/15 px-4 py-2 text-sm font-bold uppercase tracking-wide text-foreground">
              <FolderClosed className="h-4 w-4 text-accent-2" fill="currentColor" /> One home for everything
            </span>
            <h2 className="mt-5 text-[36px] font-extrabold leading-[1.08] tracking-[-0.02em] text-foreground sm:text-[48px]">
              Everything you keep,
              <br />
              <span className="text-accent-2">finally together</span>
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-foreground-soft sm:text-[17px]">
              Your photos, videos and documents share the same folders — organised, searchable and private to you.
            </p>
            <ul className="mt-7 space-y-3.5">
              {HIGHLIGHT_POINTS.map((point) => (
                <li key={point} className="flex items-center gap-3 text-[15px] text-foreground-soft">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-2 text-accent-foreground">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div aria-hidden className="mk-reveal">
            <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3 sm:gap-4">
              {/* The photo */}
              <div className={cn(HL_TILE, "row-span-2 min-h-56 ring-2 ring-white/60")}>
                <MountainSunsetArt className="absolute inset-0" />
              </div>
              {/* The video */}
              <div className={cn(HL_TILE, "aspect-[16/10]")}>
                <AuroraArt className="absolute inset-0" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white ring-2 ring-white/80 backdrop-blur">
                    <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
                  </span>
                </span>
                <span className="absolute bottom-2 right-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white">04:28</span>
              </div>
              {/* The documents */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="flex aspect-square items-center justify-center rounded-2xl border border-accent-2/30 bg-surface-elevated/80 shadow-[var(--shadow-lift)]">
                  <span className="relative flex h-[62%] w-[52%] flex-col items-center justify-end rounded-md bg-white pb-[10%] shadow-md">
                    <span className="absolute right-0 top-0 h-[24%] w-[30%] rounded-bl-md bg-[#fecaca]" />
                    <span className="rounded bg-[#dc2626] px-1.5 py-0.5 text-[10px] font-extrabold text-white sm:text-xs">PDF</span>
                  </span>
                </div>
                <div className="flex aspect-square items-center justify-center rounded-2xl border border-accent-2/30 bg-surface-elevated/80 shadow-[var(--shadow-lift)]">
                  <span className="flex h-[56%] w-[56%] items-center justify-center rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] text-2xl font-extrabold text-white shadow-md sm:text-3xl">
                    W
                  </span>
                </div>
              </div>
            </div>

            {/* The library they fill */}
            <div className="mt-3 flex items-center gap-4 rounded-2xl border border-accent-2/40 bg-surface-elevated/80 px-5 py-4 shadow-[var(--shadow-lift)] sm:mt-4">
              <CloudUpload className="h-10 w-10 shrink-0 text-accent-2" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">Your Media</p>
                <p className="mt-0.5 flex items-center justify-between text-xs text-foreground-soft">
                  <span>24.6 GB stored</span>
                  <span className="font-bold text-foreground">1,284 files</span>
                </p>
                {/* Photos, videos and documents, as shares of the library */}
                <span className="mt-2 flex h-2 overflow-hidden rounded-full bg-border">
                  <span className="h-full w-[46%] bg-accent-2" />
                  <span className="h-full w-[32%] bg-accent" />
                  <span className="h-full w-[22%] bg-accent-2/50" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Features — a single bordered matrix, one lead feature and the rest around it
 * ---------------------------------------------------------------------------------------- */

/** Everything listed here is true of the app today. */
const FEATURES: readonly { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Lock,
    title: "Private media library",
    body: "Every file belongs to one account and is checked on every request. Nobody else can open your library.",
  },
  {
    icon: FolderClosed,
    title: "Folders & organisation",
    body: "Nested folders, renaming, moving and bulk actions — plus search across everything by name.",
  },
  {
    icon: FileText,
    title: "Document management",
    body: "PDF, Word, Excel and text files beside your media. PDFs and text open right in the app.",
  },
  {
    icon: MonitorSmartphone,
    title: "Browser-based access",
    body: "Nothing to install. Use it on desktop or phone, or add it to your home screen like an app.",
  },
  {
    icon: CirclePlay,
    title: "Previews & viewer",
    body: "Thumbnails for photos and videos, a full-screen viewer and a built-in player — no downloading to take a look.",
  },
  {
    icon: Trash2,
    title: "Trash & restore",
    body: "Deleted files and folders go to Trash first. Restore them any time, or remove them for good.",
  },
];

/** Each small tile's own tilt, so the ring looks scattered rather than drawn with a compass. */
const FEATURE_TILE_TILT = ["-6deg", "8deg", "-8deg", "6deg", "5deg"] as const;

/**
 * The big folder with the other features' icons round it (decorative), always gently moving
 * (globals.css, "Features illustration"): the tiles orbit the folder — each turning back the other
 * way, so it stays upright — and pop in turn, the folder bobs and the rings ripple outwards.
 * Still for anyone who asked for reduced motion.
 */
function FeaturesIllustration() {
  const around = FEATURES.filter((f) => f.icon !== FolderClosed);
  return (
    <div aria-hidden className="relative mx-auto aspect-square w-full max-w-[340px]">
      {/* Rings, rippling outwards in turn */}
      {[0, 1, 2].map((i) => (
        <span key={i} className="mk-ripple absolute inset-[8%] rounded-full border border-accent-2/30" style={{ animationDelay: `${i * 1.6}s` }} />
      ))}
      <span className="absolute inset-[18%] rounded-full border border-accent-2/15" />
      <span className="mk-glow-pulse absolute inset-[22%] rounded-full bg-[radial-gradient(circle,var(--glow),transparent_70%)]" />

      {/* The folder, bobbing */}
      <span className="mk-bob absolute inset-0 flex items-center justify-center">
        <span className="flex h-[38%] w-[38%] rotate-[-4deg] items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-accent-2 to-accent text-accent-foreground shadow-[0_24px_40px_-14px_var(--glow),0_10px_0_-2px_color-mix(in_srgb,var(--accent)_60%,black)]">
          <FolderClosed className="h-1/2 w-1/2" strokeWidth={1.6} />
        </span>
      </span>

      {/* The tiles, evenly round a circle, orbiting */}
      <div className="mk-orbit absolute inset-0">
        {around.map(({ icon: Icon, title }, i) => {
          const angle = (i / around.length) * 2 * Math.PI - Math.PI / 2;
          const left = 50 + 38 * Math.cos(angle) - 10.5;
          const top = 50 + 38 * Math.sin(angle) - 10.5;
          return (
            <span key={title} className="absolute h-[21%] w-[21%]" style={{ left: `${left}%`, top: `${top}%` }}>
              <span
                className="mk-orbit-tile flex h-full w-full items-center justify-center rounded-2xl border border-border bg-surface-elevated text-accent shadow-[var(--shadow-lift)]"
                style={{ transform: `rotate(${FEATURE_TILE_TILT[i % FEATURE_TILE_TILT.length]})`, animationDelay: `0s, ${i * 0.7}s` }}
              >
                <Icon className="h-1/2 w-1/2" strokeWidth={2} />
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Features, on the shared emerald panel (it follows the theme): the heading and a way on, the
 * features round a folder, and the list of them — each opens to say what it means, one at a time
 * (`name` makes the rows an exclusive accordion).
 */
export function Features() {
  return (
    <Section id="features">
      <div className="mk-panel relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-12 lg:px-10">
        <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)] lg:gap-8">
          <div className="mk-reveal">
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-accent">
              <span aria-hidden className="h-0.5 w-5 rounded-full bg-accent" /> Features
            </p>
            <h2 className="mt-4 text-[32px] font-extrabold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-[40px]">
              Built for the way you <span className="text-accent">actually keep things</span>
            </h2>
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-foreground-soft">
              media_tool brings your files together — organised, searchable and private to you, with nothing to install.
            </p>
            <Link
              href="/#media"
              className={cn(
                "mt-7 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-accent to-accent-hover px-6 py-3 text-[15px] font-semibold text-accent-foreground shadow-[0_12px_24px_-10px_var(--glow)] transition-transform hover:-translate-y-0.5",
                focusRing,
              )}
            >
              Explore Features <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mk-reveal hidden sm:block">
            <FeaturesIllustration />
          </div>

          <ul className="mk-reveal space-y-2.5">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <details name="features" className="group rounded-xl border border-border bg-surface-elevated shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)] open:border-border-strong">
                  <summary
                    className={cn(
                      "flex cursor-pointer list-none items-center gap-3.5 rounded-xl px-4 py-3 text-[15px] font-semibold text-foreground transition-colors hover:text-accent [&::-webkit-details-marker]:hidden",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60",
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0 text-accent" strokeWidth={2} />
                    <span className="flex-1">{title}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-foreground-soft transition-transform duration-300 group-open:rotate-90 group-open:text-accent" />
                  </summary>
                  <p className="mk-faq-answer px-4 pb-3.5 pl-[2.9rem] text-sm leading-relaxed text-muted">{body}</p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Media and Documents
 * ---------------------------------------------------------------------------------------- */

const MEDIA_POINTS = [
  "JPEG, PNG, WebP, GIF and HEIC photos; MP4, MOV, WebM and MKV videos",
  "Drag-and-drop uploads with live progress for every file",
  "Full-screen image viewer and built-in video player",
  "Select many at once to move, delete or download",
] as const;

/** One corner of the collage's frame: an L-shaped bracket. */
function FrameCorner({ className }: { className: string }) {
  return <span aria-hidden className={cn("pointer-events-none absolute h-10 w-10 sm:h-12 sm:w-12", className)} style={{ borderColor: "color-mix(in srgb, var(--accent-2) 85%, transparent)" }} />;
}

/**
 * Media: a dark green panel in both themes (like the footer, the brand's own surface) — the copy and
 * a checklist on the left, a framed photo collage with an upload in progress on the right.
 */
export function MediaSection() {
  return (
    <Section id="media" className="overflow-hidden">
      <div className="mk-panel relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
        <div className="relative grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
          <div className="mk-reveal">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent-2/40 bg-accent/15 px-4 py-2 text-sm font-bold tracking-wide text-foreground">
              <LayoutGrid className="h-4 w-4 text-accent-2" fill="currentColor" /> MEDIA
            </span>
            <h2 className="mt-5 text-[36px] font-extrabold leading-[1.08] tracking-[-0.02em] text-foreground sm:text-[48px]">
              Photos and videos,
              <br />
              <span className="text-accent-2">beautifully kept</span>
            </h2>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-foreground-soft sm:text-[17px]">
              Drop in a batch of files and media_tool takes care of the rest — thumbnails for your photos, poster frames for your
              videos, and one gallery for all of it.
            </p>
            <ul className="mt-7 space-y-3.5">
              {MEDIA_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3 text-[15px] text-foreground-soft">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-2 text-accent-foreground">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div aria-hidden className="mk-reveal relative px-4 pb-14 pt-4 sm:px-6 sm:pb-12 sm:pt-6">
            <FrameCorner className="left-0 top-0 rounded-tl-2xl border-l-[3px] border-t-[3px]" />
            <FrameCorner className="right-0 top-0 rounded-tr-2xl border-r-[3px] border-t-[3px]" />
            <FrameCorner className="bottom-6 left-0 rounded-bl-2xl border-b-[3px] border-l-[3px]" />
            <FrameCorner className="bottom-6 right-0 rounded-br-2xl border-b-[3px] border-r-[3px]" />

            <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] grid-rows-[auto_auto] gap-3 sm:gap-4">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl ring-2 ring-white/70 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.7)]">
                <MountainSunsetArt />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white ring-2 ring-white/80 backdrop-blur sm:h-16 sm:w-16">
                    <Play className="ml-1 h-6 w-6 sm:h-7 sm:w-7" fill="currentColor" />
                  </span>
                </span>
              </div>
              <div className="relative overflow-hidden rounded-2xl ring-1 ring-accent-2/50 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.7)]">
                <WaterfallArt className="absolute inset-0" />
              </div>
              <div className="aspect-[16/7] overflow-hidden rounded-2xl ring-1 ring-accent-2/50 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.7)]">
                <GreenHillsArt />
              </div>
              <div className="relative overflow-hidden rounded-2xl ring-1 ring-[#c084fc]/50 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.7)]">
                <NightSkyArt className="absolute inset-0" />
              </div>
            </div>

            {/* The upload in progress, overlapping the bottom of the collage. */}
            <div className="absolute bottom-0 right-6 flex w-[min(78%,22rem)] items-center gap-4 rounded-2xl border border-accent-2/50 bg-surface-elevated/90 px-5 py-4 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur sm:right-10">
              <CloudUpload className="h-9 w-9 shrink-0 text-accent-2" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center justify-between text-sm font-semibold text-foreground">
                  <span>Uploading files...</span>
                  <span>68%</span>
                </p>
                <span className="mt-2.5 block h-2 overflow-hidden rounded-full bg-border">
                  <span className="block h-full w-[68%] rounded-full bg-linear-to-r from-accent to-accent-2" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/** What documents get, in the words of the checklist — every one true of the app. */
const DOC_POINTS = ["Preview in place", "Filed with everything else", "Find it fast", "Undo mistakes"] as const;

/** The mock library's sidebar: the file-type filters, All Files selected. */
const DOC_FILTERS: readonly { icon: LucideIcon; label: string }[] = [
  { icon: Files, label: "All Files" },
  { icon: FileText, label: "PDFs" },
  { icon: FileText, label: "Word" },
  { icon: FileSpreadsheet, label: "Excel" },
  { icon: FileIcon, label: "Text" },
  { icon: Trash2, label: "Trash" },
];

const DOC_ROWS = [
  { icon: FileText, color: "#dc2626", name: "Rental agreement.pdf", kind: "PDF", meta: "2.1 MB" },
  { icon: FileText, color: "#2563eb", name: "Cover letter.docx", kind: "DOCX", meta: "48 KB" },
  { icon: FileSpreadsheet, color: "#16a34a", name: "Monthly budget.xlsx", kind: "XLSX", meta: "96 KB" },
  { icon: FileIcon, color: "#6b7280", name: "Packing list.txt", kind: "TXT", meta: "2 KB" },
] as const;

/** A laptop showing the Documents library (decorative: names and sizes are examples). */
function DocsLaptop() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[600px] lg:[transform:perspective(1800px)_rotateY(-10deg)]">
      {/* Lid: aluminium edge, black bezel, the screen. */}
      <div className="rounded-t-[1.4rem] bg-gradient-to-b from-[#e5e7eb] to-[#9ca3af] p-[3px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]">
        <div className="rounded-t-[1.25rem] bg-[#0a0f0d] p-2.5 sm:p-3.5">
          <div className="aspect-[16/10] overflow-hidden rounded-lg bg-[linear-gradient(160deg,#0f2a20,#0a1a14)] text-white">
            {/* Top bar */}
            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3 sm:px-5 sm:pt-4">
              <span className="flex items-center gap-2 text-sm font-bold sm:text-base">
                <FolderClosed className="h-4 w-4 text-[#4ade80] sm:h-5 sm:w-5" /> Documents
              </span>
              <span className="flex w-2/5 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[9px] text-white/50 sm:text-[11px]">
                <Search className="h-3 w-3" /> Search files...
              </span>
            </div>
            <div className="grid h-[calc(100%-3.25rem)] grid-cols-[30%_1fr] gap-2 px-2 pb-2 sm:gap-3 sm:px-3 sm:pb-3">
              {/* Sidebar */}
              <ul className="space-y-0.5 rounded-lg border border-white/5 bg-white/[0.03] p-1.5 sm:space-y-1 sm:p-2">
                {DOC_FILTERS.map(({ icon: Icon, label }, i) => (
                  <li
                    key={label}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2 py-1 text-[9px] font-medium sm:gap-2 sm:py-1.5 sm:text-[11px]",
                      i === 0 ? "bg-gradient-to-r from-[#22c55e] to-[#4ade80] text-[#052e16]" : "text-white/75",
                    )}
                  >
                    <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> {label}
                  </li>
                ))}
              </ul>
              {/* Files */}
              <ul className="space-y-1.5 sm:space-y-2">
                {DOC_ROWS.map(({ icon: Icon, color, name, kind, meta }) => (
                  <li key={name} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.04] px-2 py-1.5 sm:gap-3 sm:px-3 sm:py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white sm:h-8 sm:w-8" style={{ backgroundColor: color }}>
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[9px] font-semibold sm:text-xs">{name}</span>
                      <span className="block text-[8px] text-white/50 sm:text-[10px]">{meta}</span>
                    </span>
                    <span className="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[8px] font-bold text-white/85 sm:text-[10px]">{kind}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      {/* Base: the hinge, the deck and its thumb notch. */}
      <div className="relative -mx-[7%] h-3 rounded-b-[1.2rem] bg-gradient-to-b from-[#f3f4f6] via-[#d1d5db] to-[#6b7280] shadow-[0_18px_30px_-10px_rgba(0,0,0,0.8)] sm:h-4">
        <span className="absolute left-1/2 top-0 h-1.5 w-1/5 -translate-x-1/2 rounded-b-lg bg-[#9ca3af]" />
      </div>
    </div>
  );
}

/**
 * Documents: a dark emerald panel in both themes (like Media) — the copy and a checklist on the
 * left, the Documents library on a laptop on the right.
 */
export function DocumentsSection() {
  return (
    <Section>
      <div className="mk-panel relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
        {/* A soft green wave along the bottom right. */}
        <svg aria-hidden viewBox="0 0 800 160" preserveAspectRatio="none" className="pointer-events-none absolute bottom-0 right-0 h-28 w-[70%] text-accent-2">
          <path d="M0 160 C 250 150, 450 60, 800 40 L800 160 Z" fill="currentColor" opacity="0.18" />
          <path d="M120 160 C 350 150, 550 100, 800 90 L800 160 Z" fill="currentColor" opacity="0.14" />
        </svg>

        <div className="relative grid items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
          <div className="mk-reveal">
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-accent-2">
              <span aria-hidden className="h-0.5 w-5 rounded-full bg-accent-2" /> Documents
            </p>
            <h2 className="mt-4 text-[36px] font-extrabold leading-[1.08] tracking-[-0.02em] text-foreground sm:text-[48px]">
              Your paperwork,
              <br />
              <span className="text-accent-2">finally in order</span>
            </h2>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-foreground-soft sm:text-[17px]">
              Keep PDFs, Word documents, Excel spreadsheets and plain-text files right next to the photos and videos they belong
              with.
            </p>
            <ul className="mt-7 space-y-4">
              {DOC_POINTS.map((point) => (
                <li key={point} className="flex items-center gap-3 text-base font-semibold text-foreground">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-2 text-accent-foreground">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="mk-reveal px-[4%]">
            <DocsLaptop />
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Games — the catalogue as the administrator lists it
 * ---------------------------------------------------------------------------------------- */

function GameArt({ game, large = false }: { game: GameMeta; large?: boolean }) {
  const Icon = game.icon;
  return (
    <div
      aria-hidden
      className={cn(
        "relative flex items-center justify-center overflow-hidden",
        large ? "h-48 sm:h-60" : "h-28",
      )}
      style={{
        backgroundImage: `linear-gradient(135deg, ${game.colors[0]}, ${game.colors[1]})`,
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.38),transparent_55%)]" />
      <div className="mk-dots absolute inset-0 opacity-30" />
      <Icon
        className={cn(
          "relative text-white drop-shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110",
          large ? "h-24 w-24" : "h-12 w-12",
        )}
        strokeWidth={1.5}
      />
    </div>
  );
}

export function GamesSection({ games }: { games: readonly GameMeta[] }) {
  if (games.length === 0) return null;
  const [lead, ...rest] = games;
  const tiles = rest.slice(0, 4);
  const more = rest.slice(4);
  return (
    <Section id="games" className="overflow-hidden">
      <div
        aria-hidden
        className="mk-games-glow pointer-events-none absolute inset-0"
      />
      <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Games"
            title={
              <>
                Take a break <Highlight>without leaving</Highlight>
              </>
            }
            description={`A small arcade built into your library — ${games.length} ${games.length === 1 ? "game" : "games"} that run right in the browser. No downloads, no extra accounts.`}
          />
          <ul className="mk-reveal mt-8 space-y-3 text-[15px] text-foreground-soft">
            {[
              {
                icon: Gamepad2,
                text: "Classics, puzzles and quick reflex games",
              },
              // Only while Ludo itself is listed.
              ...(games.some((g) => g.slug === "ludo")
                ? [
                    {
                      icon: UserPlus,
                      text: "Ludo for 2–4 players on one device",
                    },
                    {
                      icon: Timer,
                      text: "Computer opponents at Easy, Medium and Hard",
                    },
                  ]
                : []),
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-[#f472b6]" />
                {text}
              </li>
            ))}
          </ul>
          <div className="mk-reveal mt-9">
            <PrimaryCta href={`${LOGIN_PATH}?from=/games`}>
              Sign in to play
            </PrimaryCta>
          </div>
        </div>

        <div className="mk-reveal grid gap-4 sm:grid-cols-2">
          <article className="mk-card card-lift group overflow-hidden rounded-3xl sm:col-span-2">
            <GameArt game={lead} large />
            <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  {lead.name}
                </h3>
                <p className="mt-1 text-sm text-muted">{lead.description}</p>
              </div>
              <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                {lead.category}
              </span>
            </div>
          </article>
          {tiles.map((game) => (
            <article
              key={game.slug}
              className="mk-card card-lift group overflow-hidden rounded-2xl"
            >
              <GameArt game={game} />
              <div className="p-4">
                <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                  {game.name}
                </h3>
                <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">
                  {game.description}
                </p>
              </div>
            </article>
          ))}
          {more.length > 0 && (
            <p className="text-center text-sm text-muted sm:col-span-2">
              Plus{" "}
              <span className="font-medium text-foreground-soft">
                {more
                  .map((g) => g.name)
                  .join(", ")
                  .replace(/, ([^,]*)$/, " and $1")}
              </span>
              .
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Kid Games — classes and subjects as the administrator has them switched on
 * ---------------------------------------------------------------------------------------- */

const KID_POINTS: readonly { icon: LucideIcon; title: string; body: string }[] =
  [
    {
      icon: Star,
      title: "XP and stars",
      body: "Up to three stars a game, with bonuses for perfect rounds and new bests.",
    },
    {
      icon: Flame,
      title: "Daily streaks",
      body: "Streaks, achievements and per-subject progress are saved to the account.",
    },
    {
      icon: Trophy,
      title: "High scores",
      body: "Best scores are kept for every game — always a record to beat.",
    },
  ];

/** "Classes 1–5", or "Class 3" when there is just one. */
function classRange(classes: readonly ClassView[]): string {
  const levels = classes.map((c) => c.level);
  return levels.length > 1
    ? `Classes ${Math.min(...levels)}–${Math.max(...levels)}`
    : `Class ${levels[0]}`;
}

/** A class in the Kid Games block: how many of its games are on the home page, and its own subjects. */
export interface KidClassSummary extends ClassView {
  games: number;
  /** This class's subjects (titles) — never another class's. */
  subjects: string[];
}

export function KidGamesSection({
  classes,
  totalGames,
}: {
  classes: readonly KidClassSummary[];
  totalGames: number;
}) {
  if (classes.length === 0) return null;
  const range = classRange(classes);
  return (
    <Section id="kid-games-intro" className="px-3 sm:px-6 lg:px-8">
      <div className="mk-kid-panel relative overflow-hidden rounded-[2rem] px-5 py-14 sm:rounded-[2.5rem] sm:px-10 sm:py-16 lg:px-14 lg:py-20">
        <div
          aria-hidden
          className="mk-kid-glow pointer-events-none absolute inset-0"
        />
        <div className="relative grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-14">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Kid Games"
              title={
                <>
                  Learning that feels like{" "}
                  <span className="bg-linear-to-r from-[#fbbf24] via-[#f472b6] to-[#34d399] bg-clip-text text-transparent">
                    play
                  </span>
                </>
              }
              description={`${totalGames > 0 ? `${totalGames} learning games` : "Learning games"} for ${range} — choose your class, then one of its subjects: matching, sorting, memory and number games built around each class.`}
            />
            <div className="mt-8 grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
              {KID_POINTS.map((point) => (
                <div key={point.title} className="mk-reveal flex gap-3.5">
                  <IconTile
                    icon={point.icon}
                    color="#fbbf24"
                    className="h-9 w-9"
                  />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {point.title}
                    </h3>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                      {point.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mk-reveal mt-9">
              <PrimaryCta href={`${LOGIN_PATH}?from=/kid-games`}>
                Sign in to start learning
              </PrimaryCta>
            </div>
          </div>

          <div className="mk-reveal space-y-4">
            {/* Class first: each class with its own subjects, opening that class's games. */}
            <ul aria-label="Choose your class" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {classes.map((c, i) => (
                <li key={c.key} style={{ ...classVars(c.level), "--i": i } as CSSProperties} className="anim-rise">
                  <Link
                    href={`${LOGIN_PATH}?from=/kid-games/${c.key}`}
                    className="card-lift group flex h-full flex-col gap-3 rounded-3xl border border-(--kg)/35 p-4 transition hover:border-(--kg)"
                    style={{ backgroundImage: "linear-gradient(160deg, color-mix(in srgb, var(--kg) 20%, var(--mk-panel)), var(--mk-panel) 75%)" }}
                  >
                    <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-2xl bg-linear-to-br from-(--kg) to-(--kg-2) text-base font-bold text-white">
                      {c.level}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-semibold text-foreground">{c.title}</span>
                      <span className="mt-0.5 block text-[13px] text-muted">
                        {c.games} {c.games === 1 ? "game" : "games"}
                      </span>
                      {c.subjects.length > 0 && <span className="mt-1 block truncate text-xs text-foreground-soft">{c.subjects.join(" · ")}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {/* A finished round, as the app shows it */}
            <div
              aria-hidden
              className="flex items-center gap-4 rounded-2xl border border-(--mk-hairline) bg-(--mk-sunken) p-4 backdrop-blur"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-[#fbbf24] to-[#f97316] text-white shadow-[0_8px_20px_-8px_#f97316]">
                <Trophy className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Round complete!
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full w-4/5 rounded-full bg-linear-to-r from-[#fbbf24] to-[#f472b6]" />
                </div>
              </div>
              <span className="flex shrink-0 gap-0.5 text-[#fbbf24]">
                {[0, 1, 2].map((i) => (
                  <Star key={i} className="h-4 w-4" fill="currentColor" />
                ))}
              </span>
            </div>
          </div>
        </div>

      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Learn by Class — the same class cards as the app, from the same catalog
 * ---------------------------------------------------------------------------------------- */

export interface LandingClass extends ClassView {
  /** Games and subjects the class offers (counted from the catalog, never invented). */
  games: number;
  subjects: number;
  /** Chapters (courses) the class offers, and its subjects' marks for a picture-free card. */
  chapters?: number;
  marks?: string[];
}

export function LearnByClassSection({ classes, kidGamesOn, status = 'ready', retryHref = '/#kid-games' }: { classes: readonly LandingClass[]; kidGamesOn: boolean; status?: 'ready' | 'error'; retryHref?: string }) {
  return (
    // #kid-games: the header's "Kid Games" link lands on these classes.
    <Section id="kid-games">
      <SectionHeading
        eyebrow="Courses"
        title={
          <>
            Choose Your <Highlight>Class</Highlight>
          </>
        }
        description="Pick your class first — then only that class's subjects appear. Each opens its chapters, lessons and questions."
      />
      {status === 'error' ? (
        <div className="mx-auto mt-12 max-w-md rounded-3xl border border-border bg-surface/70 p-8 text-center shadow-card sm:mt-14">
          <p className="text-base font-semibold text-foreground">Unable to load classes</p>
          <p className="mt-1.5 text-sm text-muted">Please try again in a moment.</p>
          <a href={retryHref} className="btn-primary mt-5 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold text-accent-foreground">
            Try Again
          </a>
        </div>
      ) : (
        <div className="mt-12 sm:mt-14">
          {/* Class first, then only that class's subjects (the choice is kept in the address: ?class=class-7). */}
          <Suspense fallback={<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{classes.map((c) => <div key={c.key} className="h-[4.5rem] animate-pulse rounded-2xl border border-border bg-surface-hover" />)}</div>}>
            <ClassSubjectPicker classes={classes} kidGamesOn={kidGamesOn} idPrefix="landing" />
          </Suspense>
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * How it works
 * ---------------------------------------------------------------------------------------- */

const STEPS: readonly { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: UserPlus,
    title: "Create your account",
    body: "Sign up in a minute and start on the Free plan — no card needed.",
  },
  {
    icon: LibraryBig,
    title: "Organise your library",
    body: "Upload photos, videos and documents, then file them into folders that make sense to you.",
  },
  {
    icon: Sparkles,
    title: "Open it anywhere",
    body: "Your library is waiting in any browser you sign in from — on your desktop, tablet or phone.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeading
        eyebrow="How it works"
        title={
          <>
            Up and running in <Highlight>three steps</Highlight>
          </>
        }
      />
      <ol className="relative mt-16 grid gap-10 md:grid-cols-3 md:gap-6">
        {/* The line that joins the steps (desktop) */}
        <div
          aria-hidden
          className="mk-step-line pointer-events-none absolute left-[16.5%] right-[16.5%] top-7 hidden h-px md:block"
        />
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="mk-reveal relative flex flex-col items-center text-center"
          >
            <span className="mk-step relative flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-semibold text-foreground">
              <span className="mk-text-gradient">
                {String(i + 1).padStart(2, "0")}
              </span>
            </span>
            <div className="mt-7 flex items-center gap-2 text-accent-2">
              <step.icon className="h-4 w-4" />
            </div>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
              {step.title}
            </h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Security and privacy — only what the app really does
 * ---------------------------------------------------------------------------------------- */

const SECURITY: readonly { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Lock,
    title: "Private by default",
    body: "Every file belongs to one account, and the server checks ownership on every request.",
  },
  {
    icon: ShieldCheck,
    title: "Short-lived file links",
    body: "Files are delivered through signed links that expire — never public URLs.",
  },
  {
    icon: KeyRound,
    title: "Hashed passwords",
    body: "Passwords are stored only as salted hashes; reset codes are hashed too.",
  },
  {
    icon: LogIn,
    title: "Protected sign-in",
    body: "HTTP-only session cookies, and limits on sign-in and code attempts.",
  },
  {
    icon: RotateCcw,
    title: "Sign out everywhere",
    body: "Changing or resetting your password signs out your other devices.",
  },
  {
    icon: Trash2,
    title: "Recoverable deletes",
    body: "Deleted items wait in Trash, so a mistake can be undone.",
  },
];

export function SecuritySection() {
  return (
    <Section id="security" className="mk-band">
      <div className="grid gap-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <SectionHeading
            align="left"
            eyebrow="Security & privacy"
            title={
              <>
                Your library is <Highlight>yours alone</Highlight>
              </>
            }
            description="No public galleries, no shared links you didn't create. Administrators can see how much space an account uses — never the files themselves."
          />
          <div aria-hidden className="mk-reveal mt-10 hidden lg:block">
            <div className="mk-shield relative flex h-40 w-40 items-center justify-center rounded-[2rem]">
              <ShieldCheck
                className="h-16 w-16 text-accent-2"
                strokeWidth={1.3}
              />
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {SECURITY.map((item) => (
            <article
              key={item.title}
              className="mk-reveal mk-card card-lift rounded-2xl p-6"
            >
              <IconTile
                icon={item.icon}
                color="#34d399"
                className="h-10 w-10"
              />
              <h3 className="mt-5 text-base font-semibold text-foreground">
                {item.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Pricing (shown only if an administrator switches the section on; off by default)
 * ---------------------------------------------------------------------------------------- */

export function Pricing() {
  return (
    <Section id="pricing" className="mk-band">
      <SectionHeading
        eyebrow="Pricing"
        title="Simple, transparent pricing"
        description="Start free — no card needed. Pro and Premium can be reserved now; online payments open soon, and nothing is charged until then."
      />
      <div className="mk-reveal mt-14">
        <PricingCards mode="marketing" />
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * FAQ
 * ---------------------------------------------------------------------------------------- */

/** Every answer describes what the app does today — nothing planned or assumed. */
export const FAQ_ITEMS: readonly { q: string; a: string; icon: LucideIcon }[] = [
  {
    q: "What kinds of files can I store?",
    a: "Photos (JPEG, PNG, WebP, GIF, HEIC/HEIF), videos (MP4, MOV, WebM, MKV) and documents (PDF, Word .doc/.docx, Excel .xls/.xlsx and plain text). Files are checked when they are uploaded, so a file that isn’t really one of these types is refused.",
    icon: FolderClosed,
  },
  {
    q: "Who can see my files?",
    a: "Only you. Every library is private to its account, and files are delivered through short-lived signed links rather than public URLs. Administrators can see how many files an account holds and how much space it uses, but not the files themselves.",
    icon: Users,
  },
  {
    q: "How do I organise everything?",
    a: "Create folders inside folders, then rename, move and delete files individually or select several at once. Search finds folders and files by name from anywhere in the app.",
    icon: Layers,
  },
  {
    q: "What happens if I delete something by mistake?",
    a: "Deleted files and folders go to Trash first. You can restore them from there, and they are only removed for good when you delete them from Trash.",
    icon: Trash2,
  },
  {
    q: "Can I open documents without downloading them?",
    a: "Yes for PDFs and plain-text files, which preview inside the app. Word and Excel files can be stored, organised and downloaded to open in your usual software.",
    icon: FileText,
  },
  {
    q: "Are there games too?",
    a: "Yes — signed-in accounts include browser games for a quick break and Kid Games, learning games for younger children with stars, streaks and saved progress. Sign in, then open Games or Kid Games from your dashboard.",
    icon: Gamepad2,
  },
  {
    q: "Do I need to install anything?",
    a: "No. media_tool runs in any modern browser on desktop or mobile. If you like, you can also install it to your phone or computer’s home screen so it opens like an app.",
    icon: MonitorSmartphone,
  },
  {
    q: "I forgot my password. What now?",
    a: "Choose “Forgot password?” on the sign-in page and enter your email. We’ll send a 4-digit code; enter it and choose a new password. Resetting signs you out on your other devices.",
    icon: KeyRound,
  },
  {
    q: "Does it cost anything?",
    a: "The Free plan costs nothing and includes everything described on this page — no card needed. Pro (₹49/month) and Premium (₹119/month) can be reserved, but online payments aren’t live yet, so nothing is charged and they aren’t activated until payment is completed.",
    icon: Wallet,
  },
];

/** A laptop showing a question mark, between two plants, with a stack of books (decorative). */
function FaqIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 200" className={className} aria-hidden fill="none">
      <defs>
        <linearGradient id="faq-screen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22c55e" />
          <stop offset="1" stopColor="#15803d" />
        </linearGradient>
        <linearGradient id="faq-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e5e7eb" />
          <stop offset="1" stopColor="#9ca3af" />
        </linearGradient>
        <linearGradient id="faq-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#86efac" />
          <stop offset="1" stopColor="#16a34a" />
        </linearGradient>
        <radialGradient id="faq-shadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#16a34a" stopOpacity="0.3" />
          <stop offset="1" stopColor="#16a34a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="160" cy="186" rx="150" ry="14" fill="url(#faq-shadow)" />

      {/* Left plant */}
      <g>
        <path d="M58 182 C 56 150, 52 120, 40 92" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M40 92 C 22 96, 14 116, 20 128 C 34 124, 44 108, 40 92 Z" fill="url(#faq-leaf)" />
        <path d="M46 118 C 64 104, 82 110, 86 122 C 72 132, 54 130, 46 118 Z" fill="url(#faq-leaf)" />
        <path d="M50 140 C 30 136, 14 148, 14 160 C 30 164, 46 156, 50 140 Z" fill="url(#faq-leaf)" />
        <path d="M54 156 C 70 146, 88 152, 90 164 C 76 172, 60 170, 54 156 Z" fill="url(#faq-leaf)" />
        <path d="M40 92 C 44 76, 58 68, 70 70 C 68 84, 54 94, 40 92 Z" fill="url(#faq-leaf)" />
      </g>

      {/* Laptop */}
      <path d="M92 52 Q92 44 100 44 L212 44 Q220 44 220 52 L220 150 L92 150 Z" fill="#d1d5db" />
      <rect x="99" y="51" width="114" height="92" rx="4" fill="url(#faq-screen)" />
      <text x="156" y="118" textAnchor="middle" fontSize="54" fontWeight="800" fill="#ffffff" fontFamily="system-ui, sans-serif">?</text>
      <path d="M70 150 L242 150 L256 172 Q256 176 252 176 L60 176 Q56 176 56 172 Z" fill="url(#faq-body)" />
      <path d="M92 156 L220 156 L226 166 L86 166 Z" fill="#6b7280" opacity="0.55" />
      <rect x="138" y="168" width="36" height="4" rx="2" fill="#6b7280" opacity="0.5" />

      {/* Books */}
      <rect x="226" y="160" width="62" height="16" rx="3" fill="#15803d" />
      <rect x="230" y="163" width="56" height="4" rx="1" fill="#f0fdf4" opacity="0.9" />
      <rect x="230" y="146" width="56" height="14" rx="3" fill="#0ea5e9" />
      <rect x="234" y="149" width="50" height="3" rx="1" fill="#f0fdf4" opacity="0.9" />
      <rect x="234" y="132" width="50" height="14" rx="3" fill="#d6b98c" />
      <rect x="238" y="135" width="44" height="3" rx="1" fill="#fffbeb" opacity="0.9" />

      {/* Right plant, behind the books */}
      <g>
        <path d="M262 132 C 262 108, 266 84, 276 62" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M276 62 C 292 64, 302 82, 298 96 C 284 94, 274 80, 276 62 Z" fill="url(#faq-leaf)" />
        <path d="M268 88 C 252 76, 236 82, 232 94 C 246 104, 262 100, 268 88 Z" fill="url(#faq-leaf)" />
        <path d="M266 108 C 284 102, 300 112, 302 124 C 288 130, 272 124, 266 108 Z" fill="url(#faq-leaf)" />
        <path d="M264 120 C 248 112, 234 118, 232 128 C 244 136, 258 132, 264 120 Z" fill="url(#faq-leaf)" />
      </g>
    </svg>
  );
}

export function Faq({ contactLink = true }: { contactLink?: boolean }) {
  return (
    <Section id="faq">
      <div className="mk-panel relative overflow-hidden rounded-[2rem] px-5 py-10 sm:px-10 sm:py-12 lg:px-12">
        {/* Soft green waves along the bottom. */}
        <svg aria-hidden viewBox="0 0 1200 120" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full text-accent-2">
          <path d="M0 80 C 250 40, 450 120, 700 80 S 1050 40, 1200 70 L1200 120 L0 120 Z" fill="currentColor" opacity="0.10" />
          <path d="M0 100 C 300 70, 500 125, 800 95 S 1100 80, 1200 95 L1200 120 L0 120 Z" fill="currentColor" opacity="0.10" />
        </svg>

        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
        <div className="mk-reveal lg:pt-2">
          <span className="inline-flex rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground shadow-[var(--shadow-card)]">FAQ</span>
          <h2 className="mt-5 text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-[56px]">
            Questions,
            <br />
            <span className="text-accent-2">Answered</span>
          </h2>
          <p className="mt-5 max-w-xs text-lg leading-relaxed text-foreground-soft">The short version of how media_tool works.</p>
          {contactLink && (
            <p className="mt-4 text-sm text-muted">
              Still wondering?{" "}
              <Link
                href="/contact"
                className={cn(
                  "rounded font-semibold text-accent-2 underline-offset-4 hover:underline",
                  focusRing,
                )}
              >
                Get in touch
              </Link>
            </p>
          )}
          <FaqIllustration className="mt-8 hidden w-full max-w-sm sm:block" />
        </div>
        <div className="space-y-3.5">
          {FAQ_ITEMS.map(({ q, a, icon: Icon }) => (
            <details
              key={q}
              className="group rounded-2xl border border-border bg-surface-elevated shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)] open:border-border-strong"
            >
              <summary
                className={cn(
                  "flex cursor-pointer list-none items-center gap-4 rounded-2xl px-5 py-4 text-left text-[15px] font-semibold text-foreground transition-colors hover:text-accent-2 sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60",
                )}
              >
                <Icon className="h-6 w-6 shrink-0 text-accent" strokeWidth={1.75} />
                <span className="flex-1">{q}</span>
                <ChevronDown className="h-5 w-5 shrink-0 text-foreground-soft transition-transform duration-300 group-open:rotate-180 group-open:text-accent-2" />
              </summary>
              <p className="mk-faq-answer px-5 pb-5 pl-[3.75rem] text-sm leading-relaxed text-muted sm:px-6 sm:pl-[4.25rem]">{a}</p>
            </details>
          ))}
        </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Final call to action
 * ---------------------------------------------------------------------------------------- */

export function FinalCta() {
  return (
    <Section className="pt-6 sm:pt-8">
      <div className="mk-reveal mk-cta relative overflow-hidden rounded-[2rem] px-6 py-16 text-center sm:rounded-[2.5rem] sm:px-12 sm:py-24">
        <div
          aria-hidden
          className="mk-cta-glow mk-drift pointer-events-none absolute -inset-[6%]"
        />
        <div
          aria-hidden
          className="mk-grid pointer-events-none absolute inset-0 opacity-60"
        />
        <div className="relative mx-auto max-w-2xl">
          <Eyebrow className="justify-center">Get started</Eyebrow>
          <h2 className="mt-5 text-balance text-[34px] font-semibold leading-[1.08] tracking-[-0.025em] text-foreground sm:text-[52px]">
            Bring your digital world <Highlight>together today</Highlight>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-foreground-soft sm:text-[17px]">
            Create a free account and keep your photos, videos, documents and
            games in one private place.
          </p>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <PrimaryCta className="sm:min-w-48">Get Started free</PrimaryCta>
            <Link
              href={LOGIN_PATH}
              className={cn(
                "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-foreground-soft transition hover:text-foreground",
                focusRing,
              )}
            >
              I already have an account <MoveRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-subtle">
            <Lock className="h-3.5 w-3.5" /> Private by default · No card
            required
          </p>
        </div>
      </div>
    </Section>
  );
}
