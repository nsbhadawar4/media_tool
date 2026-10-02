import type { Capture, GameState, PlayerColor } from './types';

/** Characters for room codes: no O, 0, I, 1 or L, which read alike. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
export const NAME_MAX = 16;

/** Order colours are handed out in when a player joins. */
export const DEFAULT_COLOR_ORDER: readonly PlayerColor[] = ['yellow', 'green', 'blue', 'red'];

export type RoomStatus = 'lobby' | 'starting' | 'playing' | 'finished';

export interface PlayerPublic {
  id: string;
  name: string;
  color: PlayerColor;
  ready: boolean;
  host: boolean;
  connected: boolean;
  /** Gone for good during a game: the server plays their seat. */
  left: boolean;
}

export interface GameSnapshot {
  state: GameState;
  /** Increments with every game event; clients use it to detect a missed one. */
  seq: number;
}

export interface RoomState {
  code: string;
  status: RoomStatus;
  hostId: string;
  players: PlayerPublic[];
  game: GameSnapshot | null;
  serverTime: number;
}

/** Everything the server tells a room about a game, in order. `state` is the state AFTER the event. */
export type GameEvent =
  | { type: 'DICE_ROLLED'; seq: number; color: PlayerColor; die: number; kind: 'move' | 'no-moves' | 'forfeit'; state: GameState }
  | {
      type: 'TOKEN_MOVED';
      seq: number;
      color: PlayerColor;
      tokenId: number;
      from: number;
      to: number;
      progressSteps: number[];
      captures: Capture[];
      reachedHome: boolean;
      extraTurn: boolean;
      won: boolean;
      state: GameState;
    }
  | { type: 'TURN_CHANGED'; seq: number; color: PlayerColor; state: GameState }
  | { type: 'GAME_WON'; seq: number; color: PlayerColor; state: GameState };

export interface Ack<T = undefined> {
  ok: boolean;
  /** Human-readable, safe to show to a player. */
  error?: string;
  data?: T;
}

export interface JoinData {
  playerId: string;
  room: RoomState;
}

/** Client → server. Every one is an intent; the server decides what happens. */
export interface ClientToServer {
  'room:create': (p: { name: string; playerId?: string }, ack: (a: Ack<JoinData>) => void) => void;
  'room:join': (p: { code: string; name: string; playerId?: string }, ack: (a: Ack<JoinData>) => void) => void;
  'room:sync': (ack: (a: Ack<RoomState>) => void) => void;
  'room:color': (p: { color: PlayerColor }, ack: (a: Ack) => void) => void;
  'room:ready': (p: { ready: boolean }, ack: (a: Ack) => void) => void;
  'room:start': (ack: (a: Ack) => void) => void;
  'room:leave': (ack?: (a: Ack) => void) => void;
  'room:close': (ack: (a: Ack) => void) => void;
  'room:restart': (ack: (a: Ack) => void) => void;
  'game:roll': (ack: (a: Ack) => void) => void;
  'game:move': (p: { tokenId: number }, ack: (a: Ack) => void) => void;
}

/** Server → client. */
export interface ServerToClient {
  'room:state': (room: RoomState) => void;
  'game:event': (event: GameEvent) => void;
  'room:closed': (p: { reason: string }) => void;
  notice: (p: { kind: 'info' | 'error'; text: string }) => void;
}
