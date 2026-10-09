/**
 * Website section visibility on the frontend: which home blocks render, which header/footer links
 * and app navigation entries show, and which app areas a switched-off section closes — all from
 * the one ON/OFF state the server's catalog carries (enabled + visible, not archived).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { homeBlocks, isSectionOn, sectionForPath } from '../lib/content/sections';
import { resolveCatalog } from '../lib/content/catalog';
import { buildCatalogSeed } from '../lib/content/catalogManifest';
import { LEGAL_LINKS, MARKETING_NAV, linksFor } from '../components/marketing/nav';
import { USER_NAV_GROUPS, liveNavItems, openNavGroups } from '../components/admin/navItems';
import type { CatalogEntry, PublicCatalog } from '../lib/api/content';

function entry(e: Partial<CatalogEntry> & { key: string }): CatalogEntry {
  return { title: e.key, description: '', order: 1, classLevel: null, subject: null, thumbnailUrl: null, glyph: null, difficulty: null, gameType: null, courseId: null, isEnabled: true, isVisible: true, ...e };
}
/** The catalog as the server returns it straight after seeding. */
function seeded(): PublicCatalog {
  const sections = buildCatalogSeed()
    .filter((e) => e.type === 'section')
    .map((e) => entry({ key: e.key, title: e.title, description: e.description, order: e.order, isVisible: e.isVisible ?? true }));
  return { sections, classes: [], subjects: [], classSubjects: [], kidGames: [], games: [], courses: [] };
}
const set = (c: PublicCatalog, key: string, p: Partial<CatalogEntry>): PublicCatalog => ({ ...c, sections: c.sections.map((s) => (s.key === key ? { ...s, ...p } : s)) });
const off = (c: PublicCatalog, key: string) => set(c, key, { isEnabled: false });
const labels = (links: readonly { label: string }[]) => links.map((l) => l.label);
const keys = (c: PublicCatalog | null) => homeBlocks(c).map((b) => b.key);

test('defaults: every section on except Pricing; Contact is a page, not a home block', () => {
  assert.deepEqual(keys(null), ['hero', 'highlights', 'features', 'media', 'documents', 'games', 'kid-games', 'how-it-works', 'security', 'reviews', 'faq', 'cta']);
  assert.deepEqual(keys(seeded()), keys(null), 'a freshly seeded catalog matches the code defaults');
  assert.equal(isSectionOn(null, 'pricing'), false);
  assert.equal(isSectionOn(null, 'contact'), true);
  assert.equal(isSectionOn(null, 'not-a-section'), false);
});

test('ON means enabled and visible and present; either flag off — or archived — is OFF', () => {
  const c = seeded();
  assert.equal(isSectionOn(c, 'faq'), true);
  assert.equal(isSectionOn(off(c, 'faq'), 'faq'), false);
  assert.equal(isSectionOn(set(c, 'faq', { isVisible: false }), 'faq'), false);
  assert.equal(isSectionOn({ ...c, sections: c.sections.filter((s) => s.key !== 'faq') }, 'faq'), false, 'archived: absent from the catalog');
  assert.equal(isSectionOn(set(c, 'pricing', { isVisible: true }), 'pricing'), true);
});

test('home page: hidden sections drop out, in the administrator’s order', () => {
  let c = off(seeded(), 'faq');
  c = set(c, 'pricing', { isVisible: true, order: 0 });
  c = off(c, 'kid-games');
  assert.deepEqual(keys(c), ['pricing', 'hero', 'highlights', 'features', 'media', 'documents', 'games', 'how-it-works', 'security', 'reviews', 'cta']);
});

test('home page: a section added in the admin panel renders as a custom block; Contact never does', () => {
  const c = seeded();
  c.sections.push(entry({ key: 'announcement', title: 'Announcement', description: 'News', order: 3 }));
  const blocks = homeBlocks(c);
  const custom = blocks.find((b) => b.key === 'announcement')!;
  assert.deepEqual([custom.custom, custom.title, custom.description], [true, 'Announcement', 'News']);
  assert.equal(blocks.find((b) => b.key === 'hero')!.custom, false);
  assert.ok(!blocks.some((b) => b.key === 'contact'));
  assert.ok(!keys(off(c, 'announcement')).includes('announcement'));
});

test('header and footer: links to OFF sections are left out', () => {
  const c = seeded();
  assert.deepEqual(labels(linksFor(MARKETING_NAV, c)), ['Home', 'Features', 'Games', 'Kid Games', 'FAQ']);
  assert.deepEqual(labels(linksFor(MARKETING_NAV, off(off(c, 'faq'), 'kid-games'))), ['Home', 'Features', 'Games']);
  assert.deepEqual(labels(linksFor(LEGAL_LINKS, c)), ['Privacy', 'Terms', 'Contact']);
  assert.deepEqual(labels(linksFor(LEGAL_LINKS, off(c, 'contact'))), ['Privacy', 'Terms'], 'Privacy and Terms always stay');
  assert.deepEqual(labels(linksFor(MARKETING_NAV, null)), ['Home', 'Features', 'Games', 'Kid Games', 'FAQ'], 'no catalog: the code defaults');
  assert.ok(!MARKETING_NAV.some((l) => l.label === 'Pricing'));
});

test('app areas: Games and Kid Games (with Courses) close with their sections', () => {
  assert.equal(sectionForPath('/games'), 'games');
  assert.equal(sectionForPath('/games/ludo'), 'games');
  assert.equal(sectionForPath('/kid-games/class-1/math'), 'kid-games');
  assert.equal(sectionForPath('/courses/counting'), 'kid-games');
  assert.equal(sectionForPath('/gamesroom'), null);
  assert.equal(sectionForPath('/dashboard'), null);
  assert.equal(sectionForPath('/onboarding'), null, 'plan choice is never gated by a section');

  const c = resolveCatalog(off(off(seeded(), 'games'), 'kid-games'));
  const nav = liveNavItems(openNavGroups(USER_NAV_GROUPS, c.isSectionOn)).map((i) => i.href);
  assert.ok(!nav.includes('/games') && !nav.includes('/kid-games') && !nav.includes('/courses'));
  assert.ok(nav.includes('/dashboard') && nav.includes('/manage-storage'));
  const all = liveNavItems(openNavGroups(USER_NAV_GROUPS, resolveCatalog(seeded()).isSectionOn)).map((i) => i.href);
  assert.ok(all.includes('/games') && all.includes('/kid-games') && all.includes('/courses'));
});

test('Pricing OFF only affects the home page block', () => {
  const c = seeded(); // Pricing ships off
  assert.ok(!keys(c).includes('pricing'));
  assert.ok(!labels(linksFor(MARKETING_NAV, c)).includes('Pricing'));
  assert.equal(sectionForPath('/onboarding'), null);
  assert.equal(sectionForPath('/signup'), null);
});
