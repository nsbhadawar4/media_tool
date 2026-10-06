/**
 * Pure display rules shared by the UI and the tests. They mirror the server
 * (backend/src/kidGames/rules.ts); tests/kidGamesRules.test.ts keeps the two equal.
 */

/** 90%+ three stars, 70%+ two, 50%+ one. */
export function starsFor(score: number): number {
  if (score >= 90) return 3;
  if (score >= 70) return 2;
  if (score >= 50) return 1;
  return 0;
}

export interface LevelInfo {
  level: number;
  current: number;
  needed: number;
}

/** Level 1 needs 200 XP, and each level after needs 100 more than the last. */
export function levelFor(xp: number): LevelInfo {
  let level = 1;
  let needed = 200;
  let rest = xp;
  while (rest >= needed) {
    rest -= needed;
    level += 1;
    needed += 100;
  }
  return { level, current: rest, needed };
}
