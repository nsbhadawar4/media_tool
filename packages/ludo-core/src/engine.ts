import {
  LAST_LOOP_PROGRESS,
  PROGRESS_FINISHED,
  PROGRESS_YARD,
  ALL_COLORS,
  SEATS,
  TOKENS_PER_PLAYER,
  isSafeIndex,
  loopIndex,
  progressSteps,
  tokenCell,
} from './layout';
import type { BonusReason, Capture, GameState, MoveEvents, MoveResult, Player, PlayerColor, PlayerCount, RollResult } from './types';

/**
 * Pure Ludo rules. No React, no hidden randomness: dice come from an injected rng.
 *
 *  - A token leaves the yard only on a 6, landing on its colour's start cell.
 *  - Progress: -1 yard, 0..50 main loop, 51..56 home column, 57 finished. An exact roll is needed to finish.
 *  - Extra turn (exactly one, whatever the combination) after rolling a 6, capturing an opponent's token,
 *    or bringing a token home — unless that move wins the game. Three sixes in a row forfeit the turn.
 *  - Captures: landing on a non-safe loop cell holding exactly ONE token of an opponent colour sends it to
 *    its yard. Two or more same-coloured tokens on a non-safe cell form a BLOCK and cannot be captured
 *    (the mover may still land there; the cell is then shared). Safe cells (4 start squares + 4 star
 *    squares) never capture. Own tokens may stack freely.
 *  - A player with all four tokens home has finished and takes no more turns. The first to finish wins.
 *    With 2 players that ends the game at once; with 3 or 4 the rest play on for the remaining places,
 *    and the game ends as soon as only one player is still playing.
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
  return { players, current: 0, phase: 'roll', die: null, sixes: 0, turns: 1, winner: null, ranking: [] };
}

/** A game for an explicit set of colours (online rooms). Turn order is clockwise round the board. */
export function createGameFromColors(colors: readonly PlayerColor[]): GameState {
  const seats = ALL_COLORS.filter((c) => colors.includes(c));
  const players: Player[] = seats.map((color) => ({
    color,
    tokens: Array.from({ length: TOKENS_PER_PLAYER }, (_, id) => ({ id, progress: PROGRESS_YARD })),
  }));
  return { players, current: 0, phase: 'roll', die: null, sixes: 0, turns: 1, winner: null, ranking: [] };
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

/** True once all four of the player's tokens are home. */
export function hasFinished(player: Player): boolean {
  return finishedCount(player) === TOKENS_PER_PLAYER;
}

/** The turn passes to the next player who is still playing (finished players are skipped). */
function advanceTurn(state: GameState): GameState {
  let next = state.current;
  for (let i = 0; i < state.players.length; i++) {
    next = (next + 1) % state.players.length;
    if (!hasFinished(state.players[next]!)) break;
  }
  return {
    ...state,
    current: next,
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

  // Decided from this move's own result (never from earlier state), right here — before any next turn
  // exists. A player who finishes takes no bonus turn; the game ends once at most one player is left.
  const finished = hasFinished(players[state.current]!);
  const ranking = finished ? [...state.ranking, mover.color] : state.ranking;
  const stillPlaying = players.filter((p) => !hasFinished(p));
  const won = finished && stillPlaying.length <= 1;
  const bonus: BonusReason[] = finished
    ? []
    : [...(die === 6 ? (['six'] as const) : []), ...(captures.length > 0 ? (['capture'] as const) : []), ...(to === PROGRESS_FINISHED ? (['home'] as const) : [])];
  const extraTurn = bonus.length > 0;
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
    finished,
    place: finished ? ranking.length : null,
    won,
    extraTurn,
    bonus,
  };

  // The one place the turn is decided after a move: game over, same player again, or the next player.
  // A bonus turn keeps the six count (so a third six still forfeits); a non-six roll already reset it.
  const base: GameState = { ...state, players, die: null, ranking };
  let next: GameState;
  if (won) {
    // The last player still playing takes the last place.
    const final = [...ranking, ...stillPlaying.map((p) => p.color)];
    next = { ...base, phase: 'over', ranking: final, winner: final[0]! };
  } else if (extraTurn) next = { ...base, phase: 'roll' };
  else next = advanceTurn(base);
  return { state: next, events };
}

/** What to tell the player who earned another turn (capture beats home beats six). */
export function extraTurnMessage(bonus: readonly BonusReason[] | undefined): string {
  if (!bonus || bonus.length === 0) return '';
  if (bonus.includes('capture')) return 'Captured! Roll again';
  if (bonus.includes('home')) return 'Token home! Roll again';
  return 'Rolled a 6! Roll again';
}
