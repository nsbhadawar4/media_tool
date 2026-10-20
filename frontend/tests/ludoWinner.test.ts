/**
 * Ludo end of game: with 2 players the first to bring all four tokens home ends the game at once; with
 * 3 or 4 a finished player leaves the turn order and the rest play on until only one is left. Game over
 * is decided by the move itself (never by a later turn), nothing can be played after it, and a finished
 * game survives a refresh as finished.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PROGRESS_FINISHED as H, PROGRESS_YARD, applyMove, applyRoll, createGameFromColors, getValidMoves, type GameState, type PlayerColor } from 'ludo-core';
import { chooseBotMove } from 'ludo-core/bot';
import { loadLudoSession, parseGameState, saveLudoSession, LUDO_SESSION_KEY } from '../components/games/ludo/persistence';

/** A game with chosen token positions; `current` has the turn. */
function board(colors: PlayerColor[], at: Partial<Record<PlayerColor, number[]>>, current: PlayerColor = colors[0]!, ranking: PlayerColor[] = []): GameState {
  const g = createGameFromColors(colors);
  for (const p of g.players) p.tokens.forEach((t, i) => (t.progress = at[p.color]?.[i] ?? PROGRESS_YARD));
  return { ...g, current: g.players.findIndex((p) => p.color === current), ranking };
}
const color = (s: GameState) => s.players[s.current]!.color;
function play(state: GameState, die: number, tokenId = 3) {
  const r = applyRoll(state, die);
  assert.equal(r.kind, 'move');
  return applyMove(r.state, tokenId);
}
const LAST = [H, H, H, H - 1];

describe('2 players: the first to finish ends the game at once', () => {
  for (const who of ['yellow', 'red'] as const) {
    it(`${who} brings the 4th token home → over, ${who} wins, nothing more can be played`, () => {
      const other = who === 'yellow' ? 'red' : 'yellow';
      const { state, events } = play(board(['yellow', 'red'], { [who]: LAST, [other]: [5, 10] }, who), 1);
      assert.equal(events.finished, true);
      assert.equal(events.place, 1);
      assert.equal(events.won, true);
      assert.equal(events.extraTurn, false);
      assert.equal(state.phase, 'over');
      assert.equal(state.winner, who);
      assert.deepEqual(state.ranking, [who, other]);
      assert.equal(color(state), who, 'the turn never passed on');
      assert.throws(() => applyRoll(state, 6), /Cannot roll/);
      assert.deepEqual(getValidMoves(state, 6), []);
    });
  }

  it('a bot finishing (its own chosen move) ends the game the same way, and the bot has nothing left to play', () => {
    const s = board(['yellow', 'red'], { yellow: [5], red: LAST }, 'red');
    const rolled = applyRoll(s, 1).state;
    const { state } = applyMove(rolled, chooseBotMove(rolled, 1, 'hard'));
    assert.equal(state.phase, 'over');
    assert.equal(state.winner, 'red');
    assert.deepEqual(getValidMoves(state, 6), []);
  });
});

