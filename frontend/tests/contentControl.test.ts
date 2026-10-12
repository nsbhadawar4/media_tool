/**
 * What the site and the app render from the admin content controls: the landing page's Games /
 * Kid Games blocks (their own switch, separate from the feature), each game's landing and dashboard
 * surfaces and "featured", Kid Games visibility inherited from class and subject, the dashboard's
 * blocks in the administrator's order, and header links built only from fixed destinations.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { homeBlocks, isOnLanding } from '../lib/content/sections';
import { resolveCatalog } from '../lib/content/catalog';
import { buildCatalogSeed } from '../lib/content/catalogManifest';
import { linksFor, navForViewer, navItemsFor } from '../components/marketing/nav';
import type { CatalogEntry, PublicCatalog } from '../lib/api/content';

function entry(e: Partial<CatalogEntry> & { key: string }): CatalogEntry {
  return { title: e.key, description: '', order: 1, classLevel: null, subject: null, thumbnailUrl: null, glyph: null, difficulty: null, gameType: null, courseId: null, isEnabled: true, isVisible: true, showOnLanding: true, featured: false, ...e };
}
const GROUP = { section: 'sections', class: 'classes', subject: 'subjects', class_subject: 'classSubjects', kid_game: 'kidGames', game: 'games', dashboard_widget: 'dashboardWidgets', nav_item: 'navItems' } as const;
/** The catalog as the server returns it straight after seeding. */
function seeded(): Required<PublicCatalog> {
  const out: Required<PublicCatalog> = { sections: [], classes: [], subjects: [], classSubjects: [], kidGames: [], games: [], dashboardWidgets: [], navItems: [], courses: [] };
  for (const e of buildCatalogSeed()) {
    out[GROUP[e.type]].push(
      entry({ key: e.key, title: e.title, order: e.order, classLevel: e.classLevel ?? null, subject: e.subject ?? null, isVisible: e.isVisible ?? true, showOnLanding: e.showOnLanding ?? true }),
    );
  }
  return out;
}
type Group = (typeof GROUP)[keyof typeof GROUP];
const set = <C extends Required<PublicCatalog>>(c: C, group: Group, key: string, p: Partial<CatalogEntry>): C => ({
  ...c,
  [group]: (c[group] as CatalogEntry[]).map((e) => (e.key === key ? { ...e, ...p } : e)),
});
const blockKeys = (c: PublicCatalog | null) => homeBlocks(c).map((b) => b.key);

test('Games / Kid Games on the landing page: feature ON and the landing switch on — independently of the app', () => {
  let c = seeded();
  assert.ok(!blockKeys(c).includes('games') && !blockKeys(c).includes('kid-games'), 'off the landing page by default');
  assert.equal(resolveCatalog(c).isSectionOn('games'), true, 'while the feature stays on in the app');
  c = set(c, 'sections', 'games', { showOnLanding: true });
  assert.ok(blockKeys(c).includes('games'));
  assert.equal(isOnLanding(c, 'games'), true);
  // Feature off: gone from the landing page too, whatever its landing switch says.
  c = set(c, 'sections', 'games', { isEnabled: false });
  assert.ok(!blockKeys(c).includes('games'));
  assert.equal(isOnLanding(c, 'games'), false);
  assert.equal(isOnLanding(null, 'games'), false, 'no catalog: off the landing page');
  // Ordinary sections: ON means on the landing page.
  assert.equal(isOnLanding(c, 'faq'), true);
});

test('landing sections render in the administrator’s order', () => {
  let c = seeded();
  c = set(c, 'sections', 'faq', { order: 0.5 });
  assert.equal(blockKeys(c)[0], 'faq');
  c = set(c, 'sections', 'reviews', { isVisible: false });
  assert.ok(!blockKeys(c).includes('reviews'));
});

test('each game: enabled, dashboard and landing are separate; featured come first', () => {
  let c = seeded();
  c = set(c, 'games', 'snake', { isVisible: false });
  c = set(c, 'games', 'ludo', { isEnabled: false });
  c = set(c, 'games', 'memory-match', { showOnLanding: false });
  c = set(c, 'games', 'number-puzzle', { featured: true });
  const r = resolveCatalog(c);
  const dash = r.arcadeGames.map((g) => g.slug);
  assert.ok(!dash.includes('snake'), 'dashboard off');
  assert.ok(!dash.includes('ludo'), 'disabled: nowhere');
  assert.ok(dash.includes('memory-match'), 'landing off does not touch the dashboard');
  assert.equal(dash[0], 'number-puzzle', 'featured first');
  const landing = r.landingArcadeGames.map((g) => g.slug);
  assert.ok(landing.includes('snake'), 'dashboard off does not touch the landing page');
  assert.ok(!landing.includes('ludo') && !landing.includes('memory-match'));
  assert.equal(r.isArcadePlayable('ludo'), false, 'a disabled game cannot be opened');
  assert.equal(r.isArcadePlayable('snake'), true, 'hidden from the dashboard, but a direct link still works');
  assert.equal(r.isArcadeFeatured('number-puzzle'), true);
});

