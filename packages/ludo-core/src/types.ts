export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow';
export type PlayerCount = 2 | 3 | 4;

/** [col, row] on the 15x15 grid. May be fractional (yard slots, finish triangles). */
export type Cell = readonly [col: number, row: number];

export interface Token {
  /** 0..3 within its player. */
  id: number;
  /** -1 yard, 0..50 main loop (relative to the colour start), 51..56 home column, 57 finished. */
  progress: number;
}

export interface Player {
  color: PlayerColor;
  tokens: Token[];
}

export type Phase = 'roll' | 'move' | 'over';

export interface GameState {
  players: Player[];
  /** Index into `players` of whoever has the turn. */
  current: number;
  phase: Phase;
  /** Last die rolled this turn (valid while phase === 'move'). */
  die: number | null;
  /** Consecutive sixes rolled by the current player. */
  sixes: number;
  /** 1-based count of turns (incremented whenever the turn passes to another player). */
  turns: number;
  /**
   * Set only when the game is over: the player who finished first (ranking[0]). With 2 players the
   * first to bring all four tokens home ends the game; with 3 or 4 the others play on until one is left.
   */
  winner: PlayerColor | null;
  /** Colours in the order they brought all four tokens home (finished players take no more turns). When the game is over, the last active player is appended. */
  ranking: PlayerColor[];
}

export interface Capture {
  color: PlayerColor;
  tokenId: number;
  /** Grid cell where the capture happened. */
  cell: Cell;
}

/** Why a move earned another turn. */
export type BonusReason = 'six' | 'capture' | 'home';

export interface MoveEvents {
  color: PlayerColor;
  tokenId: number;
  from: number;
  to: number;
  /** Grid cells the token visits, in order (excludes the origin). */
  steps: Cell[];
  /** Progress value after each step (same length as `steps`). */
  progressSteps: number[];
  captures: Capture[];
  leftYard: boolean;
  reachedHome: boolean;
  /** This move brought the mover's fourth token home: they finished, in place `place` (1-based). */
  finished: boolean;
  place: number | null;
  /** This move ended the game (the winner is `state.winner`, not necessarily the mover). */
  won: boolean;
  extraTurn: boolean;
  /** Every reason this move earned the (single) extra turn; empty when the turn passes or the game is won. */
  bonus: BonusReason[];
}

export interface MoveResult {
  state: GameState;
  events: MoveEvents;
}

export interface RollResult {
  /** 'move': player must pick a token. 'no-moves' / 'forfeit': the returned state already has the turn passed on. */
  kind: 'move' | 'no-moves' | 'forfeit';
  die: number;
  state: GameState;
}

/** Who plays a seat. */
export type Controller = 'human' | 'bot';
export type BotLevel = 'easy' | 'medium' | 'hard';
export type GameMode = 'local' | 'bot';
