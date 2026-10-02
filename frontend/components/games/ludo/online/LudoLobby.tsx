'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { Check, Copy, LogOut, Share2, Trash2, Users } from 'lucide-react';
import { MAX_PLAYERS, MIN_PLAYERS, ROOM_CODE_LENGTH, DEFAULT_COLOR_ORDER, type PlayerColor, type PlayerPublic, type RoomState } from 'ludo-core';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { COLOR_DARK, COLOR_HEX, COLOR_NAME } from '../ludoLayout';
import type { LudoRoomApi } from './useLudoRoom';

const EMOJI: Record<PlayerColor, string> = { yellow: '🟡', green: '🟢', blue: '🔵', red: '🔴' };

/** Copy/share the room code. The label swaps inside a fixed-size button so nothing shifts. */
function RoomCode({ code, onToast }: { code: string; onToast: LudoRoomApi['toast'] }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const flash = () => {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };
  const copy = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(code);
      return true;
    } catch {
      return false;
    }
  };
  const onCopy = async () => {
    if (await copy()) flash();
    else onToast('Could not copy. Select the code and copy it manually.', 'error');
  };
  const onShare = async () => {
    const text = `Join my Ludo game!\n\nRoom Code: ${code}`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Ludo', text });
        return;
      } catch (err) {
        if ((err as DOMException).name === 'AbortError') return;
      }
    }
    if (await copy()) {
      flash();
      onToast('Share is not available here, so the room code was copied.', 'info');
    } else onToast('Could not share. Copy the code by hand.', 'error');
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-subtle">Room code</p>
      <div
        className="flex items-center justify-center gap-1.5 rounded-2xl border border-border-strong bg-background/60 px-3 py-3 shadow-[0_0_40px_-18px_#7c5cff] sm:gap-2"
        aria-label={`Room code ${code.split('').join(' ')}`}
      >
        {code.padEnd(ROOM_CODE_LENGTH, ' ').split('').map((ch, i) => (
          <span
            key={i}
            className="flex h-11 w-9 items-center justify-center rounded-lg bg-white/[0.06] font-mono text-2xl font-bold text-foreground sm:h-12 sm:w-10"
          >
            {ch}
          </span>
        ))}
      </div>
      <div className="grid w-full max-w-xs grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCopy} className="relative min-h-11 gap-2" aria-label="Copy room code">
          <span className="relative flex h-4 w-4 items-center justify-center">
            <Copy className={cn('absolute h-4 w-4 transition duration-200', copied ? 'scale-50 opacity-0' : 'scale-100 opacity-100')} />
            <Check className={cn('absolute h-4 w-4 text-emerald-400 transition duration-200', copied ? 'scale-100 opacity-100' : 'scale-50 opacity-0')} />
          </span>
          <span className="w-16 text-left">{copied ? 'Copied' : 'COPY CODE'}</span>
        </Button>
        <Button variant="secondary" onClick={onShare} className="min-h-11 gap-2" aria-label="Share room code">
          <Share2 className="h-4 w-4" />
          SHARE
        </Button>
      </div>
      <p className="text-center text-xs text-muted">Share this code with your friends to join the game.</p>
    </div>
  );
}

