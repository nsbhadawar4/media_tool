/**
 * Where class cards and subject cards lead, for every class (Classes 1–5 and any an administrator
 * adds), with Kid Games on and off: classes are managed in Manage Courses, and the Kid Games switch
 * only decides whether their games can be played — never whether a class opens.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCatalog } from '../lib/content/catalog';
import { buildCatalogSeed } from '../lib/content/catalogManifest';
import { chapterPath, classCards, classGamesPath, classPath, formatMinutes, subjectHasChapters, subjectPath } from '../lib/content/learnPaths';
import { sectionForPath } from '../lib/content/sections';
import { USER_NAV_GROUPS, openNavGroups } from '../components/admin/navItems';
import { isPublicPath } from '../lib/auth/routes';
import type { CatalogCourse, CatalogEntry, PublicCatalog } from '../lib/api/content';

function entry(e: Partial<CatalogEntry> & { key: string }): CatalogEntry {
  return { title: e.key, description: '', order: 1, classLevel: null, subject: null, thumbnailUrl: null, glyph: null, difficulty: null, gameType: null, courseId: null, isEnabled: true, isVisible: true, ...e };
}
function course(c: Partial<CatalogCourse> & { id: string }): CatalogCourse {
  return { slug: c.id, title: c.id, summary: '', classLevel: 1, subject: 'math', thumbnailUrl: null, difficulty: null, ageGroup: null, lessonCount: 1, order: 1, isEnabled: true, isVisible: true, ...c };
}
/** The seeded catalog plus an administrator's Class 6 (Hindi, with two chapters) — Kid Games on or off. */
function catalog(kidGamesOn: boolean): PublicCatalog {
  const out: Required<PublicCatalog> = { sections: [], classes: [], subjects: [], classSubjects: [], kidGames: [], games: [], dashboardWidgets: [], navItems: [], courses: [] };
  const group = { section: 'sections', class: 'classes', subject: 'subjects', class_subject: 'classSubjects', kid_game: 'kidGames', game: 'games', dashboard_widget: 'dashboardWidgets', nav_item: 'navItems' } as const;
  for (const e of buildCatalogSeed()) {
    out[group[e.type]].push(entry({ key: e.key, title: e.title, description: e.description, order: e.order, classLevel: e.classLevel ?? null, subject: e.subject ?? null, isVisible: e.isVisible ?? true }));
  }
  out.sections = out.sections.map((s) => (s.key === 'kid-games' ? { ...s, isEnabled: kidGamesOn } : s));
  out.classes.push(entry({ key: 'class-6', title: 'Class 6', classLevel: 6, order: 6, subtitle: 'Foundation to Exploration' }));
  out.classSubjects.push(entry({ key: 'class-6-hindi', classLevel: 6, subject: 'hindi', order: 1 }));
  out.courses.push(course({ id: 'c6-hindi-kahani', classLevel: 6, subject: 'hindi' }), course({ id: 'c6-hindi-vyakaran', classLevel: 6, subject: 'hindi', order: 2 }));
  return out;
}

test('addresses come from the keys the catalog hands out — for any class number', () => {
  assert.equal(classPath('class-6'), '/classes/class-6');
  assert.equal(subjectPath('class-6', 'hindi'), '/classes/class-6/hindi');
  assert.equal(chapterPath('class-6', 'hindi', 'c6-hindi-kahani'), '/classes/class-6/hindi/c6-hindi-kahani');
  assert.equal(classPath('class-12'), '/classes/class-12');
  // Nothing in a key can break out of its segment.
  assert.equal(subjectPath('class-6', '../admin'), '/classes/class-6/..%2Fadmin');
});

