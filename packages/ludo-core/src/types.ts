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
  winner: PlayerColor | null;
}

export interface Capture {
  color: PlayerColor;
  tokenId: number;
  /** Grid cell where the capture happened. */
  cell: Cell;
}

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
  won: boolean;
  extraTurn: boolean;
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