const PlayerRow = memo(function PlayerRow({ player, isMe }: { player: PlayerPublic; isMe: boolean }) {
  const hex = COLOR_HEX[player.color];
  return (
    <li
      className="ludo-enter flex items-center gap-3 rounded-2xl border bg-white/[0.035] px-3 py-2.5"
      style={{ borderColor: `${hex}55` }}
    >
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-black"
        style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${hex} 45%, ${COLOR_DARK[player.color]})` }}
      >
        {(player.name[0] ?? '?').toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {EMOJI[player.color]} {player.name}
            {isMe && <span className="ml-1 font-normal text-muted">(You)</span>}
          </span>
          {player.host && (
            <span className="shrink-0 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
              Host
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs">
          {!player.connected ? (
            <span className="flex items-center gap-1.5 text-rose-300">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              Disconnected
            </span>
          ) : player.ready ? (
            <span className="flex items-center gap-1 font-medium text-emerald-300">
              <Check className="ludo-enter h-3.5 w-3.5" />
              Ready ✓
            </span>
          ) : (
            <span className="text-muted">Not ready</span>
          )}
        </div>
      </div>
    </li>
  );
});

function EmptySlot({ index }: { index: number }) {
  const hint = DEFAULT_COLOR_ORDER[index];
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-3 py-2.5 opacity-70">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-lg"
      >
        {hint ? EMOJI[hint] : '·'}
      </span>
      <span className="text-sm text-muted">Waiting for player…</span>
    </li>
  );
}

interface LudoLobbyProps {
  room: RoomState;
  playerId: string;
  api: LudoRoomApi;
}

/** The pre-game room: code, players, colour choice, ready, and the host's Start button. */
export function LudoLobby({ room, playerId, api }: LudoLobbyProps) {
  const me = room.players.find((p) => p.id === playerId);
  const isHost = room.hostId === playerId;
  const connected = room.players.filter((p) => p.connected);
  const readyCount = connected.filter((p) => p.ready).length;
  const canStart = isHost && room.status === 'lobby' && connected.length >= MIN_PLAYERS && connected.length === room.players.length && readyCount === connected.length;
  const takenBy = (c: PlayerColor) => room.players.find((p) => p.color === c && p.id !== playerId);

  let hint = '';
  if (isHost) {
    if (room.players.length < MIN_PLAYERS) hint = 'Waiting for at least one more player';
    else if (connected.length < room.players.length) hint = 'Waiting for a player to reconnect';
    else if (readyCount < connected.length) hint = 'Everyone needs to be ready';
  } else hint = 'Waiting for the host to start';

  return (
    <div className="ludo-enter mx-auto flex w-full max-w-md flex-col gap-5 pb-2">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-[0.3em] text-foreground">LUDO ROOM</h2>
      </div>

      <RoomCode code={room.code} onToast={api.toast} />

      <section aria-label="Players" className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-subtle">
            <Users className="h-3.5 w-3.5" />
            Players
          </h3>
          <span className="text-xs font-semibold tabular-nums text-foreground-soft">
            {room.players.length}/{MAX_PLAYERS}
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {room.players.map((p) => (
            <PlayerRow key={p.id} player={p} isMe={p.id === playerId} />
          ))}
          {Array.from({ length: MAX_PLAYERS - room.players.length }, (_, i) => (
            <EmptySlot key={`empty-${i}`} index={room.players.length + i} />
          ))}
        </ul>
      </section>

      {me && (
        <section aria-label="Choose your colour" className="flex flex-col gap-2.5">
          <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-subtle">Your colour</h3>
          <div role="radiogroup" aria-label="Your colour" className="grid grid-cols-4 gap-2">
            {DEFAULT_COLOR_ORDER.map((c) => {
              const owner = takenBy(c);
              const selected = me.color === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${COLOR_NAME[c]}${owner ? ', taken' : ''}`}
                  disabled={!!owner}
                  onClick={() => !selected && void api.setColor(c)}
                  className={cn(
                    'relative flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:active:scale-95',
                    selected ? 'bg-white/[0.08] text-foreground' : 'border-border bg-white/[0.02] text-muted',
                    owner && 'cursor-not-allowed opacity-45',
                  )}
                  style={selected ? { borderColor: COLOR_HEX[c], boxShadow: `0 0 18px -6px ${COLOR_HEX[c]}` } : undefined}
                >
                  <span className="h-5 w-5 rounded-full" style={{ background: COLOR_HEX[c], boxShadow: `inset 0 -2px 3px ${COLOR_DARK[c]}` }} />
                  {owner ? <span className="text-[9px] tracking-wider text-amber-300">TAKEN</span> : COLOR_NAME[c]}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-white/[0.025] p-3.5">
        <div className="flex items-center justify-between text-xs tabular-nums text-muted">
          <span>
            {connected.length}/{MAX_PLAYERS} Players
          </span>
          <span>
            {readyCount}/{connected.length} Ready
          </span>
        </div>
        <Button
          variant={me?.ready ? 'secondary' : 'primary'}
          size="lg"
          className="min-h-12 w-full tracking-[0.14em]"
          onClick={() => void api.setReady(!me?.ready)}
          aria-pressed={me?.ready}
        >
          {me?.ready ? (
            <>
              <Check className="h-4 w-4 text-emerald-400" />
              READY ✓
            </>
          ) : (
            'READY'
          )}
        </Button>
        {isHost && (
          <Button size="lg" className="min-h-12 w-full tracking-[0.14em]" onClick={() => void api.startGame()} disabled={!canStart}>
            START GAME
          </Button>
        )}
        <p className="min-h-4 text-center text-xs text-muted" aria-live="polite">
          {hint}
        </p>
      </section>

      <div className="flex gap-2">
        <Button variant="ghost" className="min-h-11 flex-1 gap-2" onClick={api.leave}>
          <LogOut className="h-4 w-4" />
          Leave room
        </Button>
        {isHost && (
          <Button variant="danger" className="min-h-11 flex-1 gap-2" onClick={() => void api.closeRoom()}>
            <Trash2 className="h-4 w-4" />
            Close room
          </Button>
        )}
      </div>
    </div>
  );
}
