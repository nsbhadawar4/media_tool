import { LAST_LOOP_PROGRESS, PROGRESS_FINISHED, PROGRESS_YARD, isSafeIndex, loopIndex } from './layout';
import { applyMove, currentPlayer, getValidMoves } from './engine';
import type { BotLevel, GameState, PlayerColor } from './types';

/**
 * How many opponent tokens could land on this cell with a single roll (1–6 steps behind it on the
 * loop). Safe cells, the home column and the yard are never dangerous.
 */
export function threatsAt(state: GameState, color: PlayerColor, progress: number): number {
  if (progress < 0 || progress > LAST_LOOP_PROGRESS) return 0;
  const idx = loopIndex(color, progress);
  if (isSafeIndex(idx)) return 0;
  let threats = 0;
  for (const other of state.players) {
    if (other.color === color) continue;
    for (const t of other.tokens) {
      if (t.progress < 0 || t.progress > LAST_LOOP_PROGRESS) continue;
      const gap = (idx - loopIndex(other.color, t.progress) + 52) % 52;
      if (gap >= 1 && gap <= 6) threats += 1;
    }
  }
  return threats;
}

/**
 * Picks which token the bot moves. It only ever returns one of the engine's valid moves.
 *
 *  - easy:   any valid token at random.
 *  - medium: captures first, then leaving the yard, then pushing the furthest token on.
 *  - hard:   also values finishing, safe squares and the home column, steps out of danger, avoids
 *            landing where an opponent can hit it, and protects its most advanced tokens.
 */
export function chooseBotMove(state: GameState, die: number, level: BotLevel, rng: () => number = Math.random): number {
  const valid = getValidMoves(state, die);
  if (valid.length <= 1 || level === 'easy') return valid[Math.floor(rng() * valid.length)]!;

  const me = currentPlayer(state);
  let best = valid[0]!;
  let bestScore = -Infinity;
  for (const id of valid) {
    const { events, state: next } = applyMove(state, id);
    const from = events.from;
    const to = events.to;
    let score = rng(); // tie-breaker

    if (level === 'medium') {
      score += events.captures.length * 100;
      if (events.leftYard) score += 60;
      score += to * 0.5;
    } else {
      for (const c of events.captures) {
        const victim = state.players.find((p) => p.color === c.color)!.tokens[c.tokenId]!;
        score += 120 + victim.progress * 1.5;
      }
      if (events.reachedHome) score += 110;
      if (events.leftYard) score += 55;
      if (to > LAST_LOOP_PROGRESS && to < PROGRESS_FINISHED) score += 30; // inside the home column
      if (to <= LAST_LOOP_PROGRESS && to >= 0 && isSafeIndex(loopIndex(me.color, to))) score += 22;
      score += to * 0.7;
      if (to >= 40) score += (to - 40) * 0.8; // get the runners home

      // Danger: leaving a threatened square is good, landing on one is bad (worse the further it has come).
      const before = from === PROGRESS_YARD ? 0 : threatsAt(state, me.color, from);
      const after = threatsAt(next, me.color, to);
      score += before * (12 + from * 0.5);
      score -= after * (35 + to * 0.9);
    }
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}
