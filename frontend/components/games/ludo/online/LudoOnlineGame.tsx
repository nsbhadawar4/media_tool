'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PROGRESS_YARD,
  currentPlayer,
  getValidMoves,
  tokenCell,
  type GameEvent,
  type GameState,
  type PlayerColor,
  type RoomState,
} from 'ludo-core';
import { useGameSound } from '../../useGameSound';
import { LudoBoard, type AnimOverride, type BurstFx } from '../LudoBoard';
import { LudoDice } from '../LudoDice';
import { LudoPlayerPanel } from '../LudoPlayerPanel';
import { LudoWinner } from '../LudoWinner';
import { COLOR_HEX, COLOR_NAME } from '../ludoLayout';
import { ROLL_MS, STEP_MS } from '../ludoStyles';
import type { LudoRoomApi } from './useLudoRoom';

const PASS_MS = 1100;
const EMOJI: Record<PlayerColor, string> = { yellow: '🟡', green: '🟢', red: '🔴', blue: '🔵' };

type Busy = 'idle' | 'rolling' | 'moving' | 'passing';

interface Props {
  room: RoomState;
  playerId: string;
  api: LudoRoomApi;
  /** Lets the parent mute the sound and share the same sound instance. */
  sound: ReturnType<typeof useGameSound>;
  onBackToLobby: () => void;
}

/**
 * The live board for a room. The server owns the game: this component only ever *displays*
 * the state the server sends. Events arrive in order, each carrying the state after it; they
 * are queued and played one at a time (dice tumble, token hops, capture burst), and after each
 * the displayed state is replaced by the server's. A missed event is repaired with a resync.
 */
