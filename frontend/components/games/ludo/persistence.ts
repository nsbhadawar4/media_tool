import {
  ALL_COLORS,
  MAX_PLAYERS,
  PROGRESS_FINISHED,
  PROGRESS_YARD,
  TOKENS_PER_PLAYER,
  getValidMoves,
  type BotLevel,
  type Controller,
  type GameMode,
  type GameState,
  type PlayerColor,
  type PlayerCount,
  type PlayerPublic,
  type RoomState,
  type RoomStatus,
} from 'ludo-core';

/**
 * Everything about a resumable Ludo game lives under ONE storage key, validated on the way in.
 * Storage code is deliberately kept out of the components: they call these four helpers.
 *
 * What is stored depends on the mode:
 *  - local / bot: the whole logical game (the browser is the only place it exists);
 *  - multiplayer: recovery metadata (room, player identity) plus the last room snapshot as a
 *    temporary fallback. The SERVER stays authoritative; a reconnect always replaces the snapshot.
 *
 * Only logical state is stored (never mid-animation positions), and only when it changes.
 */
export const LUDO_SESSION_KEY = 'media-tool:ludo:session';
export const LUDO_SESSION_VERSION = 1;
/**
 * How long a saved game can be resumed. For now a game is kept until the player quits it, so there is
 * no limit; set a number of milliseconds (e.g. 24 * 60 * 60 * 1000) here to add one later.
 */
export const LUDO_SESSION_TTL_MS: number = Number.POSITIVE_INFINITY;

export type LudoSessionMode = 'local' | 'bot' | 'multiplayer';

export interface PersistedLocalGame {
  config: { count: PlayerCount; mode: GameMode; level: BotLevel };
  controllers: Record<PlayerColor, Controller>;
  state: GameState;
  /** The face the dice is showing (kept even when the turn has already passed on). */
  shownDie: number | null;
  tally: { moves: number; captures: number };
  /** Set once a winner exists. */
  seconds: number;
  /** Play time so far, so the clock continues after a refresh. */
  elapsedMs: number;
}

export interface PersistedLudoSession {
  version: number;
  updatedAt: number;
  gameMode: LudoSessionMode;
  /** Multiplayer identity: who this tab is in which room. */
  roomCode?: string;
  playerId?: string;
  playerName?: string;
  /** Local and bot games. */
  local?: PersistedLocalGame;
  /** Multiplayer: last known room, shown only until the server answers. */
  lastRoom?: RoomState;
}

export type SessionRead =
  | { kind: 'none' }
  | { kind: 'expired'; session: PersistedLudoSession }
  | { kind: 'valid'; session: PersistedLudoSession };

// ---------------------------------------------------------------------------- validation

const COLORS = new Set<string>(ALL_COLORS);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isColor = (v: unknown): v is PlayerColor => typeof v === 'string' && COLORS.has(v);

/** Rebuilds a GameState from untrusted data, or returns null if any part of it is impossible. */
export function parseGameState(raw: unknown): GameState | null {
  if (!isObj(raw) || !Array.isArray(raw.players)) return null;
  if (!isInt(raw.players.length, 2, MAX_PLAYERS)) return null;
  const seen = new Set<string>();
  const players: GameState['players'] = [];
  for (const p of raw.players) {
    if (!isObj(p) || !isColor(p.color) || seen.has(p.color) || !Array.isArray(p.tokens)) return null;
    if (p.tokens.length !== TOKENS_PER_PLAYER) return null;
    seen.add(p.color);
    const tokens: GameState['players'][number]['tokens'] = [];
    for (let i = 0; i < p.tokens.length; i++) {
      const t = p.tokens[i];
      if (!isObj(t) || t.id !== i || !isInt(t.progress, PROGRESS_YARD, PROGRESS_FINISHED)) return null;
      tokens.push({ id: i, progress: t.progress });
    }
    players.push({ color: p.color, tokens });
  }
  const { current, phase, die, sixes, turns, winner } = raw;
  if (!isInt(current, 0, players.length - 1)) return null;
  if (phase !== 'roll' && phase !== 'move' && phase !== 'over') return null;
  if (die !== null && !isInt(die, 1, 6)) return null;
  if (!isInt(sixes, 0, 2) || !isInt(turns, 1, 1_000_000)) return null;
  if (winner !== null && !isColor(winner)) return null;
  const state: GameState = { players, current, phase, die: die as number | null, sixes, turns, winner: winner as PlayerColor | null };

  // Cross-checks: a state the engine could never have produced is treated as corrupt.
  if (phase === 'over') {
    if (!winner || !players.some((p) => p.color === winner)) return null;
  } else {
    if (winner !== null) return null;
    const allHome = players[current]!.tokens.every((t) => t.progress === PROGRESS_FINISHED);
    if (allHome) return null;
  }
  if (phase === 'move') {
    if (die === null || getValidMoves(state, die as number).length === 0) return null;
  }
  return state;
}

function parsePlayers(raw: unknown): PlayerPublic[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_PLAYERS) return null;
  const out: PlayerPublic[] = [];
  for (const p of raw) {
    if (!isObj(p) || typeof p.id !== 'string' || typeof p.name !== 'string' || !isColor(p.color)) return null;
    out.push({
      id: p.id,
      name: p.name,
      color: p.color,
      ready: p.ready === true,
      host: p.host === true,
      connected: p.connected === true,
      left: p.left === true,
    });
  }
  return out;
}

const ROOM_STATUSES = new Set<string>(['lobby', 'starting', 'playing', 'finished']);