test('Kid Games inherit: class, subject, a class’s subject and the game itself all decide', () => {
  const base = seeded();
  const all = resolveCatalog(base).listedGames().length;
  assert.equal(all, 150);
  // A class's subject off: only that pair disappears.
  let c = set(base, 'classSubjects', 'class-1-english', { isEnabled: false });
  let r = resolveCatalog(c);
  assert.equal(r.listedGames(1, 'english').length, 0);
  assert.equal(r.listedGames(1, 'math').length, 10);
  assert.equal(r.listedGames(2, 'english').length, 10);
  assert.ok(!r.subjectsFor(1).some((s) => s.key === 'english'));
  assert.equal(r.landingKidGames(1, 'english').length, 0, 'and from the landing page');
  // A subject off: gone in every class.
  c = set(base, 'subjects', 'hindi', { isEnabled: false });
  r = resolveCatalog(c);
  assert.equal(r.listedGames(undefined, 'hindi').length, 0);
  // A class off: everything in it.
  c = set(base, 'classes', 'class-3', { isEnabled: false });
  r = resolveCatalog(c);
  assert.equal(r.listedGames(3).length, 0);
  assert.ok(!r.classes.includes(3));
  // One game off: only that game.
  const id = base.kidGames[0].key;
  c = set(base, 'kidGames', id, { isEnabled: false });
  r = resolveCatalog(c);
  assert.equal(r.listedGames().length, 149);
  assert.equal(r.isGamePlayable(id), false);
  // Landing off for one game: still on the dashboard.
  c = set(base, 'kidGames', id, { showOnLanding: false, featured: true });
  r = resolveCatalog(c);
  assert.equal(r.landingKidGames().length, 149);
  assert.equal(r.listedGames().length, 150);
  assert.deepEqual(r.featuredKidGames.map((g) => g.id), [id]);
});

test('dashboard blocks: enabled ones in the administrator’s order; Games and Kid Games need their feature', () => {
  let c = seeded();
  assert.deepEqual(resolveCatalog(c).dashboardWidgets, ['welcome', 'stats', 'quick-actions', 'recent-files', 'recent-activity', 'storage', 'games', 'kid-games', 'recent-folders']);
  c = set(c, 'dashboardWidgets', 'recent-folders', { isEnabled: false });
  c = set(c, 'dashboardWidgets', 'games', { order: 1.5 });
  c = set(c, 'dashboardWidgets', 'kid-games', { order: 1.6 });
  assert.deepEqual(resolveCatalog(c).dashboardWidgets, ['welcome', 'games', 'kid-games', 'stats', 'quick-actions', 'recent-files', 'recent-activity', 'storage']);
  c = set(c, 'sections', 'games', { isEnabled: false });
  assert.ok(!resolveCatalog(c).dashboardWidgets.includes('games'), 'feature off: the block goes too');
  assert.ok(resolveCatalog(c).dashboardWidgets.includes('kid-games'));
  // No catalog, or an API without dashboard blocks: the code layout.
  assert.equal(resolveCatalog(null).dashboardWidgets.length, 9);
  const older: PublicCatalog = { ...seeded(), dashboardWidgets: undefined };
  assert.equal(resolveCatalog(older).dashboardWidgets.length, 9);
});

test('header links: enabled, ordered, relabelled — destinations only from the code, never from data', () => {
  let c = seeded();
  const keys = (cat: PublicCatalog | null) => navItemsFor(cat).map((l) => l.key);
  assert.deepEqual(keys(c), ['home', 'features', 'games', 'kid-games', 'faq', 'pricing', 'login', 'get-started']);
  c = set(c, 'navItems', 'faq', { order: 0.5, title: 'Questions' });
  c = set(c, 'navItems', 'kid-games', { isEnabled: false });
  const links = navItemsFor(c);
  assert.equal(links[0].key, 'faq');
  assert.equal(links[0].label, 'Questions');
  assert.equal(links[0].href, '/#faq');
  assert.ok(!keys(c).includes('kid-games'));
  // An entry the code has no destination for is dropped, whatever its title or description.
  c.navItems.push(entry({ key: 'evil', title: 'javascript:alert(1)', description: 'https://example.com' }));
  assert.ok(!keys(c).includes('evil'));
  assert.ok(navItemsFor(c).every((l) => l.href.startsWith('/')));
  // Pricing's link only while its section is on; Games only while the feature is.
  assert.ok(!linksFor(navItemsFor(c), c).some((l) => l.key === 'pricing'));
  c = set(c, 'sections', 'games', { isEnabled: false });
  assert.ok(!linksFor(navItemsFor(c), c).some((l) => l.key === 'games'), 'no broken link to a closed feature');
  // Buttons are part of the list, and visitors go through sign-in for app pages.
  const visitor = navForViewer(linksFor(navItemsFor(seeded()), seeded()), 'visitor');
  assert.deepEqual(visitor.filter((l) => l.button).map((l) => l.key), ['login', 'get-started']);
  assert.equal(visitor.find((l) => l.key === 'games')!.href, '/login?from=/games');
});

test('the Footer section: on by default, never a home page block, switchable', () => {
  const c = seeded();
  assert.equal(resolveCatalog(null).isSectionOn('footer'), true, 'no catalog: shown');
  assert.equal(resolveCatalog(c).isSectionOn('footer'), true);
  assert.ok(!blockKeys(c).includes('footer'), 'rendered by the page frame, not as a block');
  assert.equal(resolveCatalog(set(c, 'sections', 'footer', { isEnabled: false })).isSectionOn('footer'), false);
});
