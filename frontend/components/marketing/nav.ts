import type { PublicCatalog } from '@/lib/api/content';
import { isSectionOn } from '@/lib/content/sections';
import { NAV_ITEMS } from '@/lib/content/catalogManifest';
import { LOGIN_PATH } from '@/lib/auth/routes';

export interface MarketingLink {
  /** The nav item it comes from (/admin/content/navigation). */
  key: string;
  href: string;
  label: string;
  /** The website section the link points into: switched off, the link goes too. */
  section?: string;
  /** A page of the signed-in app rather than a section of the home page. */
  app?: boolean;
  /** One of the header's buttons (Login, Get Started) rather than a link in the menu. */
  button?: boolean;
  /** Set by navForViewer: the link goes to sign-in first (shown with a lock). */
  signIn?: boolean;
}

/** Who is looking at a public page, from the session cookie (MarketingShell). */
export type Viewer = 'visitor' | 'user' | 'admin';

/**
 * Where each header item goes. Fixed here, in code: an administrator switches, orders and
 * relabels the items, but never sets an address — so no link can point anywhere unsafe, and an
 * item whose key isn't listed here is simply not shown.
 *
 * `/#section` rather than `#section` so the links also work from /privacy, /terms and /contact.
 */
const DESTINATIONS: Readonly<Record<string, Omit<MarketingLink, 'key' | 'label' | 'signIn'>>> = {
  home: { href: '/#top', section: 'hero' },
  features: { href: '/#features', section: 'features' },
  games: { href: '/games', section: 'games', app: true },
  'kid-games': { href: '/kid-games', section: 'kid-games', app: true },
  faq: { href: '/#faq', section: 'faq' },
  pricing: { href: '/#pricing', section: 'pricing' },
  login: { href: LOGIN_PATH, button: true },
  'get-started': { href: '/signup', button: true },
};

/**
 * The header's items as an administrator set them: the enabled ones, in their order, under their
 * labels. A plain module (not the 'use client' header) so server components such as the footer
 * can call it. With no catalog (or an API that doesn't send nav items yet), the code defaults.
 */
export function navItemsFor(catalog: PublicCatalog | null | undefined): MarketingLink[] {
  const stored = catalog?.navItems;
  const entries = stored?.length
    ? [...stored].filter((e) => e.isEnabled).sort((a, b) => a.order - b.order)
    : NAV_ITEMS.map((n) => ({ key: n.key, title: n.title }));
  return entries.flatMap((e) => {
    const to = DESTINATIONS[e.key];
    return to ? [{ key: e.key, label: e.title, ...to }] : [];
  });
}

/** The code-default menu links (no buttons): what the header shows with no catalog. */
export const MARKETING_NAV: readonly MarketingLink[] = navItemsFor(null).filter((l) => !l.button);

/** The footer's company links; Contact is a managed section, Privacy and Terms always stay. */
export const LEGAL_LINKS: ReadonlyArray<{ href: string; label: string; section?: string }> = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/contact', label: 'Contact', section: 'contact' },
];

/**
 * Links whose section is ON (all of them when the catalog can't be read: the code defaults), so no
 * link leads to a section that isn't there. Games and Kid Games follow their feature switch.
 */
export function linksFor<T extends { section?: string }>(links: readonly T[], catalog: PublicCatalog | null): T[] {
  return links.filter((link) => !link.section || isSectionOn(catalog, link.section));
}

/**
 * The header and footer links for who is looking. Games and Kid Games are pages of the user app,
 * not sections of the home page:
 *  - a visitor goes to sign-in, which lands on the page afterwards (/login?from=/games);
 *  - a signed-in user goes straight there;
 *  - an administrator doesn't get them — the user app isn't theirs (proxy.ts, admin layout).
 * Only a display choice: proxy.ts and the backend still check every request.
 */
export function navForViewer(links: readonly MarketingLink[], viewer: Viewer): MarketingLink[] {
  if (viewer === 'admin') return links.filter((link) => !link.app);
  if (viewer === 'user') return [...links];
  return links.map((link) => (link.app ? { ...link, href: `${LOGIN_PATH}?from=${link.href}`, signIn: true } : link));
}
