import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Flame,
  FolderClosed,
  FolderTree,
  Gamepad2,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  Lock,
  MonitorSmartphone,
  MoveRight,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Upload,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { GAMES } from '@/components/games/games';
import { CLASS_LEVELS, SUBJECTS, SUBJECT_INFO } from '@/lib/kid-games/catalog';
import { LOGIN_PATH } from '@/lib/auth/routes';
import { PricingCards } from '@/components/billing/PricingCards';
import { cn } from '@/utils/cn';

/* ------------------------------------------------------------------------------------------
 * Shared pieces
 * ---------------------------------------------------------------------------------------- */

/** Width, gutters and vertical rhythm every section shares. */
function Section({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn('relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28', className)}>
      <div className="mx-auto max-w-7xl">{children}</div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
}: {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={cn('mk-reveal max-w-2xl', align === 'center' ? 'mx-auto text-center' : 'text-left')}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent-2">{eyebrow}</p>
      <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-pretty text-[15px] leading-relaxed text-muted sm:text-base">{description}</p>}
    </div>
  );
}

function IconTile({ icon: Icon, color = 'var(--accent)', className }: { icon: LucideIcon; color?: string; className?: string }) {
  return (
    <span
      className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border', className)}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 28%, transparent)`,
      }}
    >
      <Icon className="h-5 w-5" strokeWidth={1.85} />
    </span>
  );
}

