import { randomInt, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  ALL_COLORS,
  DEFAULT_COLOR_ORDER,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NAME_MAX,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  applyMove,
  applyRoll,
  chooseBotMove,
  createGameFromColors,
  currentPlayer,
  getValidMoves,
  type Ack,
  type ClientToServer,
  type GameEvent,
  type GameState,
  type JoinData,
  type PlayerColor,
  type PlayerPublic,
  type RoomState,
  type RoomStatus,
  type ServerToClient,
} from 'ludo-core';

export type IO = Server<ClientToServer, ServerToClient>;
export type Sock = Socket<ClientToServer, ServerToClient>;

export interface Timing {
  /** How long a dropped player keeps their seat before the server gives it up. */
  reconnectGraceMs: number;
  countdownMs: number;
  /** Delay before the server plays a seat whose player has left. */
  autopilotMs: number;
  emptyRoomMs: number;
  finishedRoomMs: number;
  idleRoomMs: number;
  /** Scales the animation lock between actions. 1 in production; tests shrink it to run fast. */
  lockScale: number;
}

export const DEFAULT_TIMING: Timing = {
  reconnectGraceMs: 30_000,
  countdownMs: 3_400,
  autopilotMs: 900,
  emptyRoomMs: 2 * 60_000,
  finishedRoomMs: 10 * 60_000,
  idleRoomMs: 30 * 60_000,
  lockScale: 1,
};

/** Matches the client's per-step animation, so the next action is not accepted mid-animation. */
const STEP_MS = 170;
const ROLL_ANIM_MS = 750;
const PASS_MS = 1100;

interface PlayerRec {
  id: string;
  name: string;
  color: PlayerColor;
  ready: boolean;
  connected: boolean;
  left: boolean;
  socketId: string | null;
  graceTimer: NodeJS.Timeout | null;
}

interface RoomRec {
  code: string;
  status: RoomStatus;
  hostId: string;
  players: PlayerRec[];
  game: { state: GameState; seq: number } | null;
  lastActive: number;
  /** When the last connected human went away; null while anyone is connected. */
  emptySince: number | null;
  finishedAt: number | null;
  /** The next game action is refused before this time (lets the clients finish animating). */
  lockUntil: number;
  startTimer: NodeJS.Timeout | null;
  pilotTimer: NodeJS.Timeout | null;
}

const ok = <T>(data?: T): Ack<T> => ({ ok: true, data });
const fail = (error: string): Ack<never> => ({ ok: false, error });

export function normalizeCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH) : '';
}

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return name.length >= 1 ? name : null;
}

function cleanPlayerId(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(raw) ? raw : null;
}

function isColor(value: unknown): value is PlayerColor {
  return typeof value === 'string' && (ALL_COLORS as readonly string[]).includes(value);
}

/**
 * All room state lives here, in memory, on a single process. The server owns every decision —
 * who is in the room, whose turn it is, what the dice show, where tokens end up — and clients
 * only ever send intents. Nothing is persisted: a room is a live session, not a record.
 */
