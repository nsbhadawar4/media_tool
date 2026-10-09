/**
 * The database catalog is seeded from backend/src/content/catalogSeed.ts, which is generated from
 * the code catalog (scripts/export-catalog.ts). If someone adds a game or class in code and
 * forgets to regenerate, the admin panel would never see it — this catches that.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogSeed, isImplemented } from '../lib/content/catalogManifest';
import { CATALOG_SEED } from '../../backend/src/content/catalogSeed';

test('the backend seed matches the catalog the code implements (run scripts/export-catalog.ts)', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(CATALOG_SEED)), JSON.parse(JSON.stringify(buildCatalogSeed())));
});

test('every kind of content is present, and keys are unique per type', () => {
  const seed = buildCatalogSeed();
  const counts = Object.fromEntries(['section', 'class', 'subject', 'class_subject', 'kid_game', 'game'].map((t) => [t, seed.filter((e) => e.type === t).length]));
  assert.deepEqual(counts, { section: 14, class: 5, subject: 3, class_subject: 15, kid_game: 150, game: 7 });
  // Every built-in game carries the difficulty and mechanic its content was written for.
  assert.ok(seed.filter((e) => e.type === 'kid_game').every((e) => e.difficulty && e.gameType));
  assert.equal(new Set(seed.map((e) => `${e.type}:${e.key}`)).size, seed.length);
  assert.ok(isImplemented('game', 'ludo'));
  assert.ok(!isImplemented('game', 'chess'), 'an admin-added entry without code is not implemented');
});
