/**
 * The browser and the server must agree on every game: its id, its difficulty and what it is
 * worth. The server's copy (backend/src/kidGames/rules.ts) is what scores are saved against, so
 * if the catalogue here ever drifts from it, a game would show one thing and pay another.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALL_GAMES, TEMPLATES, XP_BY_DIFFICULTY } from '../lib/kid-games/catalog';
import { levelFor, starsFor } from '../lib/kid-games/progress-rules';
import * as server from '../../backend/src/kidGames/rules';

test('every catalogue game is a game the server knows, with the same difficulty and XP', () => {
  for (const game of ALL_GAMES) {
    const info = server.parseGameId(game.id);
    assert.ok(info, `${game.id} is unknown to the server`);
    assert.equal(info.difficulty, game.difficulty, game.id);
    assert.equal(info.baseXp, game.xp, game.id);
  }
  for (const subject of server.KID_SUBJECTS) {
    assert.deepEqual(TEMPLATES[subject].map((t) => t.slot), [...server.KID_SLOTS[subject]], subject);
  }
  assert.deepEqual(XP_BY_DIFFICULTY, server.XP_BY_DIFFICULTY);
});

test('stars are shown exactly as the server awards them', () => {
  for (let score = 0; score <= 100; score++) assert.equal(starsFor(score), server.starsFor(score), `score ${score}`);
});

test('levels need 200 XP, then 100 more each time', () => {
  assert.deepEqual(levelFor(0), { level: 1, current: 0, needed: 200 });
  assert.deepEqual(levelFor(250), { level: 2, current: 50, needed: 300 });
  assert.deepEqual(levelFor(500), { level: 3, current: 0, needed: 400 });
});

test('"Next up" offers only a game the catalog lists, in the administrator\'s order', async () => {
  const { nextInSubject } = await import('../lib/kid-games/progress');
  const { ALL_GAMES } = await import('../lib/kid-games/catalog');
  const englishClass1 = ALL_GAMES.filter((g) => g.classLevel === 1 && g.subject === 'english');
  const none = { games: {} };
  // Everything listed: the first game.
  assert.equal(nextInSubject(none, 1, 'english', englishClass1)?.id, englishClass1[0].id);
  // The first game switched off by an administrator: never offered.
  assert.equal(nextInSubject(none, 1, 'english', englishClass1.slice(1))?.id, englishClass1[1].id);
  // Reordered: the administrator's first game leads.
  const reordered = [englishClass1[1], englishClass1[0], ...englishClass1.slice(2)];
  assert.equal(nextInSubject(none, 1, 'english', reordered)?.id, englishClass1[1].id);
  // Completed games are skipped; with all of them switched off there is nothing to offer.
  assert.equal(nextInSubject({ games: { [englishClass1[0].id]: { completed: true } } } as never, 1, 'english', englishClass1)?.id, englishClass1[1].id);
  assert.equal(nextInSubject(none, 1, 'english', []), undefined);
});
