import Link from 'next/link';
import { cookies } from 'next/headers';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { ADMIN_HOME_PATH, LOGIN_PATH, USER_HOME_PATH, roleHintFromToken } from '@/lib/auth/routes';
import { MarketingHeader } from './MarketingHeader';
import { getServerCatalog } from '@/lib/server/contentCatalog';
import { getServerAppearance } from '@/lib/server/appearance';
import { policyBootScript } from '@/lib/theme/policy';
import { LEGAL_LINKS, linksFor, navForViewer, navItemsFor, withLandingSections, type MarketingLink, type Viewer } from './nav';
import { homeBlocks, isOnLanding, isSectionOn } from '@/lib/content/sections';
import { resolveCatalog } from '@/lib/content/catalog';
import type { PublicCatalog } from '@/lib/api/content';

const SESSION_COOKIE_NAME = process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? 'mt_session';

/**
 * The footer's Account links for who is looking. Only a display choice, read from the session
 * cookie without verifying it (as proxy.ts does): every one of these pages checks the session
 * itself, so a stale cookie at most shows a link that leads to the sign-in page.
 *  - signed out: sign in or sign up (password recovery is reached from the sign-in page);
 *  - a user: their app and password reset (private storage pages are reached from inside the app,
 *    never from the public site);
 *  - an administrator: the admin panel only — no user-only links.
 */
const ACCOUNT_LINKS: Record<Viewer, ReadonlyArray<{ href: string; label: string }>> = {
  visitor: [
    { href: LOGIN_PATH, label: 'Login' },
    { href: '/signup', label: 'Get Started' },
  ],
  user: [
    { href: USER_HOME_PATH, label: 'Dashboard' },
    { href: '/forgot-password', label: 'Reset Password' },
  ],
  admin: [{ href: ADMIN_HOME_PATH, label: 'Admin dashboard' }],
};

export async function currentViewer(): Promise<Viewer> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return 'visitor';
  return roleHintFromToken(token) === 'admin' ? 'admin' : 'user';
}

/** Graduation cap resting on a stack of books — the footer's illustration (decorative). */
function FooterIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 170" className={className} aria-hidden fill="none">
      <defs>
        <linearGradient id="ft-book" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#15803d" />
          <stop offset="1" stopColor="#22c55e" />
        </linearGradient>
        <linearGradient id="ft-book-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4ade80" />
          <stop offset="1" stopColor="#16a34a" />
        </linearGradient>
        <linearGradient id="ft-cap" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4ade80" />
          <stop offset="1" stopColor="#15803d" />
        </linearGradient>
        <linearGradient id="ft-cap-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#16a34a" />
          <stop offset="1" stopColor="#14532d" />
        </linearGradient>
        <radialGradient id="ft-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#22c55e" stopOpacity="0.45" />
          <stop offset="1" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="150" rx="88" ry="16" fill="url(#ft-glow)" />
      {/* Bottom book */}
      <path d="M22 128 L100 146 L178 128 L178 142 L100 160 L22 142 Z" fill="#14532d" />
      <path d="M22 128 L100 146 L100 160 L22 142 Z" fill="url(#ft-book)" />
      <path d="M30 131 L100 147 L100 155 L30 139 Z" fill="#f0fdf4" opacity="0.92" />
      <path d="M22 128 L100 110 L178 128 L100 146 Z" fill="url(#ft-book-top)" />
      {/* Middle book */}
      <path d="M32 108 L100 124 L168 108 L168 121 L100 137 L32 121 Z" fill="#14532d" />
      <path d="M32 108 L100 124 L100 137 L32 121 Z" fill="url(#ft-book)" />
      <path d="M40 111 L100 125 L100 132 L40 118 Z" fill="#f0fdf4" opacity="0.92" />
      <path d="M32 108 L100 92 L168 108 L100 124 Z" fill="url(#ft-book-top)" />
      {/* Cap: crown */}
      <path d="M62 72 L62 94 Q100 112 138 94 L138 72 Z" fill="url(#ft-cap-side)" />
      {/* Cap: board */}
      <path d="M100 30 L180 60 L100 90 L20 60 Z" fill="url(#ft-cap)" />
      <path d="M20 60 L100 90 L180 60 L180 64 L100 94 L20 64 Z" fill="#166534" />
      {/* Tassel */}
      <circle cx="100" cy="60" r="5" fill="#bbf7d0" />
      <path d="M100 60 L160 70 L160 98" stroke="#bbf7d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="155" y="96" width="10" height="20" rx="4" fill="#86efac" />
    </svg>
  );
}