export function LudoOnlineGame({ room, playerId, api, sound, onBackToLobby }: Props) {
  const { play } = sound;
  const initial = room.game!;
  const [display, setDisplay] = useState<GameState>(initial.state);
  const [busy, setBusy] = useState<Busy>('idle');
  const [shownDie, setShownDie] = useState<number | null>(initial.state.die);
  const [rollCount, setRollCount] = useState(0);
  const [note, setNote] = useState('');
  const [anim, setAnim] = useState<AnimOverride | null>(null);
  const [hopKey, setHopKey] = useState(0);
  const [burst, setBurst] = useState<BurstFx | null>(null);
  const [returning, setReturning] = useState<ReadonlySet<string>>(() => new Set());
  const [tally, setTally] = useState({ moves: 0, captures: 0 });
  const [waiting, setWaiting] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const queue = useRef<GameEvent[]>([]);
  const running = useRef(false);
  const lastSeq = useRef(initial.seq);
  const timers = useRef(new Set<number>());
  const startedAt = useRef(0);
  const burstId = useRef(0);
  const pumpRef = useRef<() => void>(() => {});

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);
  const clearAll = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current.clear();
  }, []);

  /** Plays one server event, then calls `done`. */
  const run = useCallback(
    (e: GameEvent, done: () => void) => {
      lastSeq.current = e.seq;
      setWaiting(false);
      if (e.type === 'DICE_ROLLED') {
        setBusy('rolling');
        setNote('ROLLING...');
        setShownDie(e.die);
        setRollCount((n) => n + 1);
        play('dice');
        schedule(() => {
          setDisplay(e.state);
          if (e.kind === 'move') {
            setNote('');
            setBusy('idle');
            done();
          } else {
            setNote(e.kind === 'forfeit' ? 'Three 6s in a row. Turn lost' : 'No moves possible');
            setBusy('passing');
            schedule(() => {
              setNote('');
              setBusy('idle');
              done();
            }, PASS_MS);
          }
        }, ROLL_MS);
      } else if (e.type === 'TOKEN_MOVED') {
        setBusy('moving');
        setNote('');
        e.progressSteps.forEach((progress, i) => {
          schedule(() => {
            setAnim({ color: e.color, tokenId: e.tokenId, progress });
            setHopKey((n) => n + 1);
            play('move');
          }, i * STEP_MS);
        });
        schedule(() => {
          setDisplay(e.state);
          setAnim(null);
          setTally((t) => ({ moves: t.moves + 1, captures: t.captures + e.captures.length }));
          if (e.captures.length > 0) {
            burstId.current += 1;
            setBurst({ id: burstId.current, cell: e.captures[0]!.cell, color: e.color });
            setReturning(new Set(e.captures.map((c) => `${c.color}-${c.tokenId}`)));
            play('capture');
            schedule(() => setBurst(null), 700);
            schedule(() => setReturning(new Set()), 650);
          } else if (e.reachedHome) play('success');
          if (e.extraTurn && !e.won) setNote('Rolled a 6! Roll again');
          setBusy('idle');
          done();
        }, e.progressSteps.length * STEP_MS + 40);
      } else {
        // TURN_CHANGED and GAME_WON carry no animation of their own.
        setDisplay(e.state);
        if (e.type === 'GAME_WON') {
          setSeconds(Math.round((performance.now() - startedAt.current) / 1000));
          play('win');
        }
        done();
      }
    },
    [play, schedule],
  );

  const pump = useCallback(() => {
    if (running.current) return;
    const next = queue.current.shift();
    if (!next) return;
    running.current = true;
    run(next, () => {
      running.current = false;
      pumpRef.current();
    });
  }, [run]);
  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  /** Throws away anything in flight and shows the server's current state. */
  const resync = useCallback(async () => {
    const snap = await api.sync();
    if (!snap?.game) return;
    clearAll();
    queue.current = [];
    running.current = false;
    lastSeq.current = snap.game.seq;
    setAnim(null);
    setBusy('idle');
    setNote('');
    setWaiting(false);
    setDisplay(snap.game.state);
  }, [api, clearAll]);

  /**
   * The server's snapshot wins. After a reconnect (or a refresh, which starts from a saved copy)
   * the room carries the authoritative game; if it is ahead of what is on screen and nothing is
   * animating, show it. While events are playing it is ignored, since they lead to the same state.
   */
  const snapshotSeq = room.game?.seq ?? -1;
  const snapshotState = room.game?.state ?? null;
  useEffect(() => {
    if (!snapshotState || snapshotSeq <= lastSeq.current) return;
    if (running.current || queue.current.length > 0) return;
    lastSeq.current = snapshotSeq;
    setDisplay(snapshotState);
    setBusy('idle');
    setNote('');
    setWaiting(false);
  }, [snapshotSeq, snapshotState]);

  const receive = useCallback(
    (e: GameEvent) => {
      if (e.seq <= lastSeq.current && !running.current && queue.current.length === 0) return; // already shown
      const expected = (queue.current.at(-1)?.seq ?? lastSeq.current) + 1;
      if (e.seq < expected) return; // duplicate
      if (e.seq > expected) {
        void resync(); // a gap: something was missed
        return;
      }
      queue.current.push(e);
      pumpRef.current();
    },
    [resync],
  );

  useEffect(() => {
    startedAt.current = performance.now();
    // Events that arrived between the room snapshot and this component mounting.
    for (const e of api.bufferedEvents()) if (e.seq > lastSeq.current) receive(e);
    const off = api.onEvent(receive);
    const pending = timers.current;
    return () => {
      off();
      pending.forEach((id) => window.clearTimeout(id));
      pending.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const me = room.players.find((p) => p.id === playerId);
  const myColor = me?.color ?? null;
  const names = useMemo(() => {
    const map: Partial<Record<PlayerColor, string>> = {};
    for (const p of room.players) map[p.color] = p.name;
    return map;
  }, [room.players]);
  const offline = useMemo(() => new Set(room.players.filter((p) => !p.connected && !p.left).map((p) => p.color)), [room.players]);
  const botColors = useMemo(() => new Set(room.players.filter((p) => p.left).map((p) => p.color)), [room.players]);

  const winner = display.winner;
  const active = winner ? null : currentPlayer(display);
  const activeColor = active?.color ?? null;
  const isMyTurn = activeColor !== null && activeColor === myColor;
  const idle = busy === 'idle' && !waiting;
  // Nothing is playable while the socket is down: the board may be a saved copy until the server answers.
  const live = api.connection === 'connected';
  const canRoll = live && isMyTurn && display.phase === 'roll' && idle;
  const canPick = live && isMyTurn && display.phase === 'move' && busy === 'idle' && !waiting;

  const validIds = useMemo(
    () => (display.phase === 'move' && display.die !== null ? getValidMoves(display, display.die) : []),
    [display],
  );
  const hints = useMemo(() => {
    if (!canPick || !active || display.die === null) return [];
    return validIds.map((id) => {
      const from = active.tokens[id]!.progress;
      const to = from === PROGRESS_YARD ? 0 : from + display.die!;
      return { color: active.color, cell: tokenCell(active.color, to, id) };
    });
  }, [canPick, active, display.die, validIds]);

  const onRoll = useCallback(async () => {
    setWaiting(true);
    if (!(await api.roll())) setWaiting(false);
  }, [api]);
  const onSelect = useCallback(
    async (tokenId: number) => {
      setWaiting(true);
      if (!(await api.move(tokenId))) setWaiting(false);
    },
    [api],
  );

  // Space / Enter rolls on your own turn.
  useEffect(() => {
    if (!canRoll) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== ' ' && ev.key !== 'Enter') return;
      const t = ev.target;
      if (t instanceof HTMLElement && t.closest('button, a, input, select, textarea, [role="dialog"]')) return;
      ev.preventDefault();
      void onRoll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canRoll, onRoll]);

  const diceColor = activeColor ? COLOR_HEX[activeColor] : '#7c5cff';
  const activeName = activeColor ? (names[activeColor] ?? COLOR_NAME[activeColor]) : '';
  const banner = winner
    ? `${EMOJI[winner]} ${names[winner] ?? COLOR_NAME[winner]} wins`
    : activeColor
      ? `${EMOJI[activeColor]} ${isMyTurn ? 'Your Turn' : `${activeName}'s Turn`}`
      : '';
  const activeOffline = activeColor !== null && offline.has(activeColor);
  const subtitle =
    note ||
    (activeOffline
      ? `Waiting for ${activeName} to reconnect…`
      : canRoll
        ? 'Roll the dice to play'
        : canPick
          ? 'Choose a token to move'
          : activeColor && !isMyTurn && busy === 'idle'
            ? `${activeName} is playing…`
            : '');
  const caption = busy === 'rolling' ? 'Rolling…' : canRoll ? 'Roll Dice' : isMyTurn ? 'Wait…' : 'Dice';
  const winnerName = winner ? (names[winner] ?? COLOR_NAME[winner]) : '';

  return (
    <>
      <div className="ludo-enter mx-auto flex w-full max-w-[1000px] flex-col gap-3 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="order-1 flex flex-col items-center gap-3 lg:order-2">
          <div
            aria-live="polite"
            className="w-full max-w-[600px] rounded-2xl border bg-white/[0.04] px-4 py-2.5 text-center transition-colors duration-300"
            style={{ borderColor: `${diceColor}77` }}
          >
            <div className="flex items-center justify-center gap-2 text-base font-bold tracking-wide text-foreground">
              <span aria-hidden className="ludo-dot h-2 w-2 shrink-0 rounded-full" style={{ background: diceColor }} />
              {banner.replace(/^\S+\s/, '')}
            </div>
            <div className="min-h-4 text-xs text-muted">{subtitle}</div>
          </div>

          <div style={{ width: 'max(280px, min(100%, 600px, calc(100dvh - 340px)))' }}>
            <LudoBoard
              state={display}
              anim={anim}
              active={activeColor}
              validIds={validIds}
              selectable={canPick}
              burst={burst}
              returning={returning}
              hopKey={hopKey}
              onSelect={onSelect}
              hints={hints}
            />
          </div>
        </div>

        <div className="order-2 flex flex-row-reverse items-center gap-3 lg:order-1 lg:flex-col lg:items-stretch">
          <LudoPlayerPanel
            state={display}
            vsBot={false}
            active={activeColor}
            names={names}
            youColor={myColor}
            offline={offline}
            botColors={botColors}
          />
          <div className="flex shrink-0 justify-center">
            <LudoDice
              value={shownDie}
              rollCount={rollCount}
              rolling={busy === 'rolling'}
              color={diceColor}
              canRoll={canRoll}
              onRoll={() => void onRoll()}
              caption={caption}
            />
          </div>
        </div>
      </div>

      {winner && busy === 'idle' && (
        <LudoWinner
          winner={winner}
          name={winnerName}
          moves={tally.moves}
          captures={tally.captures}
          seconds={seconds}
          playAgainLabel={room.hostId === playerId ? 'Back to Lobby' : 'Wait for Host'}
          onPlayAgain={() => (room.hostId === playerId ? onBackToLobby() : api.toast('Waiting for the host to start another game.', 'info'))}
        />
      )}
    </>
  );
}
