import {
  LAST_LOOP_PROGRESS,
  PROGRESS_FINISHED,
  PROGRESS_YARD,
  SEATS,
  TOKENS_PER_PLAYER,
  isSafeIndex,
  loopIndex,
  progressSteps,
  tokenCell,
} from './ludoLayout';
import type { Capture, GameState, MoveEvents, MoveResult, Player, PlayerCount, RollResult } from './ludoTypes';

/**
 * Pure Ludo rules. No React, no hidden randomness: dice come from an injected rng.
 *
 *  - A token leaves the yard only on a 6, landing on its colour's start cell.
 *  - Progress: -1 yard, 0..50 main loop, 51..56 home column, 57 finished. An exact roll is needed to finish.
 *  - Extra turn on a 6 only (not on capture / reaching home). Three sixes in a row forfeit the turn.
 *  - Captures: landing on a non-safe loop cell holding exactly ONE token of an opponent colour sends it to
 *    its yard. Two or more same-coloured tokens on a non-safe cell form a BLOCK and cannot be captured
 *    (the mover may still land there; the cell is then shared). Safe cells (4 start squares + 4 star
 *    squares) never capture. Own tokens may stack freely.
 *  - First player with all four tokens finished wins.
 */

/** Uniform die roll 1..6 from a [0,1) rng. */
export function rollDie(rng: () => number): number {
  return Math.min(6, Math.floor(rng() * 6) + 1);
}

export function createGame(playerCount: PlayerCount): GameState {
  const players: Player[] = SEATS[playerCount].map((color) => ({
    color,
    tokens: Array.from({ length: TOKENS_PER_PLAYER }, (_, id) => ({ id, progress: PROGRESS_YARD })),
  }));
  return { players, current: 0, phase: 'roll', die: null, sixes: 0, turns: 1, winner: null };
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.current]!;
}

export function finishedCount(player: Player): number {
  return player.tokens.filter((t) => t.progress === PROGRESS_FINISHED).length;
}

/** Token ids of the current player that may move `die` steps. */
export function getValidMoves(state: GameState, die: number): number[] {
  if (state.phase === 'over') return [];
  return currentPlayer(state)
    .tokens.filter((t) => {
      if (t.progress === PROGRESS_YARD) return die === 6;
      if (t.progress >= PROGRESS_FINISHED) return false;
      return t.progress + die <= PROGRESS_FINISHED;
    })
    .map((t) => t.id);
}

function advanceTurn(state: GameState): GameState {
  return {
    ...state,
    current: (state.current + 1) % state.players.length,
    phase: 'roll',
    die: null,
    sixes: 0,
    turns: state.turns + 1,
  };
}

/** Applies a rolled die: asks for a token choice, or passes the turn (no moves / third six). */
export function applyRoll(state: GameState, die: number): RollResult {
  if (state.phase !== 'roll') throw new Error('Cannot roll now');
  const sixes = die === 6 ? state.sixes + 1 : 0;
  if (sixes >= 3) return { kind: 'forfeit', die, state: advanceTurn(state) };
  const rolled: GameState = { ...state, die, sixes };
  if (getValidMoves(rolled, die).length === 0) return { kind: 'no-moves', die, state: advanceTurn(rolled) };
  return { kind: 'move', die, state: { ...rolled, phase: 'move' } };
}

/** Convenience: roll with an rng and apply. */
export function rollDice(state: GameState, rng: () => number): RollResult {
  return applyRoll(state, rollDie(rng));
}

export function applyMove(state: GameState, tokenId: number): MoveResult {
  const die = state.die;
  if (state.phase !== 'move' || die === null) throw new Error('No move pending');
  if (!getValidMoves(state, die).includes(tokenId)) throw new Error('Invalid move');

  const mover = currentPlayer(state);
  const from = mover.tokens[tokenId]!.progress;
  const to = from === PROGRESS_YARD ? 0 : from + die;

  const captures: Capture[] = [];
  if (to <= LAST_LOOP_PROGRESS) {
    const idx = loopIndex(mover.color, to);
    if (!isSafeIndex(idx)) {
      for (const other of state.players) {
        if (other.color === mover.color) continue;
        const there = other.tokens.filter(
          (t) => t.progress >= 0 && t.progress <= LAST_LOOP_PROGRESS && loopIndex(other.color, t.progress) === idx,
        );
        // Exactly one token is capturable; two or more are a block.
        if (there.length === 1) {
          captures.push({ color: other.color, tokenId: there[0]!.id, cell: tokenCell(mover.color, to) });
        }
      }
    }
  }

  const players: Player[] = state.players.map((p) => ({
    color: p.color,
    tokens: p.tokens.map((t) => {
      if (p.color === mover.color && t.id === tokenId) return { ...t, progress: to };
      if (captures.some((c) => c.color === p.color && c.tokenId === t.id)) return { ...t, progress: PROGRESS_YARD };
      return t;
    }),
  }));

  const won = finishedCount(players[state.current]!) === TOKENS_PER_PLAYER;
  const extraTurn = die === 6 && !won;
  const steps = progressSteps(from, to);
  const events: MoveEvents = {
    color: mover.color,
    tokenId,
    from,
    to,
    steps: steps.map((p) => tokenCell(mover.color, p)),
    progressSteps: steps,
    captures,
    leftYard: from === PROGRESS_YARD,
    reachedHome: to === PROGRESS_FINISHED,
    won,
    extraTurn,
  };

  const base: GameState = { ...state, players, die: null };
  let next: GameState;
  if (won) next = { ...base, phase: 'over', winner: mover.color };
  else if (extraTurn) next = { ...base, phase: 'roll' };
  else next = advanceTurn(base);
  return { state: next, events };
}