export class RoomManager {
  private readonly rooms = new Map<string, RoomRec>();
  /** Recently closed codes, so joining one says "no longer available" rather than "not found". */
  private readonly closed = new Map<string, number>();
  private readonly bindings = new Map<string, { code: string; playerId: string }>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private readonly io: IO,
    private readonly timing: Timing = DEFAULT_TIMING,
  ) {}

  start(sweepEveryMs = 30_000) {
    this.sweeper = setInterval(() => this.sweep(), sweepEveryMs);
    this.sweeper.unref();
  }

  stop() {
    if (this.sweeper) clearInterval(this.sweeper);
    for (const room of this.rooms.values()) this.clearTimers(room);
    for (const room of this.rooms.values()) for (const p of room.players) if (p.graceTimer) clearTimeout(p.graceTimer);
  }

  get roomCount() {
    return this.rooms.size;
  }

  // ---------------------------------------------------------------- public state

  private publicPlayers(room: RoomRec): PlayerPublic[] {
    return room.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      ready: p.ready,
      host: p.id === room.hostId,
      connected: p.connected,
      left: p.left,
    }));
  }

  state(room: RoomRec): RoomState {
    return {
      code: room.code,
      status: room.status,
      hostId: room.hostId,
      players: this.publicPlayers(room),
      game: room.game ? { state: room.game.state, seq: room.game.seq } : null,
      serverTime: Date.now(),
    };
  }

  private broadcast(room: RoomRec) {
    room.lastActive = Date.now();
    this.io.to(room.code).emit('room:state', this.state(room));
  }

  private emitEvent(room: RoomRec, event: GameEvent) {
    this.io.to(room.code).emit('game:event', event);
  }

  private notice(room: RoomRec, text: string, kind: 'info' | 'error' = 'info') {
    this.io.to(room.code).emit('notice', { kind, text });
  }

  // ---------------------------------------------------------------- lookup

  private newCode(): string {
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code) && !this.closed.has(code)) return code;
    }
    throw new Error('Could not allocate a room code');
  }

  private bound(socket: Sock): { room: RoomRec; player: PlayerRec } | null {
    const b = this.bindings.get(socket.id);
    if (!b) return null;
    const room = this.rooms.get(b.code);
    const player = room?.players.find((p) => p.id === b.playerId);
    return room && player ? { room, player } : null;
  }

  private firstFreeColor(room: RoomRec): PlayerColor {
    return DEFAULT_COLOR_ORDER.find((c) => !room.players.some((p) => p.color === c))!;
  }

  // ---------------------------------------------------------------- create / join / leave

  create(socket: Sock, payload: { name?: unknown; playerId?: unknown }): Ack<JoinData> {
    const name = cleanName(payload?.name);
    if (!name) return fail('Enter a name to continue.');
    this.detach(socket);
    const player: PlayerRec = {
      id: cleanPlayerId(payload.playerId) ?? randomUUID(),
      name,
      color: 'yellow',
      ready: false,
      connected: true,
      left: false,
      socketId: socket.id,
      graceTimer: null,
    };
    const room: RoomRec = {
      code: this.newCode(),
      status: 'lobby',
      hostId: player.id,
      players: [player],
      game: null,
      lastActive: Date.now(),
      emptySince: null,
      finishedAt: null,
      lockUntil: 0,
      startTimer: null,
      pilotTimer: null,
    };
    this.rooms.set(room.code, room);
    this.attach(socket, room, player);
    return ok({ playerId: player.id, room: this.state(room) });
  }

  join(socket: Sock, payload: { code?: unknown; name?: unknown; playerId?: unknown }): Ack<JoinData> {
    const code = normalizeCode(payload?.code);
    if (code.length !== ROOM_CODE_LENGTH) return fail('Room not found.');
    const room = this.rooms.get(code);
    if (!room) return fail(this.closed.has(code) ? 'This room is no longer available.' : 'Room not found.');

    const playerId = cleanPlayerId(payload.playerId);
    const existing = playerId ? room.players.find((p) => p.id === playerId) : undefined;

    if (existing) {
      // Reconnecting: take the seat back. A second tab with the same identity replaces the first.
      if (existing.socketId && existing.socketId !== socket.id) this.bindings.delete(existing.socketId);
      this.detach(socket, room.code);
      if (existing.graceTimer) clearTimeout(existing.graceTimer);
      existing.graceTimer = null;
      existing.connected = true;
      existing.left = false;
      existing.socketId = socket.id;
      this.attach(socket, room, existing);
      this.notice(room, `${existing.name} is back`);
      return ok({ playerId: existing.id, room: this.state(room) });
    }

    const name = cleanName(payload.name);
    if (!name) return fail('Enter a name to continue.');
    if (room.status !== 'lobby') return fail('This game has already started.');
    if (room.players.length >= MAX_PLAYERS) return fail('This room is full.');

    this.detach(socket);
    const player: PlayerRec = {
      id: playerId ?? randomUUID(),
      name,
      color: this.firstFreeColor(room),
      ready: false,
      connected: true,
      left: false,
      socketId: socket.id,
      graceTimer: null,
    };
    room.players.push(player);
    this.attach(socket, room, player);
    return ok({ playerId: player.id, room: this.state(room) });
  }

  private attach(socket: Sock, room: RoomRec, player: PlayerRec) {
    this.bindings.set(socket.id, { code: room.code, playerId: player.id });
    void socket.join(room.code);
    room.emptySince = null;
    this.broadcast(room);
    this.schedulePilot(room);
  }

  /** Drops a socket's room membership without touching the player's seat. */
  private detach(socket: Sock, exceptCode?: string) {
    const b = this.bindings.get(socket.id);
    if (!b) return;
    this.bindings.delete(socket.id);
    if (b.code === exceptCode) return;
    void socket.leave(b.code);
    const room = this.rooms.get(b.code);
    const player = room?.players.find((p) => p.id === b.playerId);
    if (room && player) this.removePlayer(room, player, 'left');
  }

  /** Socket dropped: keep the seat for a grace period so a flaky connection does not cost the game. */
  disconnect(socket: Sock) {
    const b = this.bindings.get(socket.id);
    if (!b) return;
    this.bindings.delete(socket.id);
    const room = this.rooms.get(b.code);
    const player = room?.players.find((p) => p.id === b.playerId);
    if (!room || !player || player.socketId !== socket.id) return;
    player.connected = false;
    player.socketId = null;
    this.reassignHost(room);
    this.noteIfEmpty(room);
    this.notice(room, `${player.name} disconnected`);
    this.broadcast(room);
    player.graceTimer = setTimeout(() => {
      player.graceTimer = null;
      if (!player.connected && this.rooms.get(room.code) === room) this.removePlayer(room, player, 'timeout');
    }, this.timing.reconnectGraceMs);
    player.graceTimer.unref();
  }

  leave(socket: Sock): Ack {
    const b = this.bound(socket);
    if (!b) return ok();
    this.bindings.delete(socket.id);
    void socket.leave(b.room.code);
    this.removePlayer(b.room, b.player, 'left');
    return ok();
  }

  /** A player is gone for good (left, or never came back). In a running game the server plays their seat. */
  private removePlayer(room: RoomRec, player: PlayerRec, why: 'left' | 'timeout') {
    if (player.graceTimer) clearTimeout(player.graceTimer);
    player.graceTimer = null;
    if (player.socketId) this.bindings.delete(player.socketId);
    player.socketId = null;
    player.connected = false;

    if (room.status === 'playing') {
      player.left = true;
      this.reassignHost(room);
      this.notice(room, `${player.name} left — a bot is playing ${player.color}`);
      this.noteIfEmpty(room);
      this.broadcast(room);
      this.schedulePilot(room);
      return;
    }

    room.players = room.players.filter((p) => p.id !== player.id);
    if (room.status === 'starting') {
      this.cancelStart(room);
      this.notice(room, `${player.name} ${why === 'left' ? 'left' : 'dropped'} — start cancelled`);
    }
    if (room.players.length === 0) {
      this.destroy(room, null);
      return;
    }
    this.reassignHost(room);
    this.noteIfEmpty(room);
    this.broadcast(room);
  }

  /** Hands the host role to a connected player when the host is not one. */
  private reassignHost(room: RoomRec) {
    const host = room.players.find((p) => p.id === room.hostId);
    if (host && host.connected) return;
    const next = room.players.find((p) => p.connected && !p.left);
    if (next && next.id !== room.hostId) {
      room.hostId = next.id;
      this.notice(room, `${next.name} is now the host`);
    }
  }

  private noteIfEmpty(room: RoomRec) {
    room.emptySince = room.players.some((p) => p.connected) ? null : (room.emptySince ?? Date.now());
  }

  // ---------------------------------------------------------------- lobby actions

  sync(socket: Sock): Ack<RoomState> {
    const b = this.bound(socket);
    return b ? ok(this.state(b.room)) : fail('You are not in a room.');
  }

  setColor(socket: Sock, color: unknown): Ack {
    const b = this.bound(socket);
    if (!b) return fail('You are not in a room.');
    if (b.room.status !== 'lobby') return fail('Colours are locked once the game starts.');
    if (!isColor(color)) return fail('Pick one of the four colours.');
    if (b.room.players.some((p) => p.id !== b.player.id && p.color === color)) return fail('That colour is already taken.');
    b.player.color = color;
    b.player.ready = false;
    this.broadcast(b.room);
    return ok();
  }

  setReady(socket: Sock, ready: unknown): Ack {
    const b = this.bound(socket);
    if (!b) return fail('You are not in a room.');
    if (b.room.status !== 'lobby') return fail('The game has already started.');
    b.player.ready = ready === true;
    this.broadcast(b.room);
    return ok();
  }

  startGame(socket: Sock): Ack {
    const b = this.bound(socket);
    if (!b) return fail('You are not in a room.');
    const { room, player } = b;
    if (room.hostId !== player.id) return fail('Only the host can start the game.');
    if (room.status !== 'lobby') return fail('The game has already started.');
    const absent = room.players.find((p) => !p.connected);
    if (absent) return fail(`Waiting for ${absent.name} to reconnect.`);
    if (room.players.length < MIN_PLAYERS) return fail('You need at least 2 players.');
    if (!room.players.every((p) => p.ready)) return fail('Everyone must be ready first.');

    room.status = 'starting';
    this.broadcast(room);
    room.startTimer = setTimeout(() => {
      room.startTimer = null;
      if (room.status !== 'starting') return;
      room.game = { state: createGameFromColors(room.players.map((p) => p.color)), seq: 0 };
      room.status = 'playing';
      room.lockUntil = 0;
      this.broadcast(room);
      this.schedulePilot(room);
    }, this.timing.countdownMs);
    return ok();
  }

  private cancelStart(room: RoomRec) {
    if (room.startTimer) clearTimeout(room.startTimer);
    room.startTimer = null;
    if (room.status === 'starting') room.status = 'lobby';
  }

  restart(socket: Sock): Ack {
    const b = this.bound(socket);
    if (!b) return fail('You are not in a room.');
    if (b.room.hostId !== b.player.id) return fail('Only the host can restart.');
    if (b.room.status !== 'finished') return fail('The game is not finished.');
    const room = b.room;
    room.players = room.players.filter((p) => p.connected && !p.left);
    for (const p of room.players) p.ready = false;
    room.game = null;
    room.status = 'lobby';
    room.finishedAt = null;
    this.reassignHost(room);
    this.broadcast(room);
    return ok();
  }

  close(socket: Sock): Ack {
    const b = this.bound(socket);
    if (!b) return fail('You are not in a room.');
    if (b.room.hostId !== b.player.id) return fail('Only the host can close the room.');
    this.destroy(b.room, 'The host closed the room.');
    return ok();
  }

  private destroy(room: RoomRec, reason: string | null) {
    this.clearTimers(room);
    for (const p of room.players) {
      if (p.graceTimer) clearTimeout(p.graceTimer);
      if (p.socketId) this.bindings.delete(p.socketId);
    }
    if (reason) this.io.to(room.code).emit('room:closed', { reason });
    void this.io.in(room.code).socketsLeave(room.code);
    this.rooms.delete(room.code);
    this.closed.set(room.code, Date.now() + 60 * 60_000);
  }

  private clearTimers(room: RoomRec) {
    if (room.startTimer) clearTimeout(room.startTimer);
    if (room.pilotTimer) clearTimeout(room.pilotTimer);
    room.startTimer = null;
    room.pilotTimer = null;
  }

  // ---------------------------------------------------------------- game actions

  roll(socket: Sock): Ack {
    const b = this.bound(socket);
    if (!b) return fail('You are not in a room.');
    return this.doRoll(b.room, b.player);
  }

  move(socket: Sock, tokenId: unknown): Ack {
    const b = this.bound(socket);
    if (!b) return fail('You are not in a room.');
    return this.doMove(b.room, b.player, tokenId);
  }

  /** Common checks: a game is running and it is this player's turn. */
  private turnCheck(room: RoomRec, player: PlayerRec): Ack | null {
    if (room.status !== 'playing' || !room.game) return fail('The game has not started.');
    if (room.game.state.phase === 'over') return fail('The game is over.');
    if (currentPlayer(room.game.state).color !== player.color) return fail('Not your turn.');
    if (Date.now() < room.lockUntil) return fail('Please wait a moment.');
    return null;
  }

  private doRoll(room: RoomRec, player: PlayerRec): Ack {
    const refused = this.turnCheck(room, player);
    if (refused) return refused;
    const game = room.game!;
    if (game.state.phase !== 'roll') return fail('Pick a token to move.');

    const die = randomInt(1, 7); // the only place a die is ever generated
    const before = game.state;
    const result = applyRoll(before, die);
    game.state = result.state;
    const color = player.color;

    const shown: GameState = result.kind === 'move' ? result.state : { ...before, die };
    this.emitEvent(room, { type: 'DICE_ROLLED', seq: ++game.seq, color, die, kind: result.kind, state: shown });
    if (result.kind === 'move') {
      room.lockUntil = Date.now() + ROLL_ANIM_MS * this.timing.lockScale;
    } else {
      room.lockUntil = Date.now() + (ROLL_ANIM_MS + PASS_MS + 100) * this.timing.lockScale;
      this.emitEvent(room, { type: 'TURN_CHANGED', seq: ++game.seq, color: currentPlayer(result.state).color, state: result.state });
    }
    room.lastActive = Date.now();
    this.schedulePilot(room);
    return ok();
  }

  private doMove(room: RoomRec, player: PlayerRec, tokenId: unknown): Ack {
    const refused = this.turnCheck(room, player);
    if (refused) return refused;
    const game = room.game!;
    if (game.state.phase !== 'move' || game.state.die === null) return fail('Roll the dice first.');
    if (typeof tokenId !== 'number' || !Number.isInteger(tokenId)) return fail('Invalid move.');
    if (!getValidMoves(game.state, game.state.die).includes(tokenId)) return fail('Invalid move.');

    const before = game.state;
    const { state, events } = applyMove(before, tokenId);
    game.state = state;
    this.emitEvent(room, {
      type: 'TOKEN_MOVED',
      seq: ++game.seq,
      color: events.color,
      tokenId,
      from: events.from,
      to: events.to,
      progressSteps: events.progressSteps,
      captures: events.captures,
      reachedHome: events.reachedHome,
      extraTurn: events.extraTurn,
      won: events.won,
      state,
    });
    room.lockUntil = Date.now() + (events.progressSteps.length * STEP_MS + 300) * this.timing.lockScale;

    if (events.won) {
      room.status = 'finished';
      room.finishedAt = Date.now();
      this.emitEvent(room, { type: 'GAME_WON', seq: ++game.seq, color: events.color, state });
      this.broadcast(room);
    } else if (currentPlayer(state).color !== events.color) {
      this.emitEvent(room, { type: 'TURN_CHANGED', seq: ++game.seq, color: currentPlayer(state).color, state });
    }
    room.lastActive = Date.now();
    this.schedulePilot(room);
    return ok();
  }

  /** If the seat to move belongs to someone who has left, the server plays it (one action at a time). */
  private schedulePilot(room: RoomRec) {
    if (room.pilotTimer) clearTimeout(room.pilotTimer);
    room.pilotTimer = null;
    if (room.status !== 'playing' || !room.game || room.game.state.phase === 'over') return;
    const state = room.game.state;
    const seat = room.players.find((p) => p.color === currentPlayer(state).color);
    if (!seat || !seat.left) return;
    const wait = Math.max(this.timing.autopilotMs, room.lockUntil - Date.now() + 300);
    room.pilotTimer = setTimeout(() => {
      room.pilotTimer = null;
      if (this.rooms.get(room.code) !== room || room.status !== 'playing' || !room.game) return;
      const s = room.game.state;
      const who = room.players.find((p) => p.color === currentPlayer(s).color);
      if (!who || !who.left) return;
      room.lockUntil = 0;
      if (s.phase === 'roll') this.doRoll(room, who);
      else if (s.die !== null) this.doMove(room, who, chooseBotMove(s, s.die, 'medium'));
    }, wait);
    room.pilotTimer.unref();
  }

  // ---------------------------------------------------------------- lifecycle

  sweep(now = Date.now()) {
    for (const [code, until] of this.closed) if (until < now) this.closed.delete(code);
    for (const room of [...this.rooms.values()]) {
      const abandoned = room.emptySince !== null && now - room.emptySince > this.timing.emptyRoomMs;
      const finished = room.finishedAt !== null && now - room.finishedAt > this.timing.finishedRoomMs;
      const idle = now - room.lastActive > this.timing.idleRoomMs;
      if (abandoned || finished || idle) this.destroy(room, 'This room is no longer available.');
    }
  }
}
