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
