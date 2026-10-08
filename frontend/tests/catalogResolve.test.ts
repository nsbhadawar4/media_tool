/**
 * How the admin-managed catalog changes what the app lists and lets people open. Enabled means
 * usable, visible means listed; archived entries are absent from the catalog and so unusable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCatalog, visibleSections } from '../lib/content/catalog';
import { buildCatalogSeed } from '../lib/content/catalogManifest';
import type { CatalogCourse, CatalogEntry, PublicCatalog } from '../lib/api/content';

/** The catalog as the server returns it straight after seeding. */
function entry(e: Partial<CatalogEntry> & { key: string }): CatalogEntry {
  return { title: e.key, description: '', order: 1, classLevel: null, subject: null, thumbnailUrl: null, glyph: null, difficulty: null, gameType: null, courseId: null, isEnabled: true, isVisible: true, ...e };
}
function course(c: Partial<CatalogCourse> & { id: string }): CatalogCourse {
  return { slug: c.id, title: c.id, summary: '', classLevel: 1, subject: 'math', thumbnailUrl: null, difficulty: null, ageGroup: null, lessonCount: 0, order: 1, isEnabled: true, isVisible: true, ...c };
}
function seeded(): PublicCatalog {
  const out: PublicCatalog = { sections: [], classes: [], subjects: [], classSubjects: [], kidGames: [], games: [], courses: [] };
  const group = { section: 'sections', class: 'classes', subject: 'subjects', class_subject: 'classSubjects', kid_game: 'kidGames', game: 'games' } as const;
  for (const e of buildCatalogSeed()) {
    out[group[e.type]].push(
      entry({ key: e.key, title: e.title, description: e.description, order: e.order, classLevel: e.classLevel ?? null, subject: e.subject ?? null, isVisible: e.isVisible ?? true, difficulty: e.difficulty ?? null, gameType: e.gameType ?? null }),
    );
  }
  return out;
}
const patch = (list: CatalogEntry[], key: string, p: Partial<CatalogEntry>) => list.map((e) => (e.key === key ? { ...e, ...p } : e));

test('without a catalog, the code catalog applies unchanged', () => {
  const r = resolveCatalog(null);
  assert.equal(r.fromServer, false);
  assert.deepEqual(r.classes, [1, 2, 3, 4, 5]);
  assert.equal(r.listedGames().length, 150);
  assert.equal(r.arcadeGames.length, 7);
});

test('a freshly seeded catalog changes nothing', () => {
  const r = resolveCatalog(seeded());
  assert.equal(r.fromServer, true);
  assert.equal(r.listedGames().length, 150);
  assert.deepEqual(r.subjects, ['hindi', 'english', 'math']);
});

test('disabled: not playable and not listed. Hidden: playable from a link, not listed', () => {
  const c = seeded();
  c.kidGames = patch(patch(c.kidGames, 'c1-math-math-quiz', { isEnabled: false }), 'c1-math-pattern-puzzle', { isVisible: false });
  const r = resolveCatalog(c);
  assert.equal(r.isGamePlayable('c1-math-math-quiz'), false);
  assert.equal(r.isGamePlayable('c1-math-pattern-puzzle'), true);
  const listed = r.listedGames(1, 'math').map((g) => g.id);
  assert.ok(!listed.includes('c1-math-math-quiz') && !listed.includes('c1-math-pattern-puzzle'));
  assert.equal(listed.length, 8);
});

test('archived (absent) entries are gone; a disabled class or subject takes its games with it', () => {
  const c = seeded();
  c.kidGames = c.kidGames.filter((g) => g.key !== 'c2-english-word-match');
  c.classes = patch(c.classes, 'class-3', { isEnabled: false });
  c.subjects = patch(c.subjects, 'hindi', { isVisible: false });
  const r = resolveCatalog(c);
  assert.equal(r.isGamePlayable('c2-english-word-match'), false);
  assert.equal(r.isClassAvailable(3), false);
  assert.equal(r.isGamePlayable('c3-math-math-quiz'), false);
  assert.ok(!r.classes.includes(3));
  assert.ok(!r.subjects.includes('hindi'));
  assert.equal(r.isGamePlayable('c1-hindi-hindi-quiz'), true, 'a hidden subject still plays');
  assert.equal(r.listedGames().filter((g) => g.subject === 'hindi').length, 0, '…but is not listed');
});

test('order and titles come from the catalog', () => {
  const c = seeded();
  c.kidGames = patch(patch(c.kidGames, 'c1-math-math-quiz', { order: 0, title: 'Big Maths Quiz' }), 'c1-math-number-runner', { order: 99 });
  c.classes = patch(c.classes, 'class-5', { order: 0 });
  c.games = patch(c.games, 'ludo', { order: 0, title: 'Ludo King' });
  const r = resolveCatalog(c);
  const math1 = r.listedGames(1, 'math');
  assert.equal(math1[0]!.id, 'c1-math-math-quiz');
  assert.equal(math1[0]!.title, 'Big Maths Quiz');
  assert.equal(math1.at(-1)!.id, 'c1-math-number-runner');
  assert.equal(r.classes[0], 5);
  assert.deepEqual([r.arcadeGames[0]!.slug, r.arcadeGames[0]!.name], ['ludo', 'Ludo King']);
});

