import Link from 'next/link';
import { cookies } from 'next/headers';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { ADMIN_HOME_PATH, LOGIN_PATH, USER_HOME_PATH, roleHintFromToken } from '@/lib/auth/routes';
import { MarketingHeader } from './MarketingHeader';
import { getServerCatalog } from '@/lib/server/contentCatalog';
import { LEGAL_LINKS, MARKETING_NAV, linksFor, type MarketingLink } from './nav';

const SESSION_COOKIE_NAME = process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? 'mt_session';

type Viewer = 'visitor' | 'user' | 'admin';

/**
 * The footer's Account links for who is looking. Only a display choice, read from the session
 * cookie without verifying it (as proxy.ts does): every one of these pages checks the session
 * itself, so a stale cookie at most shows a link that leads to the sign-in page.
 *  - signed out: sign in or sign up (password recovery is reached from the sign-in page);
 *  - a user: their app, their storage and password reset;
 *  - an administrator: the admin panel only — no user-only links.
 */
const ACCOUNT_LINKS: Record<Viewer, ReadonlyArray<{ href: string; label: string }>> = {
  visitor: [
    { href: LOGIN_PATH, label: 'Login' },
    { href: '/signup', label: 'Get Started' },
  ],
  user: [
    { href: USER_HOME_PATH, label: 'Dashboard' },
    { href: '/manage-storage', label: 'Manage Storage' },
    { href: '/forgot-password', label: 'Reset Password' },
  ],
  admin: [{ href: ADMIN_HOME_PATH, label: 'Admin dashboard' }],
};

async function currentViewer(): Promise<Viewer> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return 'visitor';
  return roleHintFromToken(token) === 'admin' ? 'admin' : 'user';
}

function MarketingFooter({ nav, legal, viewer }: { nav: readonly MarketingLink[]; legal: typeof LEGAL_LINKS; viewer: Viewer }) {
  return (
    <footer className="relative overflow-hidden px-4 pb-10 pt-16 sm:px-6 lg:px-8">
      <div aria-hidden className="mk-horizon pointer-events-none absolute inset-x-0 top-0 h-px opacity-60" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(124,92,255,0.10),transparent)]" />
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <Link href="/#top" className="flex w-fit items-center gap-2.5" aria-label="media_tool home">
              <Logo className="h-8 w-8" />
              <span className="text-[15px] font-semibold tracking-tight text-foreground">media_tool</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              Your photos, videos, documents and games — organised in one private place.
            </p>
          </div>

          <nav aria-label="Footer: product">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">Product</p>
            <ul className="mt-4 space-y-2.5">
              {nav.filter((item) => item.label !== 'Home').map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-foreground-soft transition hover:text-foreground">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Footer: account">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">Account</p>
            <ul className="mt-4 space-y-2.5">
              {ACCOUNT_LINKS[viewer].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-foreground-soft transition hover:text-foreground">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Footer: legal">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">Company</p>
            <ul className="mt-4 space-y-2.5">
              {legal.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-foreground-soft transition hover:text-foreground">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-xs text-subtle sm:flex-row">
          <p>© {new Date().getFullYear()} media_tool. All rights reserved.</p>
          <ul className="flex items-center gap-5">
            {legal.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="transition hover:text-foreground">{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>
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
  const catalog = await getServerCatalog();
  const nav = linksFor(MARKETING_NAV, catalog);
  const viewer = await currentViewer();
  return (
    <div className="mk-root relative min-h-screen overflow-x-clip bg-background">
      <MarketingHeader nav={nav} />
      <main id="main-content">{children}</main>
      <MarketingFooter nav={nav} legal={linksFor(LEGAL_LINKS, catalog)} viewer={viewer} />
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
