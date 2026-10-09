import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Flame,
  FolderClosed,
  FolderOpen,
  FolderTree,
  Gamepad2,
  GraduationCap,
  Image as ImageIcon,
  KeyRound,
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
  Upload,
  UserPlus,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { GameMeta } from '@/components/games/games';
import { SUBJECT_INFO } from '@/lib/kid-games/catalog';
import type { ClassView } from '@/lib/content/catalog';
import { LOGIN_PATH } from '@/lib/auth/routes';
import { PricingCards } from '@/components/billing/PricingCards';
import { cn } from '@/utils/cn';
import { PhotoArt } from './visuals';
import { HeroPreview } from './HeroPreview';

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
function Section({ id, className, inner, children }: { id?: string; className?: string; inner?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn('relative px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-[88px]', className)}>
      <div className={cn('relative mx-auto max-w-7xl', inner)}>{children}</div>
    </section>
  );
}

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('mk-eyebrow inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-2', className)}>
      <span aria-hidden className="h-px w-6 bg-linear-to-r from-transparent to-accent-2" />
      {children}
    </p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: 'center' | 'left';
  className?: string;
}) {
  return (
    <div className={cn('mk-reveal max-w-2xl', align === 'center' ? 'mx-auto text-center' : 'text-left', className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-[44px]">{title}</h2>
      {description && <p className="mt-5 text-pretty text-[15px] leading-relaxed text-muted sm:text-[17px]">{description}</p>}
    </div>
  );
}

/** A violet gradient on the words that matter. */
function Highlight({ children }: { children: ReactNode }) {
  return <span className="mk-text-gradient">{children}</span>;
}

function IconTile({ icon: Icon, color = 'var(--accent)', className }: { icon: LucideIcon; color?: string; className?: string }) {
  return (
    <span
      className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border', className)}
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

function CheckList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-7 space-y-3.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-[15px] text-foreground-soft">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-2 ring-1 ring-accent/25">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function PrimaryCta({ href = '/signup', children = 'Get Started', className }: { href?: string; children?: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'btn-primary mk-sheen group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-accent-foreground',
        focusRing,
        className,
      )}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

function SecondaryCta({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'mk-btn-ghost inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-foreground',
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
  { icon: Lock, label: 'Private to your account' },
  { icon: MonitorSmartphone, label: 'Runs in your browser' },
  { icon: Sparkles, label: 'Free plan, no card needed' },
] as const;

/** `featuresLink`: false while the Features section is switched off (nothing to scroll to). */
export function Hero({ featuresLink = true }: { featuresLink?: boolean }) {
  return (
    <section id="top" className="relative overflow-hidden px-4 pb-20 pt-12 sm:px-6 sm:pb-28 sm:pt-16 lg:px-8 lg:pb-32 lg:pt-20">
      {/* Layered light, a fading grid and a horizon line — all decoration. */}
      <div aria-hidden className="mk-hero-glow pointer-events-none absolute inset-0" />
      <div aria-hidden className="mk-aurora pointer-events-none absolute inset-0">
        <span />
        <span />
      </div>
      <div aria-hidden className="mk-grid pointer-events-none absolute inset-0" />
      <div aria-hidden className="mk-horizon pointer-events-none absolute inset-x-0 bottom-0 h-px" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2 lg:gap-12 xl:gap-14">
        <div className="text-center lg:text-left">
          <p
            style={{ '--i': 0 } as CSSProperties}
            className="anim-rise mk-badge mk-shimmer relative inline-flex items-center gap-2 overflow-hidden rounded-full py-1 pl-1 pr-3.5 text-xs font-medium text-foreground-soft"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-accent-2">
              <Sparkles className="h-3 w-3" />
            </span>
            Photos, videos, documents &amp; games
            <span aria-hidden className="mk-pulse-dot ml-0.5 h-1.5 w-1.5 rounded-full bg-[#22d3ee]" />
          </p>
          <h1
            style={{ '--i': 1 } as CSSProperties}
            className="anim-rise mt-7 text-[36px] font-semibold leading-[1.06] tracking-[-0.035em] text-foreground min-[400px]:text-[40px] sm:text-[56px] lg:text-[40px] xl:text-[50px] 2xl:text-[52px]"
          >
            {/* Set lines from sm up. The gradient sits on inline words only: clipped to text, it
                paints just the element's own boxes. */}
            <span className="sm:block">Everything You Create.</span> <span className="sm:block">
              One <span className="mk-text-gradient">Beautifully</span>
            </span>{' '}
            <span className="sm:block">
              <span className="mk-text-gradient">Organized</span> Space.
            </span>
          </h1>
          <p
            style={{ '--i': 2 } as CSSProperties}
            className="anim-rise mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg lg:mx-0"
          >
            Photos, videos, documents and learning games — kept together in one secure, private workspace that opens in any browser, on any
            device.
          </p>
          <div style={{ '--i': 3 } as CSSProperties} className="anim-rise mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
            <PrimaryCta>Get Started free</PrimaryCta>
            {featuresLink && <SecondaryCta href="/#features">Explore Features</SecondaryCta>}
          </div>
          <ul style={{ '--i': 4 } as CSSProperties} className="anim-rise mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[13px] text-muted lg:justify-start">
            {TRUST.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-accent-2" strokeWidth={2} />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div style={{ '--i': 3 } as CSSProperties} className="anim-rise-scale relative px-2 sm:px-6 lg:px-0">
          <HeroPreview />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Product highlights — everything the product brings together, in one bento
 * ---------------------------------------------------------------------------------------- */

function BentoCard({ className, children, label }: { className?: string; children: ReactNode; label: string }) {
  return (
    <article aria-label={label} className={cn('mk-reveal mk-card group relative flex flex-col overflow-hidden rounded-3xl', className)}>
      {children}
    </article>
  );
}

function BentoCaption({ icon, color, title, body }: { icon: LucideIcon; color: string; title: string; body: string }) {
  return (
    <div className="relative mt-auto flex items-start gap-3.5 p-5 sm:p-6">
      <IconTile icon={icon} color={color} className="h-10 w-10" />
      <div className="min-w-0">
        <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}

/** "Classes 1–5", or "Class 3" when there is just one. */
function classRange(classes: readonly ClassView[]): string {
  const levels = classes.map((c) => c.level);
  return levels.length > 1 ? `Classes ${Math.min(...levels)}–${Math.max(...levels)}` : `Class ${levels[0]}`;
}

export function Highlights({ games, kidGames }: { games: readonly GameMeta[] | null; kidGames: readonly ClassView[] | null }) {
  return (
    <Section id="highlights" className="pt-6 sm:pt-10 lg:pt-12">
      <SectionHeading
        eyebrow="One home for everything"
        title={
          <>
            Everything you keep, <Highlight>finally together</Highlight>
          </>
        }
        description="Your photos, videos and documents share the same folders — with games for a break and learning games for the kids, all in one private place."
      />

      <div className="mt-14 grid auto-rows-auto gap-4 md:grid-cols-4 lg:gap-5">
        {/* Photos — the large tile */}
        <BentoCard label="Photos" className="md:col-span-2 md:row-span-2">
          <div aria-hidden className="relative grid flex-1 grid-cols-3 grid-rows-2 gap-2 p-3 sm:p-4">
            <div className="mk-tile col-span-2 row-span-2 min-h-44 overflow-hidden rounded-2xl">
              <PhotoArt scene={0} />
            </div>
            <div className="mk-tile overflow-hidden rounded-2xl">
              <PhotoArt scene={3} />
            </div>
            <div className="mk-tile relative overflow-hidden rounded-2xl">
              <PhotoArt scene={2} />
              <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur">HEIC</span>
            </div>
          </div>
          <BentoCaption icon={ImageIcon} color="#a78bfa" title="Photos" body="JPEG, PNG, WebP, GIF and HEIC — with thumbnails and a full-screen viewer." />
        </BentoCard>

        {/* Videos */}
        <BentoCard label="Videos" className="md:col-span-2">
          <div aria-hidden className="relative m-3 overflow-hidden rounded-2xl sm:m-4">
            <div className="h-36 sm:h-40">
              <PhotoArt scene={1} />
            </div>
            <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
            <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/30 backdrop-blur transition-transform duration-300 group-hover:scale-110">
              <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
            </span>
            <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 text-[10px] font-medium text-white/85">
              <span>0:42</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
                <span className="block h-full w-2/5 rounded-full bg-white" />
              </span>
              <span>2:15</span>
            </div>
          </div>
          <BentoCaption icon={Video} color="#38bdf8" title="Videos" body="MP4, MOV, WebM and MKV with poster frames and a built-in player." />
        </BentoCard>

        {/* Documents */}
        <BentoCard label="Documents">
          <div aria-hidden className="space-y-1.5 p-4 pb-0">
            {[
              { icon: FileText, color: '#f87171', w: '78%', kind: 'PDF' },
              { icon: FileText, color: '#60a5fa', w: '62%', kind: 'DOCX' },
              { icon: FileSpreadsheet, color: '#34d399', w: '70%', kind: 'XLSX' },
            ].map((d) => (
              <div key={d.kind} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                <d.icon className="h-3.5 w-3.5 shrink-0" style={{ color: d.color }} />
                <span className="h-1.5 rounded-full bg-foreground/15" style={{ width: d.w }} />
                <span className="ml-auto text-[9px] font-semibold text-subtle">{d.kind}</span>
              </div>
            ))}
          </div>
          <BentoCaption icon={FileText} color="#f59e0b" title="Documents" body="PDF, Word, Excel and text. PDFs and text preview in the app." />
        </BentoCard>

        {/* Folders */}
        <BentoCard label="Folders">
          <div aria-hidden className="space-y-1 p-4 pb-0 text-[11px] font-medium text-foreground-soft">
            <div className="flex items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5 text-accent-2" /> Family
            </div>
            <div className="ml-4 flex items-center gap-1.5 border-l border-white/10 pl-2.5">
              <FolderOpen className="h-3.5 w-3.5 text-[#38bdf8]" /> 2026 holidays
            </div>
            <div className="ml-9 flex items-center gap-1.5 border-l border-white/10 pl-2.5 text-muted">
              <FolderClosed className="h-3.5 w-3.5" /> Beach day
            </div>
            <div className="ml-4 flex items-center gap-1.5 border-l border-white/10 pl-2.5 text-muted">
              <FolderClosed className="h-3.5 w-3.5" /> School
            </div>
          </div>
          <BentoCaption icon={FolderTree} color="#22d3ee" title="Folders" body="Nest as deep as you like; move and tidy files in bulk." />
        </BentoCard>

        {games && (
          <BentoCard label="Games" className={kidGames ? 'md:col-span-2' : 'md:col-span-4'}>
            <div aria-hidden className="flex flex-wrap gap-2 pl-5 pr-14 pt-5 sm:pl-6 sm:pt-6">
              {games.slice(0, 5).map((game) => (
                <span
                  key={game.slug}
                  className="mk-tile flex h-12 w-12 items-center justify-center rounded-xl text-white"
                  style={{ backgroundImage: `linear-gradient(135deg, ${game.colors[0]}, ${game.colors[1]})` }}
                >
                  <game.icon className="h-5 w-5" strokeWidth={1.8} />
                </span>
              ))}
            </div>
            <BentoCaption icon={Gamepad2} color="#f472b6" title="Games" body={`A small arcade in your browser — ${games.slice(0, 2).map((g) => g.name).join(' and ')}${games.length > 2 ? ' and more' : ''}.`} />
            <Link href="/#games" className={cn('absolute right-4 top-4 rounded-full p-2 text-muted transition hover:bg-white/5 hover:text-foreground', focusRing)} aria-label="See the games">
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </BentoCard>
        )}
        {kidGames && (
          <BentoCard label="Kid Games" className={games ? 'md:col-span-2' : 'md:col-span-4'}>
            <div aria-hidden className="flex flex-wrap gap-2 pl-5 pr-14 pt-5 sm:pl-6 sm:pt-6">
              {kidGames.map((c) => (
                <span
                  key={c.key}
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-base font-bold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                  style={{ backgroundColor: c.isCode ? `var(--kid-class-${c.level})` : 'var(--accent)' }}
                >
                  {c.level}
                </span>
              ))}
            </div>
            <BentoCaption icon={GraduationCap} color="#fbbf24" title="Kid Games" body={`Learning games for ${classRange(kidGames)}, with stars, streaks and saved progress.`} />
            <Link href="/#kid-games" className={cn('absolute right-4 top-4 rounded-full p-2 text-muted transition hover:bg-white/5 hover:text-foreground', focusRing)} aria-label="See Kid Games">
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </BentoCard>
        )}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------
 * Features — a single bordered matrix, one lead feature and the rest around it
 * ---------------------------------------------------------------------------------------- */

const FEATURES: readonly { icon: LucideIcon; title: string; body: string; color: string; area?: 'games' | 'kid-games' }[] = [
  { icon: Lock, title: 'Private media library', body: 'Every file belongs to one account and is checked on every request. Nobody else can open your library.', color: '#a78bfa' },
  { icon: FolderTree, title: 'Folders & organisation', body: 'Nested folders, renaming, moving and bulk actions — plus search across everything by name.', color: '#22d3ee' },
  { icon: FileText, title: 'Document management', body: 'PDF, Word, Excel and text files beside your media. PDFs and text open right in the app.', color: '#f59e0b' },
  { icon: MonitorSmartphone, title: 'Browser-based access', body: 'Nothing to install. Use it on desktop or phone, or add it to your home screen like an app.', color: '#60a5fa' },
  { icon: Gamepad2, title: 'Games', body: 'Browser games for a quick break — single player, local multiplayer and against the computer.', color: '#f472b6', area: 'games' },
  { icon: Trophy, title: 'Kid Games & progress', body: 'Class 1–5 learning games with XP, stars, streaks and per-subject progress saved to the account.', color: '#34d399', area: 'kid-games' },
];

export function Features({ games = true, kidGames = true }: { games?: boolean; kidGames?: boolean }) {
  const items = FEATURES.filter((f) => (f.area === 'games' ? games : f.area === 'kid-games' ? kidGames : true));
  return (
    <Section id="features">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-end lg:gap-16">
        <SectionHeading
          align="left"
          eyebrow="Features"
          title={
            <>
              Built for the way you <Highlight>actually keep things</Highlight>
            </>
          }
        />
        <p className="mk-reveal max-w-xl text-pretty text-[15px] leading-relaxed text-muted sm:text-[17px] lg:pb-1">
          media_tool brings your files and your downtime together — organised, searchable and private to you, with nothing to install.
        </p>
      </div>

      <div className="mk-reveal mk-matrix mt-14 grid overflow-hidden rounded-3xl sm:grid-cols-2 lg:grid-cols-3">
        {items.map((feature) => (
          <article key={feature.title} className="mk-matrix-cell group relative p-7 sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              style={{ background: `radial-gradient(70% 60% at 0% 0%, color-mix(in srgb, ${feature.color} 14%, transparent), transparent 70%)` }}
            />
            <IconTile icon={feature.icon} color={feature.color} className="relative transition-transform duration-300 group-hover:-translate-y-0.5" />
            <h3 className="relative mt-6 text-lg font-semibold tracking-tight text-foreground">{feature.title}</h3>
            <p className="relative mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
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
      <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Media"
            title={
              <>
                Photos and videos, <Highlight>beautifully kept</Highlight>
              </>
            }
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
          <div className="mk-preview-light pointer-events-none absolute -inset-8 -z-10" />
          <div className="mk-window grid grid-cols-6 grid-rows-[repeat(4,minmax(0,1fr))] gap-2.5 rounded-3xl p-3 sm:gap-3 sm:p-4" style={{ aspectRatio: '6 / 5' }}>
            <div className="mk-tile relative col-span-4 row-span-3 overflow-hidden rounded-2xl">
              <PhotoArt scene={4} />
              <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/40 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
                <ImageIcon className="h-3.5 w-3.5" /> sunset.heic
              </span>
            </div>
            <div className="mk-tile relative col-span-2 row-span-2 overflow-hidden rounded-2xl">
              <PhotoArt scene={1} />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/25 backdrop-blur">
                  <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
                </span>
              </span>
            </div>
            <div className="mk-tile col-span-2 row-span-1 overflow-hidden rounded-2xl">
              <PhotoArt scene={5} />
            </div>
            <div className="col-span-6 row-span-1 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-2">
                <Upload className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">beach-day.mp4</p>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="mk-progress block h-full rounded-full bg-linear-to-r from-accent to-[#22d3ee]" />
                </span>
              </div>
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

const DOC_ROWS = [
  { icon: FileText, color: '#f87171', name: 'Rental agreement.pdf', kind: 'PDF', meta: '2.1 MB' },
  { icon: FileText, color: '#60a5fa', name: 'Cover letter.docx', kind: 'DOCX', meta: '48 KB' },
  { icon: FileSpreadsheet, color: '#34d399', name: 'Monthly budget.xlsx', kind: 'XLSX', meta: '96 KB' },
  { icon: FileText, color: '#a1a1aa', name: 'Packing list.txt', kind: 'TXT', meta: '2 KB' },
] as const;

export function DocumentsSection() {
  return (
    <Section className="mk-band">
      <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div aria-hidden className="mk-reveal order-last lg:order-first">
          <div className="mk-window overflow-hidden rounded-3xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FolderOpen className="h-4 w-4 text-accent-2" /> Documents
              </span>
              <span className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-2 py-1 text-[10px] text-subtle">
                <Search className="h-3 w-3" /> Search
              </span>
            </div>
            {DOC_ROWS.map(({ icon: Icon, color, name, kind, meta }, i) => (
              <div key={name} className={cn('flex items-center gap-3 border-b border-white/[0.05] px-5 py-3.5 last:border-b-0', i === 0 && 'bg-accent/[0.06]')}>
                <IconTile icon={Icon} color={color} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">{name}</p>
                  <p className="text-[11px] text-subtle">{meta}</p>
                </div>
                <span className="hidden rounded-md border border-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:inline">{kind}</span>
                {i === 0 ? (
                  <span className="flex items-center gap-1 rounded-lg bg-accent/15 px-2 py-1 text-[10px] font-semibold text-accent-2">
                    <Eye className="h-3 w-3" /> Preview
                  </span>
                ) : (
                  <Download className="h-4 w-4 text-subtle" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionHeading
            align="left"
            eyebrow="Documents"
            title={
              <>
                Your paperwork, <Highlight>finally in order</Highlight>
              </>
            }
            description="Keep PDFs, Word documents, Excel spreadsheets and plain-text files right next to the photos and videos they belong with."
          />
          <div className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {DOC_POINTS.map((point) => (
              <div key={point.title} className="mk-reveal">
                <IconTile icon={point.icon} className="h-10 w-10" />
                <h3 className="mt-3.5 text-[15px] font-semibold text-foreground">{point.title}</h3>
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
 * Games — the catalogue as the administrator lists it
 * ---------------------------------------------------------------------------------------- */

function GameArt({ game, large = false }: { game: GameMeta; large?: boolean }) {
  const Icon = game.icon;
  return (
    <div
      aria-hidden
      className={cn('relative flex items-center justify-center overflow-hidden', large ? 'h-48 sm:h-60' : 'h-28')}
      style={{ backgroundImage: `linear-gradient(135deg, ${game.colors[0]}, ${game.colors[1]})` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.38),transparent_55%)]" />
      <div className="mk-dots absolute inset-0 opacity-30" />
      <Icon
        className={cn('relative text-white drop-shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110', large ? 'h-24 w-24' : 'h-12 w-12')}
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
      <div aria-hidden className="mk-games-glow pointer-events-none absolute inset-0" />
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
            description={`A small arcade built into your library — ${games.length} ${games.length === 1 ? 'game' : 'games'} that run right in the browser. No downloads, no extra accounts.`}
          />
          <ul className="mk-reveal mt-8 space-y-3 text-[15px] text-foreground-soft">
            {[
              { icon: Gamepad2, text: 'Classics, puzzles and quick reflex games' },
              // Only while Ludo itself is listed.
              ...(games.some((g) => g.slug === 'ludo')
                ? [
                    { icon: UserPlus, text: 'Ludo for 2–4 players on one device' },
                    { icon: Timer, text: 'Computer opponents at Easy, Medium and Hard' },
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
            <PrimaryCta href="/games">Explore Games</PrimaryCta>
          </div>
        </div>

        <div className="mk-reveal grid gap-4 sm:grid-cols-2">
          <article className="mk-card card-lift group overflow-hidden rounded-3xl sm:col-span-2">
            <GameArt game={lead} large />
            <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">{lead.name}</h3>
                <p className="mt-1 text-sm text-muted">{lead.description}</p>
              </div>
              <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{lead.category}</span>
            </div>
          </article>
          {tiles.map((game) => (
            <article key={game.slug} className="mk-card card-lift group overflow-hidden rounded-2xl">
              <GameArt game={game} />
              <div className="p-4">
                <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{game.name}</h3>
                <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{game.description}</p>
              </div>
            </article>
          ))}
          {more.length > 0 && (
            <p className="text-center text-sm text-muted sm:col-span-2">
              Plus <span className="font-medium text-foreground-soft">{more.map((g) => g.name).join(', ').replace(/, ([^,]*)$/, ' and $1')}</span>.
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

const KID_POINTS: readonly { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Star, title: 'XP and stars', body: 'Up to three stars a game, with bonuses for perfect rounds and new bests.' },
  { icon: Flame, title: 'Daily streaks', body: 'Streaks, achievements and per-subject progress are saved to the account.' },
  { icon: Trophy, title: 'High scores', body: 'Best scores are kept for every game — always a record to beat.' },
];

export interface KidSubjectSummary {
  key: string;
  name: string;
  native: string;
  glyph: string;
  games: number;
}

export function KidGamesSection({ classes, subjects, totalGames }: { classes: readonly ClassView[]; subjects: readonly KidSubjectSummary[]; totalGames: number }) {
  if (classes.length === 0) return null;
  const range = classRange(classes);
  return (
    <Section id="kid-games" className="px-3 sm:px-6 lg:px-8">
      <div className="mk-kid-panel relative overflow-hidden rounded-[2rem] px-5 py-14 sm:rounded-[2.5rem] sm:px-10 sm:py-16 lg:px-14 lg:py-20">
        <div aria-hidden className="mk-kid-glow pointer-events-none absolute inset-0" />
        <div className="relative grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-14">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Kid Games"
              title={
                <>
                  Learning that feels like <span className="bg-linear-to-r from-[#fbbf24] via-[#f472b6] to-[#a78bfa] bg-clip-text text-transparent">play</span>
                </>
              }
              description={`${totalGames > 0 ? `${totalGames} learning games` : 'Learning games'} for ${range}${subjects.length ? ` in ${subjects.map((s) => s.name).join(', ').replace(/, ([^,]*)$/, ' and $1')}` : ''} — matching, sorting, memory and number games built around each class.`}
            />
            <div className="mt-8 grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
              {KID_POINTS.map((point) => (
                <div key={point.title} className="mk-reveal flex gap-3.5">
                  <IconTile icon={point.icon} color="#fbbf24" className="h-9 w-9" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{point.title}</h3>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{point.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mk-reveal mt-9">
              <PrimaryCta href="/kid-games">Explore Kid Games</PrimaryCta>
            </div>
          </div>

          <div className="mk-reveal space-y-4">
            {/* Class ladder */}
            <div className="flex flex-wrap gap-2.5" aria-label="Classes">
              {classes.map((c) => {
                const color = c.isCode ? `var(--kid-class-${c.level})` : 'var(--accent)';
                return (
                  <span
                    key={c.key}
                    className="inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-semibold text-foreground"
                    style={{
                      borderColor: `color-mix(in srgb, ${color} 42%, transparent)`,
                      backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${color} 20%, transparent), color-mix(in srgb, ${color} 6%, transparent))`,
                    }}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: color }}>
                      {c.level}
                    </span>
                    {c.title}
                  </span>
                );
              })}
            </div>

            {/* Subjects */}
            <div className={cn('grid gap-3', subjects.length >= 3 ? 'sm:grid-cols-3' : subjects.length === 2 ? 'sm:grid-cols-2' : '')}>
              {subjects.map((s) => (
                <article
                  key={s.key}
                  className="card-lift relative overflow-hidden rounded-3xl border p-5"
                  style={{
                    borderColor: `color-mix(in srgb, var(--kid-${s.key}, var(--accent)) 35%, transparent)`,
                    backgroundImage: `linear-gradient(160deg, color-mix(in srgb, var(--kid-${s.key}, var(--accent)) 22%, #0d0d14), #0d0d14 75%)`,
                  }}
                >
                  <span aria-hidden className="block select-none text-4xl font-bold leading-none opacity-80" style={{ color: `var(--kid-${s.key}, var(--accent))` }} lang={s.key === 'hindi' ? 'hi' : undefined}>
                    {s.glyph}
                  </span>
                  <h3 className="mt-6 text-base font-semibold text-foreground">{s.name}</h3>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {s.games > 0 ? `${s.games} games` : 'Games'} · <span lang={s.key === 'hindi' ? 'hi' : undefined}>{s.native}</span>
                  </p>
                </article>
              ))}
            </div>

            {/* A finished round, as the app shows it */}
            <div aria-hidden className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-black/25 p-4 backdrop-blur">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-[#fbbf24] to-[#f97316] text-white shadow-[0_8px_20px_-8px_#f97316]">
                <Trophy className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Round complete!</p>
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

/** The catalog's subjects, in the shape the Kid Games section shows them. */
export function kidSubjectSummary(key: string, title: string, games: number): KidSubjectSummary {
  const info = key in SUBJECT_INFO ? SUBJECT_INFO[key as keyof typeof SUBJECT_INFO] : null;
  return { key, name: title, native: info?.native ?? title, glyph: info?.glyph ?? title.slice(0, 2), games };
}

/* ------------------------------------------------------------------------------------------
 * How it works
 * ---------------------------------------------------------------------------------------- */

const STEPS: readonly { icon: LucideIcon; title: string; body: string }[] = [
  { icon: UserPlus, title: 'Create your account', body: 'Sign up in a minute and start on the Free plan — no card needed.' },
  { icon: LibraryBig, title: 'Organise your library', body: 'Upload photos, videos and documents, then file them into folders that make sense to you.' },
  { icon: Sparkles, title: 'Open it anywhere', body: 'Your library, games and learning progress are waiting in any browser you sign in from.' },
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
        <div aria-hidden className="mk-step-line pointer-events-none absolute left-[16.5%] right-[16.5%] top-7 hidden h-px md:block" />
        {STEPS.map((step, i) => (
          <li key={step.title} className="mk-reveal relative flex flex-col items-center text-center">
            <span className="mk-step relative flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-semibold text-foreground">
              <span className="mk-text-gradient">{String(i + 1).padStart(2, '0')}</span>
            </span>
            <div className="mt-7 flex items-center gap-2 text-accent-2">
              <step.icon className="h-4 w-4" />
            </div>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">{step.title}</h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{step.body}</p>
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
  { icon: Lock, title: 'Private by default', body: 'Every file belongs to one account, and the server checks ownership on every request.' },
  { icon: ShieldCheck, title: 'Short-lived file links', body: 'Files are delivered through signed links that expire — never public URLs.' },
  { icon: KeyRound, title: 'Hashed passwords', body: 'Passwords are stored only as salted hashes; reset codes are hashed too.' },
  { icon: LogIn, title: 'Protected sign-in', body: 'HTTP-only session cookies, and limits on sign-in and code attempts.' },
  { icon: RotateCcw, title: 'Sign out everywhere', body: 'Changing or resetting your password signs out your other devices.' },
  { icon: Trash2, title: 'Recoverable deletes', body: 'Deleted items wait in Trash, so a mistake can be undone.' },
];

export function SecuritySection() {
  return (
    <Section id="security" className="mk-band">
      <div className="grid gap-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
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
              <ShieldCheck className="h-16 w-16 text-accent-2" strokeWidth={1.3} />
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {SECURITY.map((item) => (
            <article key={item.title} className="mk-reveal mk-card card-lift rounded-2xl p-6">
              <IconTile icon={item.icon} color="#a78bfa" className="h-10 w-10" />
              <h3 className="mt-5 text-base font-semibold text-foreground">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.body}</p>
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

export function Faq({ contactLink = true }: { contactLink?: boolean }) {
  return (
    <Section id="faq">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading align="left" eyebrow="FAQ" title="Questions, answered" description="The short version of how media_tool works." />
          {contactLink && (
            <p className="mk-reveal mt-6 text-sm text-muted">
              Still wondering?{' '}
              <Link href="/contact" className={cn('rounded font-semibold text-accent-2 underline-offset-4 hover:underline', focusRing)}>
                Get in touch
              </Link>
            </p>
          )}
        </div>
        <div className="mk-faq overflow-hidden rounded-3xl">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="mk-faq-item group">
              <summary
                className={cn(
                  'flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-left text-[15px] font-medium text-foreground transition-colors hover:text-accent-2 sm:px-7 [&::-webkit-details-marker]:hidden',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60',
                )}
              >
                {item.q}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-muted transition-all duration-300 group-open:rotate-180 group-open:border-accent/40 group-open:text-accent-2">
                  <ChevronDown className="h-4 w-4" />
                </span>
              </summary>
              <p className="mk-faq-answer px-5 pb-6 text-sm leading-relaxed text-muted sm:px-7">{item.a}</p>
            </details>
          ))}
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
        <div aria-hidden className="mk-cta-glow mk-drift pointer-events-none absolute -inset-[6%]" />
        <div aria-hidden className="mk-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-2xl">
          <Eyebrow className="justify-center">Get started</Eyebrow>
          <h2 className="mt-5 text-balance text-[34px] font-semibold leading-[1.08] tracking-[-0.025em] text-foreground sm:text-[52px]">
            Bring your digital world <Highlight>together today</Highlight>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-foreground-soft sm:text-[17px]">
            Create a free account and keep your photos, videos, documents and games in one private place.
          </p>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <PrimaryCta className="sm:min-w-48">Get Started free</PrimaryCta>
            <Link
              href={LOGIN_PATH}
              className={cn('inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-foreground-soft transition hover:text-foreground', focusRing)}
            >
              I already have an account <MoveRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-subtle">
            <Lock className="h-3.5 w-3.5" /> Private by default · No card required
          </p>
        </div>
      </div>
    </Section>
  );
}
