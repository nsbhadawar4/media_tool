import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, BookOpen, Gamepad2, RefreshCw } from 'lucide-react';
import { MarketingShell, currentViewer } from '@/components/marketing/MarketingShell';
import { builtInSubtitle, classPicture, classVars } from '@/components/kid-games/cards/ClassCourseCard';
import { getPublicCurriculum, getServerCatalog } from '@/lib/server/contentCatalog';
import { CurriculumView } from '@/components/courses/CurriculumView';
import { ThemedPlaceholder } from '@/components/admin/courses/ClassGenerator';
import { resolveCatalog } from '@/lib/content/catalog';
import { siteMetadataBase } from '@/lib/site';
import { LOGIN_PATH } from '@/lib/auth/routes';

/**
 * /classes/class-N — a class as visitors see it before signing in: its picture, what it covers and
 * the subjects in it, read from the same catalog administrators manage in Manage Courses (so a
 * renamed, re-pictured or newly added class shows here at once). Starting to learn goes on to the
 * class in Kid Games, through sign-in when needed.
 *
 * Like the Kid Games pages, a class opens by its link while it is switched on, even if it is
 * hidden from the lists — which is also how an administrator previews a hidden class.
 */
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const view = resolveCatalog(await getServerCatalog()).classBySlug(slug);
  return {
    title: view ? `${view.title} — media_tool` : 'Class — media_tool',
    description: view?.description || 'Structured learning with games in every subject.',
    alternates: { canonical: `/classes/${slug}` },
    metadataBase: await siteMetadataBase(),
  };
}

export default async function PublicClassPage({ params }: Params) {
  const { slug } = await params;
  const [raw, curriculum] = await Promise.all([getServerCatalog(), getPublicCurriculum(slug)]);
  if (!raw || curriculum.status === 'error') return <ClassUnavailable slug={slug} />;
  const catalog = resolveCatalog(raw);
  // Published, visible classes only (drafts and hidden classes are previewed in Manage Courses).
  // The Kid Games switch doesn't matter here; it only decides whether the class can be played.
  const view = catalog.classViews.find((c) => c.key === slug);
  if (!view || curriculum.status === 'missing') notFound();
  const kidGamesOpen = catalog.isSectionOn('kid-games');

  const viewer = await currentViewer();
  const signedIn = viewer !== 'visitor';
  const learnHref = kidGamesOpen
    ? signedIn
      ? `/kid-games/${view.key}`
      : `${LOGIN_PATH}?from=/kid-games/${view.key}`
    : signedIn
      ? '/dashboard'
      : '/signup';
  const learnLabel = kidGamesOpen ? (signedIn ? 'Start learning' : 'Sign in to start learning') : signedIn ? 'Go to your dashboard' : 'Create a free account';
  // Games are counted only while Kid Games, where they are played, is open.
  const subjects = curriculum.data.subjects.map((s) => ({ ...s, games: kidGamesOpen ? s.games : 0 }));
  const games = subjects.reduce((n, s) => n + s.games, 0);
  const chapters = subjects.reduce((n, s) => n + s.chapters.length, 0);
  const picture = classPicture(view.level, view.thumbnailUrl, view.title, view.isCode);
  const subtitle = view.subtitle || (view.isCode ? builtInSubtitle(view.level) : undefined);

  return (
    <MarketingShell>
      <main style={classVars(view.level)} className="relative px-4 pb-20 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <div aria-hidden className="mk-hero-glow mk-hero-fade pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl">
          <Link href="/#kid-games" className="group mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-foreground">
            <ArrowLeft aria-hidden className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            All classes
          </Link>

          <section className="anim-rise grid items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-border shadow-card">
              {picture ? (
                picture.local ? (
                  <Image src={picture.src} alt={picture.alt} fill priority sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" style={picture.focus ? { objectPosition: picture.focus } : undefined} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- an uploaded or linked picture, loaded as it is
                  <img src={picture.src} alt={picture.alt} className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" />
                )
              ) : (
                <ThemedPlaceholder level={view.level} marks={subjects.map((s) => s.glyph || s.title.slice(0, 1)).slice(0, 4)} />
              )}
              <span aria-hidden className="kg-photo-veil pointer-events-none absolute inset-0" />
              <span className="absolute left-5 top-5 rounded-full border border-white/30 bg-slate-900/45 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-white backdrop-blur-md">
                Class {view.level}
              </span>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--kg)_70%,var(--foreground))]">{subtitle ?? `Class ${view.level}`}</p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">{view.title}</h1>
              {view.description && <p className="mt-4 text-lg leading-relaxed text-foreground-soft">{view.description}</p>}
              {view.details && <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-muted">{view.details}</p>}
              <ul className="mt-6 flex flex-wrap gap-2 text-sm" aria-label="About this class">
                <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-foreground-soft">
                  <BookOpen aria-hidden className="h-4 w-4 text-accent" />
                  {subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'}
                </li>
                {chapters > 0 && (
                  <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-foreground-soft">
                    <BookOpen aria-hidden className="h-4 w-4 text-accent" />
                    {chapters} {chapters === 1 ? 'chapter' : 'chapters'}
                  </li>
                )}
                {games > 0 && (
                  <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-foreground-soft">
                    <Gamepad2 aria-hidden className="h-4 w-4 text-accent" />
                    {games} learning {games === 1 ? 'game' : 'games'}
                  </li>
                )}
              </ul>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={learnHref} className="mk-btn-primary btn-primary inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-accent-foreground">
                  {learnLabel}
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
                {!signedIn && kidGamesOpen && (
                  <Link href="/signup" className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-surface px-6 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover">
                    Create a free account
                  </Link>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="class-subjects" className="mt-16">
            <h2 id="class-subjects" className="text-2xl font-semibold tracking-tight text-foreground">
              Subjects in {view.title}
            </h2>
            <div className="mt-6">
              <CurriculumView subjects={subjects} />
            </div>
          </section>
        </div>
      </main>
    </MarketingShell>
  );
}

/** The catalog couldn't be read: say so plainly, with a way to try again. */
function ClassUnavailable({ slug }: { slug: string }) {
  return (
    <MarketingShell>
      <main className="flex min-h-[60vh] items-center justify-center px-4 py-20">
        <div className="max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
          <h1 className="text-xl font-semibold text-foreground">Unable to load this class</h1>
          <p className="mt-2 text-sm text-muted">Something went wrong while loading the class. Please try again in a moment.</p>
          <Link href={`/classes/${slug}`} className="btn-primary mt-6 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-accent-foreground">
            <RefreshCw aria-hidden className="h-4 w-4" />
            Try again
          </Link>
        </div>
      </main>
    </MarketingShell>
  );
}