test('regression, Classes 1–6: the same classes, in the same order, with Kid Games on or off — courses never depend on it', () => {
  for (const kidGamesOn of [true, false]) {
    const r = resolveCatalog(catalog(kidGamesOn));
    assert.deepEqual(r.classViews.map((c) => c.key), ['class-1', 'class-2', 'class-3', 'class-4', 'class-5', 'class-6']);
    for (const view of r.classViews) assert.equal(classPath(view.key), `/classes/${view.key}`);
    // The learning pages are never gated by a section; only the games are.
    for (const p of ['/courses', '/courses/c6-hindi-kahani', '/classes/class-6/hindi']) assert.equal(sectionForPath(p), null, p);
    assert.equal(sectionForPath(classGamesPath('class-1')), 'kid-games');
    const nav = openNavGroups(USER_NAV_GROUPS, r.isSectionOn).flatMap((g) => g.items.map((i) => i.href));
    assert.ok(nav.includes('/courses'), `Courses in the menu (Kid Games ${kidGamesOn ? 'on' : 'off'})`);
    assert.equal(nav.includes('/kid-games'), kidGamesOn);
  }
});

test('the admin order is the order everywhere: moving Class 6 first moves it first on every list', () => {
  const c = catalog(false);
  c.classes = c.classes.map((x) => (x.key === 'class-6' ? { ...x, order: 0 } : x));
  const r = resolveCatalog(c);
  assert.equal(r.classViews[0]!.key, 'class-6');
  assert.equal(classCards(r, false)[0]!.key, 'class-6', 'home page and /classes');
});

test('Kid Games off: the "My Classes" block stays on the dashboard (only the games blocks go)', () => {
  const on = resolveCatalog(catalog(true)).dashboardWidgets;
  const off = resolveCatalog(catalog(false)).dashboardWidgets;
  assert.ok(on.includes('classes') && on.includes('kid-games') && on.includes('learning'));
  assert.ok(off.includes('classes'), 'classes open without Kid Games');
  assert.ok(!off.includes('kid-games') && !off.includes('learning'), 'game progress goes with Kid Games');
});

test('class cards count what each class really has; games only while Kid Games is on', () => {
  const on = classCards(resolveCatalog(catalog(true)), true);
  const off = classCards(resolveCatalog(catalog(false)), false);
  const six = (cards: typeof on) => cards.find((c) => c.key === 'class-6')!;
  assert.equal(six(on).subjects, 1);
  assert.equal(six(on).chapters, 2);
  assert.equal(six(off).chapters, 2, 'chapters stay without Kid Games');
  assert.equal(off.find((c) => c.key === 'class-1')!.games, 0);
  assert.ok(on.find((c) => c.key === 'class-1')!.games > 0);
  // A hidden class leaves the cards; a new one (Class 7) joins them with no code change.
  const c = catalog(false);
  c.classes = c.classes.map((x) => (x.key === 'class-6' ? { ...x, isVisible: false } : x));
  c.classes.push(entry({ key: 'class-7', title: 'Class 7', classLevel: 7, order: 7 }));
  assert.deepEqual(classCards(resolveCatalog(c), false).map((x) => x.key), ['class-1', 'class-2', 'class-3', 'class-4', 'class-5', 'class-7']);
});

test('a subject is ready to study when it has chapters (games never count for that)', () => {
  assert.equal(subjectHasChapters({ chapters: [{}] }), true);
  assert.equal(subjectHasChapters({ chapters: [] }), false);
});

test('the class pages are public: no session check (and no 401) for visitors', () => {
  for (const p of ['/classes', '/classes/class-1', '/classes/class-6/hindi', '/classes/class-6/hindi/c6-hindi-kahani']) assert.equal(isPublicPath(p), true, p);
  for (const p of ['/classesx', '/kid-games/class-1', '/courses/c6-hindi-kahani', '/dashboard']) assert.equal(isPublicPath(p), false, p);
});

test('durations read naturally', () => {
  assert.equal(formatMinutes(45), '45 min');
  assert.equal(formatMinutes(120), '2 h');
  assert.equal(formatMinutes(492), '8 h 12 min');
});