test('arcade games: disabled ones are not playable; entries without code are never listed', () => {
  const c = seeded();
  c.games = [...patch(c.games, 'snake', { isEnabled: false }), entry({ key: 'chess', title: 'Chess', order: 8 })];
  const r = resolveCatalog(c);
  assert.equal(r.isArcadePlayable('snake'), false);
  assert.equal(r.isArcadePlayable('chess'), false, 'no code for it');
  assert.ok(!r.arcadeGames.some((g) => g.slug === 'chess' || g.slug === 'snake'));
});

test('home sections: in the catalog order, skipping hidden or disabled ones', () => {
  const implemented = ['hero', 'features', 'pricing', 'faq', 'cta'];
  assert.deepEqual(visibleSections(null, implemented, ['pricing']), ['hero', 'features', 'faq', 'cta'], 'no catalog: the code default');
  const c = seeded();
  c.sections = patch(patch(c.sections, 'pricing', { isVisible: true, order: 0 }), 'faq', { isEnabled: false });
  assert.deepEqual(visibleSections(c, implemented), ['pricing', 'hero', 'features', 'cta']);
});

test('a class subject switched off removes exactly that: Class 2 Maths, not Class 2 or Maths elsewhere', () => {
  const c = seeded();
  c.classSubjects = patch(c.classSubjects, 'class-2-math', { isEnabled: false });
  const r = resolveCatalog(c);
  assert.equal(r.isPairAvailable(2, 'math'), false);
  assert.deepEqual(r.subjectsFor(2).map((s) => s.key), ['hindi', 'english']);
  assert.deepEqual(r.subjectsFor(3).map((s) => s.key), ['hindi', 'english', 'math']);
  assert.equal(r.listedGames(2, 'math').length, 0);
  assert.equal(r.isGamePlayable('c2-math-math-quiz'), false);
  assert.equal(r.isGamePlayable('c2-english-english-quiz'), true);
  assert.equal(r.isGamePlayable('c3-math-math-quiz'), true);
});

test('a hidden class subject is unlisted but still opens; subjects keep their admin order per class', () => {
  const c = seeded();
  c.classSubjects = patch(c.classSubjects, 'class-1-hindi', { isVisible: false });
  c.subjects = patch(c.subjects, 'math', { order: 0 });
  const r = resolveCatalog(c);
  assert.deepEqual(r.subjectsFor(1).map((s) => s.key), ['math', 'english']);
  assert.equal(r.isPairAvailable(1, 'hindi'), true);
  assert.equal(r.listedGames(1, 'hindi').length, 0);
});

test('a database-only class and subject appear, with their courses — before any game exists for them', () => {
  const c = seeded();
  c.classes.push(entry({ key: 'class-6', title: 'Class 6', classLevel: 6, order: 6, description: 'Bigger challenges' }));
  c.subjects.push(entry({ key: 'science', title: 'Science', glyph: '🔬', order: 4 }));
  c.classSubjects.push(entry({ key: 'class-6-science', classLevel: 6, subject: 'science' }));
  c.courses.push(course({ id: 'plants', title: 'Plants', classLevel: 6, subject: 'science', order: 1 }), course({ id: 'off', title: 'Off', classLevel: 6, subject: 'science', isEnabled: false }));
  const r = resolveCatalog(c);
  const six = r.classViews.find((v) => v.level === 6)!;
  assert.deepEqual([six.isCode, six.title], [false, 'Class 6']);
  assert.equal(r.classBySlug('class-6')?.level, 6);
  assert.deepEqual(r.subjectsFor(6).map((s) => [s.key, s.isCode, s.glyph]), [['science', false, '🔬']]);
  assert.deepEqual(r.coursesFor(6, 'science').map((x) => x.id), ['plants'], 'disabled courses are not listed');
  assert.equal(r.classes.includes(6 as never), false, 'code-only lists stay code-only');
});

test('a course switched off takes its games with it; other games are unaffected', () => {
  const c = seeded();
  c.courses.push(course({ id: 'counting', classLevel: 1, subject: 'math' }));
  c.kidGames = patch(c.kidGames, 'c1-math-math-quiz', { courseId: 'counting' });
  let r = resolveCatalog(c);
  assert.deepEqual(r.gamesInCourse('counting').map((g) => g.id), ['c1-math-math-quiz']);
  c.courses = [course({ id: 'counting', classLevel: 1, subject: 'math', isEnabled: false })];
  r = resolveCatalog(c);
  assert.equal(r.isGamePlayable('c1-math-math-quiz'), false);
  assert.equal(r.isGamePlayable('c1-math-number-runner'), true);
  assert.equal(r.listedGames(1, 'math').length, 9);
});

test('without a catalog, the hierarchy is the code one', () => {
  const r = resolveCatalog(null);
  assert.deepEqual(r.classViews.map((v) => v.level), [1, 2, 3, 4, 5]);
  assert.deepEqual(r.subjectsFor(1).map((s) => s.key), ['hindi', 'english', 'math']);
  assert.equal(r.classBySlug('class-6'), null);
  assert.equal(r.isPairAvailable(2, 'math'), true);
});