function parseRoom(raw: unknown): RoomState | null {
  if (!isObj(raw) || typeof raw.code !== 'string' || typeof raw.hostId !== 'string') return null;
  if (typeof raw.status !== 'string' || !ROOM_STATUSES.has(raw.status)) return null;
  const players = parsePlayers(raw.players);
  if (!players) return null;
  let game: RoomState['game'] = null;
  if (raw.game !== null && raw.game !== undefined) {
    if (!isObj(raw.game) || !isInt(raw.game.seq, 0, 10_000_000)) return null;
    const state = parseGameState(raw.game.state);
    if (!state) return null;
    game = { state, seq: raw.game.seq };
  }
  if ((raw.status === 'playing' || raw.status === 'finished') && !game) return null;
  return { code: raw.code, status: raw.status as RoomStatus, hostId: raw.hostId, players, game, serverTime: Date.now() };
}

function parseLocal(raw: unknown): PersistedLocalGame | null {
  if (!isObj(raw) || !isObj(raw.config) || !isObj(raw.controllers) || !isObj(raw.tally)) return null;
  const { count, mode, level } = raw.config;
  if (count !== 2 && count !== 3 && count !== 4) return null;
  if (mode !== 'local' && mode !== 'bot') return null;
  if (level !== 'easy' && level !== 'medium' && level !== 'hard') return null;
  const state = parseGameState(raw.state);
  if (!state || state.players.length !== count) return null;
  const controllers = {} as Record<PlayerColor, Controller>;
  for (const c of ALL_COLORS) {
    const v = raw.controllers[c];
    if (v !== 'human' && v !== 'bot') return null;
    controllers[c] = v;
  }
  if (!isInt(raw.tally.moves, 0, 1_000_000) || !isInt(raw.tally.captures, 0, 1_000_000)) return null;
  if (raw.shownDie !== null && !isInt(raw.shownDie, 1, 6)) return null;
  if (!isInt(raw.seconds, 0, 10_000_000) || typeof raw.elapsedMs !== 'number' || !Number.isFinite(raw.elapsedMs) || raw.elapsedMs < 0) return null;
  return {
    config: { count, mode, level },
    controllers,
    state,
    shownDie: raw.shownDie as number | null,
    tally: { moves: raw.tally.moves, captures: raw.tally.captures },
    seconds: raw.seconds,
    elapsedMs: raw.elapsedMs,
  };
}

/** Validates a parsed JSON value. Returns null for anything that is not a well-formed v1 session. */
export function parseSession(raw: unknown): PersistedLudoSession | null {
  if (!isObj(raw) || raw.version !== LUDO_SESSION_VERSION) return null;
  if (typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) return null;
  const mode = raw.gameMode;
  if (mode !== 'local' && mode !== 'bot' && mode !== 'multiplayer') return null;
  const session: PersistedLudoSession = { version: LUDO_SESSION_VERSION, updatedAt: raw.updatedAt, gameMode: mode };

  if (mode === 'multiplayer') {
    if (typeof raw.roomCode !== 'string' || !/^[A-Z0-9]{6}$/.test(raw.roomCode)) return null;
    if (typeof raw.playerId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(raw.playerId)) return null;
    if (typeof raw.playerName !== 'string' || raw.playerName.length < 1 || raw.playerName.length > 16) return null;
    session.roomCode = raw.roomCode;
    session.playerId = raw.playerId;
    session.playerName = raw.playerName;
    if (raw.lastRoom !== undefined) {
      const room = parseRoom(raw.lastRoom);
      // A snapshot of a different room is useless as a fallback; drop it rather than trust it.
      if (room && room.code === raw.roomCode) session.lastRoom = room;
    }
  } else {
    const local = parseLocal(raw.local);
    if (!local) return null;
    if ((mode === 'bot') !== (local.config.mode === 'bot')) return null;
    session.local = local;
  }
  return session;
}

// ---------------------------------------------------------------------------- storage

function store(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // blocked (private mode / policy)
  }
}

/** True while the session is within its lifetime. */
export function isLudoSessionValid(session: PersistedLudoSession, now = Date.now()): boolean {
  return now - session.updatedAt <= LUDO_SESSION_TTL_MS && session.updatedAt <= now + 60_000;
}

export function clearLudoSession(storage: Storage | null = store()) {
  try {
    storage?.removeItem(LUDO_SESSION_KEY);
  } catch {
    // nothing to do
  }
}

/** Reads and validates the saved session. Corrupt data is removed and reported as "none". */
export function loadLudoSession(storage: Storage | null = store(), now = Date.now()): SessionRead {
  if (!storage) return { kind: 'none' };
  let raw: string | null;
  try {
    raw = storage.getItem(LUDO_SESSION_KEY);
  } catch {
    return { kind: 'none' };
  }
  if (raw === null) return { kind: 'none' };
  try {
    const session = parseSession(JSON.parse(raw));
    if (!session) throw new Error('invalid session');
    return isLudoSessionValid(session, now) ? { kind: 'valid', session } : { kind: 'expired', session };
  } catch {
    clearLudoSession(storage);
    return { kind: 'none' };
  }
}

/** Writes the session (stamping `updatedAt`). Returns false if storage refused. */
export function saveLudoSession(
  session: Omit<PersistedLudoSession, 'version' | 'updatedAt'>,
  storage: Storage | null = store(),
  now = Date.now(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LUDO_SESSION_KEY, JSON.stringify({ ...session, version: LUDO_SESSION_VERSION, updatedAt: now }));
    return true;
  } catch {
    return false; // quota or blocked: the game still works, it just will not survive a refresh
  }
}
