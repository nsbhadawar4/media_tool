'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientToServer, GameEvent, JoinData, PlayerColor, RoomState, ServerToClient } from 'ludo-core';

export type Connection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'unavailable';

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
}

interface Session {
  playerId: string;
  code: string;
  name: string;
}

const SESSION_KEY = 'ludo_online_session';
const NAME_KEY = 'ludo_online_name';
type LudoSocket = Socket<ServerToClient, ClientToServer>;

/**
 * Where the realtime server lives. It is a separate long-running Node process (Vercel's
 * serverless functions cannot hold WebSocket connections), so production must set
 * NEXT_PUBLIC_REALTIME_URL. On localhost it falls back to the dev server's default port.
 */
function realtimeUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // Also covers a phone on the LAN opening the laptop's dev server.
    if (host === 'localhost' || host === '127.0.0.1' || /^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      return `${window.location.protocol}//${host}:4001`;
    }
  }
  return null;
}

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function writeSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage blocked: reconnecting after a page reload just will not work.
  }
}
export function readSavedName(): string {
  try {
    return sessionStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
export function saveName(name: string) {
  try {
    sessionStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}

/** A new random player identity, kept for the browser tab so a reload or reconnect is the same player. */
function newPlayerId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * The client side of an online Ludo room. It owns the socket and the room snapshot, and relays
 * game events. It never decides anything: every action is an intent that the server validates.
 */
export function useLudoRoom() {
  const [connection, setConnection] = useState<Connection>('idle');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [closedReason, setClosedReason] = useState<string | null>(null);

  const socketRef = useRef<LudoSocket | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const listeners = useRef(new Set<(e: GameEvent) => void>());
  const buffer = useRef<GameEvent[]>([]);
  const toastId = useRef(0);
  const toastTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const everConnected = useRef(false);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    const timer = setTimeout(() => {
      toastTimers.current.delete(timer);
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3600);
    toastTimers.current.add(timer);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const forget = useCallback(() => {
    sessionRef.current = null;
    writeSession(null);
    setRoom(null);
    setPlayerId(null);
    buffer.current = [];
  }, []);

  /** Opens the socket on first use. Reconnection and rejoining the room are automatic after that. */
  const ensureSocket = useCallback((): LudoSocket | null => {
    if (socketRef.current) return socketRef.current;
    const url = realtimeUrl();
    if (!url) {
      setConnection('unavailable');
      return null;
    }
    setConnection('connecting');
    const socket: LudoSocket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      everConnected.current = true;
      setConnection('connected');
      // After a drop: take our seat back and pull a fresh snapshot from the server.
      const session = sessionRef.current;
      if (session) {
        socket.emit('room:join', { code: session.code, name: session.name, playerId: session.playerId }, (ack: Ack<JoinData>) => {
          if (ack.ok && ack.data) {
            setRoom(ack.data.room);
            setPlayerId(ack.data.playerId);
          } else {
            toast(ack.error ?? 'Room not found.', 'error');
            forget();
          }
        });
      }
    });
    socket.on('disconnect', (reason) => {
      // "io client disconnect" is our own close; anything else will be retried automatically.
      setConnection(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting');
    });
    socket.io.on('reconnect_attempt', () => setConnection('reconnecting'));
    socket.on('connect_error', () => {
      setConnection(everConnected.current ? 'reconnecting' : 'disconnected');
    });
    socket.on('room:state', (state) => setRoom(state));
    socket.on('game:event', (event) => {
      buffer.current = [...buffer.current.slice(-150), event];
      listeners.current.forEach((fn) => fn(event));
    });
    socket.on('notice', ({ kind, text }) => toast(text, kind === 'error' ? 'error' : 'info'));
    socket.on('room:closed', ({ reason }) => {
      setClosedReason(reason);
      forget();
    });
    return socket;
  }, [forget, toast]);

  useEffect(() => {
    const timers = toastTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  /** Resumes a room after a page reload, if this tab has a saved seat. Returns whether one was found. */
  const resume = useCallback((): boolean => {
    const session = readSession();
    if (!session) return false;
    sessionRef.current = session;
    ensureSocket();
    return true;
  }, [ensureSocket]);

  const finishJoin = useCallback(
    (ack: Ack<JoinData>, name: string): Ack<JoinData> => {
      if (ack.ok && ack.data) {
        const session = { playerId: ack.data.playerId, code: ack.data.room.code, name };
        sessionRef.current = session;
        writeSession(session);
        setPlayerId(ack.data.playerId);
        setRoom(ack.data.room);
        setClosedReason(null);
      }
      return ack;
    },
    [],
  );

  /** Emits once the socket is connected (waits briefly for the first connection). */
  const whenConnected = useCallback((socket: LudoSocket, fn: () => void) => {
    if (socket.connected) fn();
    else socket.once('connect', fn);
  }, []);

  const createRoom = useCallback(
    (name: string): Promise<Ack<JoinData>> =>
      new Promise((resolve) => {
        const socket = ensureSocket();
        if (!socket) return resolve({ ok: false, error: 'Multiplayer server is not available.' });
        const timeout = setTimeout(() => resolve({ ok: false, error: 'Could not reach the game server.' }), 8000);
        whenConnected(socket, () =>
          socket.emit('room:create', { name, playerId: sessionRef.current?.playerId ?? newPlayerId() }, (ack: Ack<JoinData>) => {
            clearTimeout(timeout);
            resolve(finishJoin(ack, name));
          }),
        );
      }),
    [ensureSocket, finishJoin, whenConnected],
  );

  const joinRoom = useCallback(
    (code: string, name: string): Promise<Ack<JoinData>> =>
      new Promise((resolve) => {
        const socket = ensureSocket();
        if (!socket) return resolve({ ok: false, error: 'Multiplayer server is not available.' });
        const timeout = setTimeout(() => resolve({ ok: false, error: 'Could not reach the game server.' }), 8000);
        whenConnected(socket, () =>
          socket.emit('room:join', { code, name, playerId: sessionRef.current?.playerId ?? newPlayerId() }, (ack: Ack<JoinData>) => {
            clearTimeout(timeout);
            resolve(finishJoin(ack, name));
          }),
        );
      }),
    [ensureSocket, finishJoin, whenConnected],
  );

  /** Sends an intent and turns a refusal into a toast. */
  const intent = useCallback(
    (run: (socket: LudoSocket, done: (a: Ack) => void) => void): Promise<boolean> =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
          toast('Connection lost. Reconnecting…', 'error');
          return resolve(false);
        }
        run(socket, (a) => {
          if (!a.ok) toast(a.error ?? 'Something went wrong.', 'error');
          resolve(a.ok);
        });
      }),
    [toast],
  );

  const setColor = useCallback((color: PlayerColor) => intent((s, d) => s.emit('room:color', { color }, d)), [intent]);
  const setReady = useCallback((ready: boolean) => intent((s, d) => s.emit('room:ready', { ready }, d)), [intent]);
  const startGame = useCallback(() => intent((s, d) => s.emit('room:start', d)), [intent]);
  const roll = useCallback(() => intent((s, d) => s.emit('game:roll', d)), [intent]);
  const move = useCallback((tokenId: number) => intent((s, d) => s.emit('game:move', { tokenId }, d)), [intent]);
  const restart = useCallback(() => intent((s, d) => s.emit('room:restart', d)), [intent]);
  const closeRoom = useCallback(() => intent((s, d) => s.emit('room:close', d)), [intent]);

  const leave = useCallback(() => {
    socketRef.current?.emit('room:leave');
    forget();
  }, [forget]);

  /** Fetches the authoritative snapshot (used to recover from a missed event). */
  const sync = useCallback(
    (): Promise<RoomState | null> =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) return resolve(null);
        socket.emit('room:sync', (a: Ack<RoomState>) => {
          if (a.ok && a.data) setRoom(a.data);
          resolve(a.ok && a.data ? a.data : null);
        });
      }),
    [],
  );

  const onEvent = useCallback((fn: (e: GameEvent) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);
  const bufferedEvents = useCallback(() => buffer.current, []);

  return {
    connection,
    room,
    playerId,
    toasts,
    closedReason,
    toast,
    dismissToast,
    resume,
    createRoom,
    joinRoom,
    setColor,
    setReady,
    startGame,
    roll,
    move,
    restart,
    closeRoom,
    leave,
    sync,
    onEvent,
    bufferedEvents,
    clearClosed: () => setClosedReason(null),
  };
}

export type LudoRoomApi = ReturnType<typeof useLudoRoom>;