const FOOTER_LINK = 'text-[15px] text-foreground-soft transition hover:text-foreground';

function FooterColumn({ title, label, links }: { title: string; label: string; links: ReadonlyArray<{ href: string; label: string }> }) {
  return (
    <nav aria-label={label}>
      <p className="text-lg font-semibold text-foreground">{title}</p>
      <ul className="mt-5 space-y-3.5">
        {links.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={FOOTER_LINK}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * A full-width dark green band in both themes (the brand's own surface), content kept to max-w-7xl:
 * brand and tagline over a green wave, three link columns, then the illustration behind a divider,
 * and a darker bar with the copyright and legal links.
 */
function MarketingFooter({ nav, legal, viewer }: { nav: readonly MarketingLink[]; legal: typeof LEGAL_LINKS; viewer: Viewer }) {
  return (
    <footer className="mt-12">
      <div className="mk-panel-band relative overflow-hidden">
        <div className="relative">
        {/* The green wave across the lower left of the main area. */}
        <svg aria-hidden viewBox="0 0 600 200" preserveAspectRatio="none" className="pointer-events-none absolute bottom-0 left-0 h-28 w-[80%] sm:h-40 sm:w-1/2">
          <defs>
            <linearGradient id="ft-wave" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#22c55e" stopOpacity="0.55" />
              <stop offset="0.6" stopColor="#16a34a" stopOpacity="0.18" />
              <stop offset="1" stopColor="#16a34a" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="ft-wave-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#4ade80" stopOpacity="0.9" />
              <stop offset="1" stopColor="#4ade80" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 90 C 150 110, 260 200, 600 190 L600 200 L0 200 Z" fill="url(#ft-wave)" />
          <path d="M0 90 C 150 110, 260 200, 600 190" stroke="url(#ft-wave-line)" strokeWidth="3" fill="none" />
        </svg>

        <div className="relative mx-auto grid max-w-7xl grid-cols-3 gap-x-4 gap-y-10 px-6 pb-24 pt-14 sm:px-10 md:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] md:gap-10 md:pb-28 md:pt-20 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,0.8fr))_auto] lg:gap-8">
          <div className="col-span-3 md:col-span-1">
            <Link href="/" className="flex w-fit items-center gap-3" aria-label="media_tool home">
              <Logo className="h-10 w-10" />
              <span className="text-2xl font-bold tracking-tight text-foreground">media_tool</span>
            </Link>
            <p className="mt-6 max-w-sm text-base leading-relaxed text-foreground-soft">
              Your photos, videos, documents and games — organised in one private place.
            </p>
          </div>

          <FooterColumn title="Product" label="Footer: product" links={nav.filter((item) => item.key !== 'home')} />
          <FooterColumn title="Account" label="Footer: account" links={ACCOUNT_LINKS[viewer]} />
          <FooterColumn title="Company" label="Footer: legal" links={legal} />

          <div className="hidden items-center border-l border-border pl-8 lg:flex">
            <FooterIllustration className="h-44 w-52" />
          </div>
        </div>
        </div>

        <div className="mk-panel-deep relative">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-7 text-sm text-foreground-soft sm:flex-row sm:px-10">
          <p>© {new Date().getFullYear()} media_tool. All rights reserved.</p>
          <ul className="flex items-center divide-x divide-border">
            {legal.map((item) => (
              <li key={item.href} className="px-4 first:pl-0 last:pr-0">
                <Link href={item.href} className="transition hover:text-foreground">{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        </div>
      </div>
    </footer>
  );
}

/**
 * Which of the header's scroll targets the home page renders, so Games and Kid Games scroll there
 * (and only there). Mirrors app/page.tsx: the Games block needs its landing switch and games to
 * show; Kid Games points at the "Learn by Class" cards, shown while that section and the Kid Games
 * feature are on.
 */
function landingSections(raw: PublicCatalog | null): Set<string> {
  const catalog = resolveCatalog(raw);
  const present = new Set<string>();
  if (isOnLanding(raw, 'games') && catalog.landingArcadeGames.length > 0) present.add('games');
  if (isSectionOn(raw, 'kid-games') && homeBlocks(raw).some((b) => b.key === 'classes') && catalog.classViews.length > 0) present.add('kid-games');
  return present;
}

/** The copyright and legal links alone, while the Footer section is off. */
function LegalLine({ legal }: { legal: typeof LEGAL_LINKS }) {
  return (
    <footer className="border-t border-border px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs text-subtle sm:flex-row">
        <p>© {new Date().getFullYear()} media_tool. All rights reserved.</p>
        <ul className="flex items-center gap-5">
          {legal.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="transition hover:text-foreground">{item.label}</Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}

/**
 * Frame for every public page: header, content, footer. `mk-root` turns on smooth in-page
 * scrolling (see globals.css) for these pages only, leaving the app's own scrolling alone.
 *
 * Links to sections an administrator switched off are left out (/admin/content/sections), so a
 * page rendering this must be dynamic — see getServerCatalog.
 */
export async function MarketingShell({ children }: { children: ReactNode }) {
  const [catalog, appearance] = await Promise.all([getServerCatalog(), getServerAppearance()]);
  const viewer = await currentViewer();
  // Switched-off sections lose their links; Games and Kid Games point where this viewer can go.
  const items = navForViewer(withLandingSections(linksFor(navItemsFor(catalog), catalog), landingSections(catalog)), viewer);
  const nav = items.filter((item) => !item.button);
  const buttons = items.filter((item) => item.button);
  return (
    <div className="mk-root relative min-h-screen overflow-x-clip bg-background">
      {/* The site's appearance setting, applied before the content below paints (the root
          layout's script only knows the last setting this browser saw). */}
      {/* As markup inside a hidden element, not a React <script>: the browser runs it while parsing
          the server's HTML (before this content paints), and React never re-creates a script on the
          client — which it would warn about, since such a script would not run there. */}
      {appearance && <div hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `<script>${policyBootScript(appearance)}</script>` }} />}
      <MarketingHeader nav={nav} buttons={buttons} />
      <main id="main-content">{children}</main>
      {/* The Footer section switch (/admin/content/sections) drops the link columns only:
          Privacy and Terms must stay reachable from every public page. */}
      {isSectionOn(catalog, 'footer') ? (
        <MarketingFooter nav={nav} legal={linksFor(LEGAL_LINKS, catalog)} viewer={viewer} />
      ) : (
        <LegalLine legal={linksFor(LEGAL_LINKS, catalog)} />
      )}
    </div>
  );
}

/** A simple prose page inside the marketing shell, for Privacy, Terms and Contact. */
export function LegalPage({
  eyebrow,
  title,
  updated,
  informational = false,
  children,
}: {
  eyebrow: string;
  title: string;
  updated?: string;
  /** Shows the "general information, not legal advice" notice (Privacy and Terms). */
  informational?: boolean;
  children: ReactNode;
}) {
  return (
    <MarketingShell>
      <article className="px-4 pb-24 pt-14 sm:px-6 sm:pt-20 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent-2">{eyebrow}</p>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{title}</h1>
          {updated && <p className="mt-3 text-sm text-subtle">Last updated {updated}</p>}
          {informational && (
            <p
              role="note"
              className="mt-6 flex items-start gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>
                This page is general information about how media_tool works and how it handles your data. It is not legal
                advice.
              </span>
            </p>
          )}
          <div className="mk-prose mt-10">{children}</div>
        </div>
      </article>
    </MarketingShell>
  );
}
