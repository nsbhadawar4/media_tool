import type { PublicCatalog } from '../api/content';
import { HOME_SECTIONS, SITE_SECTIONS, isImplemented } from './catalogManifest';

/**
 * Website sections as administrators manage them (/admin/content/sections). A section is ON when
 * it exists (archived = gone), is enabled and is visible; everything that shows or links to a
 * section asks this module, so a switched-off section disappears everywhere at once:
 *  - its block on the home page;
 *  - its links in the header and footer;
 *  - the pages it stands for, where it stands for some (see SECTION_EFFECTS) — checked on the
 *    server for pages, and by the API for what they save.
 * With no catalog (the API unreachable) the code's defaults apply: on, except sections the code
 * ships switched off (Pricing).
 *
 * Relative imports only: the frontend tests run this outside Next.js.
 */

const ALL_CODE_SECTIONS = [...HOME_SECTIONS, ...SITE_SECTIONS];

/** On by default, i.e. when the catalog can't be read. */
function onByDefault(key: string): boolean {
  const code = ALL_CODE_SECTIONS.find((s) => s.key === key);
  return code ? code.isVisible !== false : false;
}

export function isSectionOn(catalog: PublicCatalog | null | undefined, key: string): boolean {
  if (!catalog) return onByDefault(key);
  const section = catalog.sections.find((s) => s.key === key);
  return Boolean(section?.isEnabled && section.isVisible);
}

/** A block on the home page: one the code renders, or one an administrator added (shown as text). */
export interface HomeBlock {
  key: string;
  title: string;
  description: string;
  /** Added in the admin panel, with no component of its own. */
  custom: boolean;
}

/** The home page's blocks that are ON, in the administrator's order. */
export function homeBlocks(catalog: PublicCatalog | null | undefined): HomeBlock[] {
  const home = new Set(HOME_SECTIONS.map((s) => s.key));
  if (!catalog) {
    return HOME_SECTIONS.filter((s) => s.isVisible !== false).map((s) => ({ key: s.key, title: s.title, description: s.description, custom: false }));
  }
  return [...catalog.sections]
    .filter((s) => s.isEnabled && s.isVisible)
    // Code sections that aren't home blocks (Contact) have pages of their own.
    .filter((s) => home.has(s.key) || !isImplemented('section', s.key))
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ key: s.key, title: s.title, description: s.description, custom: !home.has(s.key) }));
}

/**
 * What switching a code section OFF does, in an administrator's words. Sections added in the
 * admin panel are text blocks on the home page.
 */
export const SECTION_EFFECTS: Readonly<Record<string, string>> = {
  hero: 'Home page block and the “Home” link',
  features: 'Home page block and its header/footer links',
  media: 'Home page block',
  documents: 'Home page block',
  games: 'Home page block, its links, and the Games pages in the app',
  'kid-games': 'Home page block, its links, and Kid Games + Courses in the app',
  reviews: 'Home page block',
  pricing: 'Home page block only — plan choice during sign-up is unaffected',
  faq: 'Home page block and its header/footer links',
  cta: 'Home page block',
  contact: 'The Contact page and its footer links',
};

export const CUSTOM_SECTION_EFFECT = 'Home page text block';

/** Sections whose OFF switch closes part of the app for signed-in users. */
export const APP_AREA_SECTIONS: Readonly<Record<string, readonly string[]>> = {
  games: ['/games'],
  'kid-games': ['/kid-games', '/courses'],
};

/** The section that gates an app path, if any ("/kid-games/class-1" → "kid-games"). */
export function sectionForPath(pathname: string): string | null {
  for (const [key, prefixes] of Object.entries(APP_AREA_SECTIONS)) {
    if (prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return key;
  }
  return null;
}