function CheckList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-[15px] text-foreground-soft">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function PrimaryCta({ children = 'Get Started', className }: { children?: ReactNode; className?: string }) {
  return (
    <Link
      href="/signup"
      className={cn(
        'btn-primary group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-accent-foreground',
        className,
      )}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

/* ------------------------------------------------------------------------------------------
 * Hero
 * ---------------------------------------------------------------------------------------- */

/** Decorative tiles for the hero's app illustration — shapes and colours, not data. */
const MOCK_TILES = [
  ['#7c3aed', '#c084fc'],
  ['#0ea5e9', '#38bdf8'],
  ['#f97316', '#fbbf24'],
  ['#10b981', '#34d399'],
  ['#ec4899', '#f472b6'],
  ['#6366f1', '#a5b4fc'],
] as const;

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden px-4 pb-20 pt-14 sm:px-6 sm:pb-28 sm:pt-20 lg:px-8">
      {/* Ambient washes and a faint grid, all decoration. */}
      <div aria-hidden className="mk-hero-glow pointer-events-none absolute inset-0" />
      <div aria-hidden className="mk-grid pointer-events-none absolute inset-0" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
        <div className="text-center lg:text-left">
          <p
            style={{ '--i': 0 } as CSSProperties}
            className="anim-rise inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-2"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Media, documents and games in one place
          </p>
          <h1
            style={{ '--i': 1 } as CSSProperties}
            className="anim-rise mt-6 text-balance text-[40px] font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-[64px]"
          >
            Your Digital World,{' '}
            <span className="bg-linear-to-r from-accent via-accent-2 to-accent bg-clip-text text-transparent">Organized.</span>
          </h1>
          <p
            style={{ '--i': 2 } as CSSProperties}
            className="anim-rise mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg lg:mx-0"
          >
            Store, organize and manage your photos, videos, documents and learning games in one secure place — private to
            your account and ready on any device.
          </p>
          <div
            style={{ '--i': 3 } as CSSProperties}
            className="anim-rise mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start"
          >
            <PrimaryCta />
            <Link
              href="/#features"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface/70 px-6 py-3 text-sm font-semibold text-foreground backdrop-blur transition hover:border-border-strong hover:bg-surface-hover"
            >
              Explore Features
            </Link>
          </div>
          <ul
            style={{ '--i': 4 } as CSSProperties}
            className="anim-rise mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-muted lg:justify-start"
          >
            {['Private by default', 'Works in your browser', 'Installable on your phone'].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-accent" strokeWidth={3} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* The illustration: an abstract app window. */}
        <div aria-hidden style={{ '--i': 3 } as CSSProperties} className="anim-rise-scale relative mx-auto w-full max-w-xl lg:max-w-none">
          <div className="mk-float gradient-border relative overflow-hidden rounded-3xl border border-border bg-surface/90 shadow-[0_40px_120px_-40px_color-mix(in_srgb,var(--accent)_55%,transparent)] backdrop-blur">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
              <div className="ml-3 flex h-7 flex-1 items-center gap-2 rounded-lg border border-border bg-background/60 px-3">
                <Search className="h-3.5 w-3.5 text-subtle" />
                <span className="h-2 w-24 rounded-full bg-surface-hover" />
              </div>
            </div>
            <div className="grid grid-cols-[88px_minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)]">
              <div className="space-y-2 border-r border-border p-3">
                {[LayoutIcon, FolderClosed, ImageIcon, FileText, Gamepad2, GraduationCap].map((Icon, i) => (
                  <div
                    key={i}
                    className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5', i === 2 ? 'bg-accent/15 text-accent' : 'text-subtle')}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className={cn('hidden h-1.5 flex-1 rounded-full sm:block', i === 2 ? 'bg-accent/40' : 'bg-surface-hover')} />
                  </div>
                ))}
              </div>
              <div className="p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="h-2.5 w-20 rounded-full bg-foreground/20" />
                  <span className="flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-[10px] font-semibold text-accent-foreground">
                    <Upload className="h-3 w-3" /> Upload
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {MOCK_TILES.map(([from, to], i) => (
                    <div
                      key={i}
                      className="relative aspect-square overflow-hidden rounded-xl"
                      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
                    >
                      {i === 1 && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur">
                            <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />
                          </span>
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-black/25 to-transparent" />
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  {[FileText, FileSpreadsheet].map((Icon, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-2.5 py-2">
                      <Icon className={cn('h-4 w-4', i === 0 ? 'text-danger' : 'text-success')} />
                      <span className="h-1.5 w-1/2 rounded-full bg-surface-hover" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* Floating chips around the window. */}
          <div className="mk-float-slow absolute -left-3 top-1/4 hidden items-center gap-2 rounded-2xl border border-border bg-surface/95 px-3 py-2 text-xs font-medium text-foreground shadow-card backdrop-blur sm:flex">
            <ShieldCheck className="h-4 w-4 text-success" /> Private library
          </div>
          <div className="mk-float absolute -right-2 bottom-10 hidden items-center gap-2 rounded-2xl border border-border bg-surface/95 px-3 py-2 text-xs font-medium text-foreground shadow-card backdrop-blur sm:flex">
            <Trophy className="h-4 w-4 text-warning" /> Learn with Kid Games
          </div>
        </div>
      </div>
    </section>
  );
}

/** A tiny dashboard glyph for the illustration's sidebar. */
function LayoutIcon({ className }: { className?: string }) {
  return <Layers className={className} />;
}

/* ------------------------------------------------------------------------------------------
 * Features
 * ---------------------------------------------------------------------------------------- */

const FEATURES: readonly { icon: LucideIcon; title: string; body: string; color: string }[] = [
  {
    icon: ImageIcon,
    title: 'Media Library',
    body: 'Photos and videos in one gallery, with thumbnails, a full-screen viewer and a built-in video player.',
    color: 'var(--accent)',
  },
  {
    icon: FileText,
    title: 'Documents',
    body: 'Keep PDFs, Word and Excel files and text notes alongside your media. PDFs and text open right in the app.',
    color: '#f59e0b',
  },
  {
    icon: FolderTree,
    title: 'Folders',
    body: 'Nest folders as deep as you like, then rename, move and tidy files one by one or in bulk.',
    color: '#0ea5e9',
  },
  {
    icon: Gamepad2,
    title: 'Games',
    body: 'Seven browser games to unwind with — from Ludo and Snake to Memory Match and Number Puzzle.',
    color: '#ec4899',
  },
  {
    icon: GraduationCap,
    title: 'Kid Games',
    body: 'Learning games for Classes 1–5 in Hindi, English and Mathematics, with XP, stars and saved progress.',
    color: '#10b981',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Storage',
    body: 'Every library is private to its account. Files are served through short-lived signed links, never public URLs.',
    color: '#8b5cf6',
  },
];

export function Features() {
  return (
    <Section id="features">
      <SectionHeading
        eyebrow="Features"
        title="Everything you keep, in one calm place"
        description="media_tool brings your files and your downtime together — organised, searchable and private to you."
      />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="mk-reveal card-interactive group relative overflow-hidden rounded-2xl border border-border bg-surface p-6"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
              style={{ backgroundColor: `color-mix(in srgb, ${feature.color} 30%, transparent)` }}
            />
            <IconTile icon={feature.icon} color={feature.color} />
            <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">{feature.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Media and Documents
 * ---------------------------------------------------------------------------------------- */

export function MediaSection() {
  return (
    <Section className="overflow-hidden">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Media"
            title="Photos and videos, beautifully organised"
            description="Drop in a batch of files and media_tool takes care of the rest — thumbnails for your photos, poster frames for your videos, and one gallery for all of it."
          />
          <div className="mk-reveal">
            <CheckList
              items={[
                'JPEG, PNG, WebP, GIF and HEIC photos; MP4, MOV, WebM and MKV videos',
                'Drag-and-drop uploads with live progress for every file',
                'Full-screen image viewer and built-in video player',
                'Select many at once to move, delete or download',
              ]}
            />
          </div>
        </div>

        <div aria-hidden className="mk-reveal relative">
          <div className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(60%_60%_at_50%_50%,color-mix(in_srgb,var(--accent)_22%,transparent),transparent)]" />
          <div className="relative grid aspect-[3/2] grid-cols-6 grid-rows-4 gap-3">
            <div className="col-span-4 row-span-3 overflow-hidden rounded-2xl bg-linear-to-br from-[#7c3aed] via-[#a855f7] to-[#ec4899] shadow-card">
              <div className="flex h-full items-end p-4">
                <span className="flex items-center gap-1.5 rounded-lg bg-black/30 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
                  <ImageIcon className="h-3.5 w-3.5" /> Photo
                </span>
              </div>
            </div>
            <div className="col-span-2 row-span-2 flex items-center justify-center rounded-2xl bg-linear-to-br from-[#0ea5e9] to-[#6366f1] shadow-card">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur">
                <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
              </span>
            </div>
            <div className="col-span-2 row-span-2 rounded-2xl bg-linear-to-br from-[#f97316] to-[#facc15] shadow-card" />
            <div className="col-span-4 row-span-1 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 shadow-card">
              <Video className="h-4 w-4 text-accent" />
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
                <span className="mk-progress block h-full rounded-full bg-linear-to-r from-accent to-accent-2" />
              </span>
              <Upload className="h-4 w-4 text-muted" />
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

const DOC_POINTS: readonly { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Eye, title: 'Preview in place', body: 'PDFs and text files open inside the app — no download needed to check what you saved.' },
  { icon: FolderClosed, title: 'Filed with everything else', body: 'Documents live in the same folders as your photos, so a trip, a project or a year stays together.' },
  { icon: Search, title: 'Find it fast', body: 'Search across folders and files by name from anywhere in the app.' },
  { icon: Trash2, title: 'Undo mistakes', body: 'Deleted items go to Trash first, and can be restored until you empty it.' },
];

export function DocumentsSection() {
  return (
    <Section className="border-y border-border bg-surface/30">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div aria-hidden className="mk-reveal order-last lg:order-first">
          <div className="gradient-border overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FolderClosed className="h-4 w-4 text-accent" /> Documents
              </span>
              <span className="h-2 w-16 rounded-full bg-surface-hover" />
            </div>
            {[
              { icon: FileText, color: 'var(--danger)', label: 'PDF' },
              { icon: FileText, color: '#3b82f6', label: 'DOCX' },
              { icon: FileSpreadsheet, color: 'var(--success)', label: 'XLSX' },
              { icon: FileText, color: 'var(--muted)', label: 'TXT' },
            ].map(({ icon: Icon, color, label }, i) => (
              <div key={label} className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0">
                <IconTile icon={Icon} color={color} className="h-9 w-9" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <span className="block h-2 rounded-full bg-foreground/15" style={{ width: `${70 - i * 12}%` }} />
                  <span className="block h-1.5 w-1/4 rounded-full bg-surface-hover" />
                </div>
                <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted">{label}</span>
                {i === 0 ? <Eye className="h-4 w-4 text-accent" /> : <Download className="h-4 w-4 text-subtle" />}
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionHeading
            align="left"
            eyebrow="Documents"
            title="Your paperwork, finally in order"
            description="Keep PDFs, Word documents, Excel spreadsheets and plain-text files right next to the photos and videos they belong with."
          />
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {DOC_POINTS.map((point) => (
              <div key={point.title} className="mk-reveal">
                <IconTile icon={point.icon} className="h-10 w-10" />
                <h3 className="mt-3 text-[15px] font-semibold text-foreground">{point.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{point.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Games
 * ---------------------------------------------------------------------------------------- */

/** The four headline games, in this order; the rest of the catalogue is named below them. */
const FEATURED_GAMES = ['ludo', 'snake', 'memory-match', 'number-puzzle'] as const;

export function GamesSection() {
  const featured = FEATURED_GAMES.map((slug) => GAMES.find((g) => g.slug === slug)!).filter(Boolean);
  const others = GAMES.filter((g) => !(FEATURED_GAMES as readonly string[]).includes(g.slug));

  return (
    <Section id="games">
      <SectionHeading
        eyebrow="Games"
        title="Take a break without leaving"
        description="A small arcade built into your library. Every game runs right in the browser — no downloads, no extra accounts."
      />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {featured.map((game) => {
          const Icon = game.icon;
          return (
            <article
              key={game.slug}
              className="mk-reveal card-interactive group relative overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <div
                className="relative flex h-36 items-center justify-center overflow-hidden"
                style={{ backgroundImage: `linear-gradient(135deg, ${game.colors[0]}, ${game.colors[1]})` }}
              >
                <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]" />
                <Icon className="relative h-14 w-14 text-white drop-shadow-lg transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110" strokeWidth={1.6} />
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold tracking-tight text-foreground">{game.name}</h3>
                  <span className="rounded-md bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    {game.category}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-muted">{game.description}</p>
              </div>
            </article>
          );
        })}
      </div>
      <p className="mk-reveal mt-8 text-center text-sm text-muted">
        Plus <span className="font-medium text-foreground-soft">{others.map((g) => g.name).join(', ').replace(/, ([^,]*)$/, ' and $1')}</span>.
        Ludo plays 2–4 people on one device, or against computer players at three difficulty levels.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Kid Games
 * ---------------------------------------------------------------------------------------- */

const KID_POINTS: readonly { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Sparkles, title: 'Learning + games', body: 'Matching, sorting, memory and number games built around each class’s syllabus.' },
  { icon: Star, title: 'XP and stars', body: 'Every game earns XP and up to three stars, with bonuses for perfect rounds and new bests.' },
  { icon: Trophy, title: 'High scores', body: 'Best scores are kept for every game, so there is always a record to beat.' },
  { icon: Flame, title: 'Progress that sticks', body: 'Daily streaks, achievements and per-subject progress are saved to the account.' },
];

export function KidGamesSection() {
  return (
    <Section id="kid-games" className="overflow-hidden">
      <div aria-hidden className="mk-kid-glow pointer-events-none absolute inset-0" />
      <div className="relative">
        <SectionHeading
          eyebrow="Kid Games"
          title={
            <>
              Learning that feels like <span className="bg-linear-to-r from-[#f59e0b] via-[#ec4899] to-[#8b5cf6] bg-clip-text text-transparent">play</span>
            </>
          }
          description="Ten games per subject for every class from 1 to 5 — 150 in all — covering Hindi, English and Mathematics."
        />

        {/* Classes */}
        <div className="mk-reveal mt-12 flex flex-wrap justify-center gap-3">
          {CLASS_LEVELS.map((level) => (
            <span
              key={level}
              className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold text-foreground"
              style={{
                borderColor: `color-mix(in srgb, var(--kid-class-${level}) 40%, transparent)`,
                backgroundImage: `linear-gradient(135deg, color-mix(in srgb, var(--kid-class-${level}) 18%, transparent), color-mix(in srgb, var(--kid-class-${level}-2) 12%, transparent))`,
              }}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: `var(--kid-class-${level})` }}>
                {level}
              </span>
              Class {level}
            </span>
          ))}
        </div>

        {/* Subjects */}
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {SUBJECTS.map((subject) => {
            const info = SUBJECT_INFO[subject];
            const Icon = info.icon;
            return (
              <article
                key={subject}
                className="mk-reveal card-interactive relative overflow-hidden rounded-3xl border p-6"
                style={{
                  borderColor: `color-mix(in srgb, var(--kid-${subject}) 35%, transparent)`,
                  backgroundImage: `linear-gradient(160deg, color-mix(in srgb, var(--kid-${subject}) 16%, var(--surface)), var(--surface) 70%)`,
                }}
              >
                <span aria-hidden className="absolute -right-2 -top-3 select-none text-7xl font-bold opacity-[0.12]" style={{ color: `var(--kid-${subject})` }}>
                  {info.glyph}
                </span>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-card" style={{ backgroundColor: `var(--kid-${subject})` }}>
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-foreground">{info.name}</h3>
                <p className="mt-1 text-sm text-muted">50 games across Classes 1–5</p>
              </article>
            );
          })}
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {KID_POINTS.map((point) => (
            <div key={point.title} className="mk-reveal rounded-2xl border border-border bg-surface/70 p-5 backdrop-blur">
              <IconTile icon={point.icon} color="#f59e0b" className="h-10 w-10" />
              <h3 className="mt-4 text-[15px] font-semibold text-foreground">{point.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{point.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Pricing
 * ---------------------------------------------------------------------------------------- */

export function Pricing() {
  return (
    <Section id="pricing" className="border-y border-border bg-surface/30">
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
export const FAQ_ITEMS: readonly { q: string; a: string }[] = [
  {
    q: 'What kinds of files can I store?',
    a: 'Photos (JPEG, PNG, WebP, GIF, HEIC/HEIF), videos (MP4, MOV, WebM, MKV) and documents (PDF, Word .doc/.docx, Excel .xls/.xlsx and plain text). Files are checked when they are uploaded, so a file that isn’t really one of these types is refused.',
  },
  {
    q: 'Who can see my files?',
    a: 'Only you. Every library is private to its account, and files are delivered through short-lived signed links rather than public URLs. Administrators can see how many files an account holds and how much space it uses, but not the files themselves.',
  },
  {
    q: 'How do I organise everything?',
    a: 'Create folders inside folders, then rename, move and delete files individually or select several at once. Search finds folders and files by name from anywhere in the app.',
  },
  {
    q: 'What happens if I delete something by mistake?',
    a: 'Deleted files and folders go to Trash first. You can restore them from there, and they are only removed for good when you delete them from Trash.',
  },
  {
    q: 'Can I open documents without downloading them?',
    a: 'Yes for PDFs and plain-text files, which preview inside the app. Word and Excel files can be stored, organised and downloaded to open in your usual software.',
  },
  {
    q: 'What are Kid Games?',
    a: 'Learning games for Classes 1 to 5 in Hindi, English and Mathematics — ten per subject per class, 150 in total. Children earn XP and stars, build daily streaks and unlock achievements, and their best scores and progress are saved to the account.',
  },
  {
    q: 'Which games are included?',
    a: 'Ludo, Snake, Memory Match, Number Puzzle, Water Race, Reaction Test and Target Click. Ludo is for 2–4 players on one device, or against computer players at Easy, Medium or Hard.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. media_tool runs in any modern browser on desktop or mobile. If you like, you can also install it to your phone or computer’s home screen so it opens like an app.',
  },
  {
    q: 'I forgot my password. What now?',
    a: 'Choose “Forgot password?” on the sign-in page and enter your email. We’ll send a 4-digit code; enter it and choose a new password. Resetting signs you out on your other devices.',
  },
  {
    q: 'Does it cost anything?',
    a: 'The Free plan costs nothing and includes everything described on this page — no card needed. Pro (₹49/month) and Premium (₹119/month) can be reserved, but online payments aren’t live yet, so nothing is charged and they aren’t activated until payment is completed.',
  },
];

export function Faq() {
  return (
    <Section id="faq">
      <SectionHeading eyebrow="FAQ" title="Questions, answered" description="The short version of how media_tool works." />
      <div className="mx-auto mt-12 max-w-3xl space-y-3">
        {FAQ_ITEMS.map((item) => (
          <details
            key={item.q}
            className="mk-reveal group rounded-2xl border border-border bg-surface transition-colors open:border-accent/35 open:bg-surface-elevated/60"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left text-[15px] font-medium text-foreground outline-none transition hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/40 [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform duration-300 group-open:rotate-180 group-open:text-accent" />
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Final call to action
 * ---------------------------------------------------------------------------------------- */

export function FinalCta() {
  return (
    <Section className="pt-8 sm:pt-10">
      <div className="mk-reveal gradient-border relative overflow-hidden rounded-[2rem] border border-border bg-surface px-6 py-14 text-center shadow-card sm:px-12 sm:py-20">
        <div aria-hidden className="mk-cta-glow pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-2xl">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <MonitorSmartphone className="h-6 w-6" />
          </span>
          <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-[44px] sm:leading-[1.1]">
            Ready to organize your digital world?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] text-muted sm:text-base">
            Create a free account and bring your photos, videos, documents and games together.
          </p>
          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <PrimaryCta />
            <Link
              href={LOGIN_PATH}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-foreground-soft transition hover:text-foreground"
            >
              I already have an account <MoveRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-subtle">
            <Lock className="h-3.5 w-3.5" /> Private by default · No card required
          </p>
        </div>
      </div>
    </Section>
  );
}
