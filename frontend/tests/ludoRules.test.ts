import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LAST_LOOP_PROGRESS,
  PROGRESS_FINISHED,
  PROGRESS_YARD,
  applyMove,
  applyRoll,
  createGameFromColors,
  extraTurnMessage,
  isSafeIndex,
  loopIndex,
  type GameState,
  type PlayerColor,
} from 'ludo-core';

/** A two-player game (yellow to move, red waiting) with chosen token positions. */
function board(yellow: number[], red: number[]): GameState {
  const g = createGameFromColors(['yellow', 'red']);
  const set = (color: PlayerColor, at: number[]) =>
    g.players.find((p) => p.color === color)!.tokens.forEach((t, i) => (t.progress = at[i] ?? PROGRESS_YARD));
  set('yellow', yellow);
  set('red', red);
  return g;
}

/** Rolls `die` for yellow and moves token 0. */
function rollAndMove(state: GameState, die: number, tokenId = 0) {
  const r = applyRoll(state, die);
  assert.equal(r.kind, 'move');
  return applyMove(r.state, tokenId);
}

/** A yellow progress and a red progress that meet on a non-safe loop cell after `die` steps. */
function captureSpot(die: number): { from: number; redAt: number } {
  for (let from = 1; from + die <= LAST_LOOP_PROGRESS; from++) {
    const idx = loopIndex('yellow', from + die);
    if (isSafeIndex(idx)) continue;
    for (let q = 0; q <= LAST_LOOP_PROGRESS; q++) if (loopIndex('red', q) === idx) return { from, redAt: q };
  }
  throw new Error('no capture spot');
}

describe('Ludo turns', () => {
  it('a normal move (no six, no capture, not home) passes the turn', () => {
    const { state, events } = rollAndMove(board([5], []), 3);
    assert.equal(events.extraTurn, false);
    assert.deepEqual(events.bonus, []);
    assert.equal(state.players[state.current]!.color, 'red');
    assert.equal(state.phase, 'roll');
    assert.equal(state.turns, 2);
  });

  it('a capture gives the capturing player exactly one more turn', () => {
    const { from, redAt } = captureSpot(3);
    const { state, events } = rollAndMove(board([from], [redAt]), 3);
    assert.equal(events.captures.length, 1);
    assert.equal(events.extraTurn, true);
    assert.deepEqual(events.bonus, ['capture']);
    assert.equal(state.players[state.current]!.color, 'yellow', 'same player again');
    assert.equal(state.phase, 'roll', 'ready for a fresh roll');
    assert.equal(state.die, null);
    assert.equal(state.turns, 1, 'the turn did not advance');
    assert.equal(state.players.find((p) => p.color === 'red')!.tokens[0]!.progress, PROGRESS_YARD, 'captured token went home');
    assert.equal(extraTurnMessage(events.bonus), 'Captured! Roll again');
  });

  it('a token reaching home gives one more turn', () => {
    const { state, events } = rollAndMove(board([PROGRESS_FINISHED - 2, 10], []), 2);
    assert.equal(events.reachedHome, true);
    assert.equal(events.won, false);
    assert.deepEqual(events.bonus, ['home']);
    assert.equal(state.players[state.current]!.color, 'yellow');
    assert.equal(state.phase, 'roll');
    assert.equal(state.turns, 1);
  });

  it('the winning move ends the game with no extra turn', () => {
    const done = PROGRESS_FINISHED;
    const { state, events } = rollAndMove(board([done - 4, done, done, done], [3]), 4);
    assert.equal(events.won, true);
    assert.equal(events.extraTurn, false);
    assert.deepEqual(events.bonus, []);
    assert.equal(state.phase, 'over');
    assert.equal(state.winner, 'yellow');
    assert.throws(() => applyRoll(state, 3), /Cannot roll/, 'nobody can roll after the win');
  });

  it('a six still gives exactly one more turn, and three sixes still forfeit', () => {
    const one = rollAndMove(board([5], []), 6);
    assert.deepEqual(one.events.bonus, ['six']);
    assert.equal(one.state.current, 0);
    assert.equal(one.state.sixes, 1);
    const two = rollAndMove(one.state, 6);
    assert.equal(two.state.sixes, 2);
    const third = applyRoll(two.state, 6);
    assert.equal(third.kind, 'forfeit');
    assert.equal(third.state.players[third.state.current]!.color, 'red');
  });

  it('a six that also captures gives one extra turn, not two', () => {
    const { from, redAt } = captureSpot(6);
    const { state, events } = rollAndMove(board([from], [redAt]), 6);
    assert.deepEqual(events.bonus, ['six', 'capture']);
    assert.equal(events.extraTurn, true);
    assert.equal(state.current, 0);
    assert.equal(state.turns, 1);
    // The next roll is an ordinary one for the same player; a non-six then passes the turn.
    const after = rollAndMove(state, 2);
    assert.equal(after.state.players[after.state.current]!.color, 'red');
    assert.equal(after.state.turns, 2);
  });

  it('a move cannot be applied twice (a second tap after the move is refused)', () => {
    const r = applyRoll(board([5], []), 3);
    const first = applyMove(r.state, 0);
    assert.throws(() => applyMove(first.state, 0), /No move pending/);
  });
});