describe('3 and 4 players: finished players drop out, the rest play on', () => {
  it('3 players: yellow finishes 1st → game continues with green and red; yellow never gets a turn again', () => {
    const { state, events } = play(board(['yellow', 'green', 'red'], { yellow: LAST, green: [5], red: [9] }), 1);
    assert.equal(events.finished, true);
    assert.equal(events.place, 1);
    assert.equal(events.won, false);
    assert.equal(events.extraTurn, false, 'no bonus turn for a finished player');
    assert.equal(state.phase, 'roll');
    assert.equal(state.winner, null);
    assert.deepEqual(state.ranking, ['yellow']);
    assert.equal(color(state), 'green');
    // Green's turn passes: yellow is skipped, red is next, then green again.
    const afterGreen = applyRoll(state, 2).state;
    assert.equal(color(afterGreen.phase === 'move' ? applyMove(afterGreen, 0).state : afterGreen), 'red');
  });

  it('3 players: the second to finish ends the game (one left) — ranking 1st, 2nd, 3rd; winner is the 1st', () => {
    const s = board(['yellow', 'green', 'red'], { yellow: [H, H, H, H], green: [5], red: LAST }, 'red', ['yellow']);
    const { state, events } = play(s, 1);
    assert.equal(events.finished, true);
    assert.equal(events.place, 2);
    assert.equal(events.won, true);
    assert.equal(state.phase, 'over');
    assert.equal(state.winner, 'yellow', 'the first finisher wins, not the mover');
    assert.deepEqual(state.ranking, ['yellow', 'red', 'green']);
    assert.throws(() => applyRoll(state, 6), /Cannot roll/);
  });

  it('4 players: one finishes → three play on; two finished → two play on; third finish → over', () => {
    const s = board(['yellow', 'green', 'red', 'blue'], { yellow: LAST, green: LAST, red: LAST, blue: [3] });
    let r = play(s, 1);
    assert.deepEqual([r.state.phase, r.state.ranking, color(r.state)], ['roll', ['yellow'], 'green']);
    r = play(r.state, 1);
    assert.deepEqual([r.state.phase, r.state.ranking, color(r.state)], ['roll', ['yellow', 'green'], 'red']);
    r = play(r.state, 1);
    assert.equal(r.events.won, true);
    assert.equal(r.state.phase, 'over');
    assert.equal(r.state.winner, 'yellow');
    assert.deepEqual(r.state.ranking, ['yellow', 'green', 'red', 'blue']);
  });

  it('turns skip every finished player, whichever seat they sit in', () => {
    // Green (finished) sits between yellow and red: after yellow's turn comes red.
    const s = board(['yellow', 'green', 'red', 'blue'], { yellow: [5], green: [H, H, H, H], red: [7], blue: [9] }, 'yellow', ['green']);
    const r = applyRoll(s, 2);
    const next = r.kind === 'move' ? applyMove(r.state, 0).state : r.state;
    assert.equal(color(next), 'red');
  });
});

describe('a finished game is saved and restored as finished', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as unknown as Storage;
  };

  it('over + winner + ranking round-trips; nothing resumes play', () => {
    const { state } = play(board(['yellow', 'red'], { yellow: LAST, red: [5] }), 1);
    const storage = memory();
    saveLudoSession(
      { gameMode: 'bot', local: { config: { count: 2, mode: 'bot', level: 'easy' }, controllers: { yellow: 'human', green: 'human', red: 'bot', blue: 'human' }, state, shownDie: 1, tally: { moves: 9, captures: 0 }, seconds: 60, elapsedMs: 60000 } },
      storage,
    );
    const read = loadLudoSession(storage);
    assert.equal(read.kind, 'valid');
    const back = read.kind === 'valid' ? read.session.local!.state : null;
    assert.equal(back?.phase, 'over');
    assert.equal(back?.winner, 'yellow');
    assert.deepEqual(back?.ranking, ['yellow', 'red']);
    assert.ok(storage.getItem(LUDO_SESSION_KEY));
  });

  it('a mid-game 3-player save keeps who has finished; impossible combinations are refused', () => {
    const mid = play(board(['yellow', 'green', 'red'], { yellow: LAST, green: [5], red: [9] }), 1).state;
    assert.deepEqual(parseGameState(JSON.parse(JSON.stringify(mid)))?.ranking, ['yellow']);
    // A finished player holding the turn, or a ranking that disagrees with the tokens, is corrupt.
    assert.equal(parseGameState({ ...mid, current: 0 }), null);
    assert.equal(parseGameState({ ...mid, ranking: [] }), null);
    assert.equal(parseGameState({ ...mid, ranking: ['yellow', 'yellow'] }), null);
  });

  it('saves from before the finishing order existed still load', () => {
    const { state } = play(board(['yellow', 'red'], { yellow: LAST, red: [5] }), 1);
    const legacy: Record<string, unknown> = { ...state };
    delete legacy.ranking;
    assert.deepEqual(parseGameState(legacy)?.ranking, ['yellow']);
    const fresh: Record<string, unknown> = { ...createGameFromColors(['yellow', 'red']) };
    delete fresh.ranking;
    assert.deepEqual(parseGameState(fresh)?.ranking, []);
  });
});
