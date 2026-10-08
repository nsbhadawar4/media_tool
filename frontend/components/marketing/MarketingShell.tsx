import Link from 'next/link';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { LOGIN_PATH } from '@/lib/auth/routes';
import { MarketingHeader } from './MarketingHeader';
import { MARKETING_NAV } from './nav';

const LEGAL_LINKS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/contact', label: 'Contact' },
] as const;

function MarketingFooter() {
  return (
    <footer className="border-t border-border px-4 pb-10 pt-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
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
              {MARKETING_NAV.filter((item) => item.label !== 'Home').map((item) => (
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
              <li><Link href={LOGIN_PATH} className="text-sm text-foreground-soft transition hover:text-foreground">Login</Link></li>
              <li><Link href="/signup" className="text-sm text-foreground-soft transition hover:text-foreground">Get Started</Link></li>
              <li><Link href="/forgot-password" className="text-sm text-foreground-soft transition hover:text-foreground">Reset password</Link></li>
            </ul>
          </nav>

          <nav aria-label="Footer: legal">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">Company</p>
            <ul className="mt-4 space-y-2.5">
              {LEGAL_LINKS.map((item) => (
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
            {LEGAL_LINKS.map((item) => (
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
 */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="mk-root relative min-h-screen overflow-x-clip bg-background">
      <MarketingHeader />
      <main id="main-content">{children}</main>
      <MarketingFooter />
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
