import type { PublicCatalog } from '@/lib/api/content';
import { isSectionOn } from '@/lib/content/sections';

export interface MarketingLink {
  href: string;
  label: string;
  /** The website section the link points into: switched off, the link goes too. */
  section: string;
}

/**
 * In-page sections of the public site, in the order they appear. A plain module (not the
 * 'use client' header) so server components such as the footer can read the array itself —
 * importing it from a client module would hand them a client reference instead.
 *
 * `/#section` rather than `#section` so the links also work from /privacy, /terms and /contact.
 */
export const MARKETING_NAV: readonly MarketingLink[] = [
  { href: '/#top', label: 'Home', section: 'hero' },
  { href: '/#features', label: 'Features', section: 'features' },
  { href: '/#games', label: 'Games', section: 'games' },
  { href: '/#kid-games', label: 'Kid Games', section: 'kid-games' },
  { href: '/#faq', label: 'FAQ', section: 'faq' },
];

/** The footer's company links; Contact is a managed section, Privacy and Terms always stay. */
export const LEGAL_LINKS: ReadonlyArray<{ href: string; label: string; section?: string }> = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/contact', label: 'Contact', section: 'contact' },
];

/** Links whose section is ON (all of them when the catalog can't be read: the code defaults). */
export function linksFor<T extends { section?: string }>(links: readonly T[], catalog: PublicCatalog | null): T[] {
  return links.filter((link) => !link.section || isSectionOn(catalog, link.section));
}
