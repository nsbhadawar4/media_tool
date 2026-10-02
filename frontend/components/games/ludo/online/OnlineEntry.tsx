'use client';

import { useState, type FormEvent } from 'react';
import { ArrowLeft, LogIn, Plus } from 'lucide-react';
import { MAX_PLAYERS, NAME_MAX, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from 'ludo-core';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { ConnectionBadge } from './ConnectionBadge';
import type { Connection, LudoRoomApi } from './useLudoRoom';

const ALLOWED = new Set(ROOM_CODE_ALPHABET);

/** Uppercases, drops spaces and anything outside the room-code alphabet, caps the length. */
export function cleanCodeInput(raw: string): string {
  return [...raw.toUpperCase()].filter((c) => ALLOWED.has(c)).join('').slice(0, ROOM_CODE_LENGTH);
}

interface OnlineEntryProps {
  api: LudoRoomApi;
  connection: Connection;
  onMenu: () => void;
}

type Field = 'name' | 'code' | 'form';

/** Name, then Create Room or Join Room. Errors show inline under the field that caused them. */
export function OnlineEntry({ api, connection, onMenu }: OnlineEntryProps) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'choose' | 'join'>('choose');
  const [code, setCode] = useState('');
  const [error, setError] = useState<{ field: Field; text: string } | null>(null);
  const [busy, setBusy] = useState(false);


  const validName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError({ field: 'name', text: 'Enter your name first.' });
      return null;
    }
    return trimmed;
  };

  const create = async () => {
    const n = validName();
    if (!n || busy) return;
    setBusy(true);
    setError(null);
    const ack = await api.createRoom(n);
    setBusy(false);
    if (!ack.ok) setError({ field: 'form', text: ack.error ?? 'Could not create a room.' });
  };

  const join = async (e?: FormEvent) => {
    e?.preventDefault();
    const n = validName();
    if (!n || busy) return;
    if (code.length !== ROOM_CODE_LENGTH) {
      setError({ field: 'code', text: `Enter the ${ROOM_CODE_LENGTH}-character room code.` });
      return;
    }
    setBusy(true);
    setError(null);
    const ack = await api.joinRoom(code, n);
    setBusy(false);
    if (!ack.ok) setError({ field: 'code', text: ack.error ?? 'Room not found.' });
  };

  const unavailable = connection === 'unavailable';

  return (
    <div className="ludo-enter mx-auto flex w-full max-w-sm flex-col gap-5 rounded-3xl border border-border-strong bg-white/[0.03] p-5 shadow-pop sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={
            mode === 'join'
              ? () => {
                  setMode('choose');
                  setError(null);
                }
              : onMenu
          }
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg pr-2 text-sm font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        {connection !== 'idle' && <ConnectionBadge state={connection} />}
      </div>

      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-[0.3em] text-foreground">LUDO</h2>
        <p className="mt-1 text-sm text-muted">
          Online Multiplayer · 2–{MAX_PLAYERS} players
        </p>
      </div>

      <label className="block text-left">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-subtle">Your name</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value.slice(0, NAME_MAX));
            if (error?.field === 'name') setError(null);
          }}
          maxLength={NAME_MAX}
          autoComplete="nickname"
          placeholder="e.g. Narayan"
          aria-invalid={error?.field === 'name'}
          aria-describedby={error?.field === 'name' ? 'ludo-name-error' : undefined}
          className={cn(
            'h-12 w-full rounded-xl border bg-background/60 px-4 text-base text-foreground placeholder:text-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            error?.field === 'name' ? 'border-rose-400' : 'border-border-strong',
          )}
        />
        {error?.field === 'name' && (
          <span id="ludo-name-error" role="alert" className="mt-1.5 block text-xs text-rose-400">
            {error.text}
          </span>
        )}
      </label>

      {unavailable && (
        <p role="alert" className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-left text-xs text-amber-200">
          Online play needs the realtime server. Set <code className="font-mono">NEXT_PUBLIC_REALTIME_URL</code> (see the README).
        </p>
      )}

      {mode === 'choose' ? (
        <div className="flex flex-col gap-3">
          <Button size="lg" className="min-h-12 w-full tracking-[0.14em]" onClick={create} isLoading={busy} disabled={unavailable}>
            {!busy && <Plus className="h-4 w-4" />}
            CREATE ROOM
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="min-h-12 w-full tracking-[0.14em]"
            onClick={() => {
              if (validName()) {
                setMode('join');
                setError(null);
              }
            }}
            disabled={busy || unavailable}
          >
            <LogIn className="h-4 w-4" />
            JOIN ROOM
          </Button>
          {error?.field === 'form' && (
            <p role="alert" className="text-center text-xs text-rose-400">
              {error.text}
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={join} className="flex flex-col gap-3">
          <label className="block text-left">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-subtle">Enter room code</span>
            <input
              value={code}
              onChange={(e) => {
                setCode(cleanCodeInput(e.target.value));
                if (error?.field === 'code') setError(null);
              }}
              autoFocus
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={ROOM_CODE_LENGTH}
              placeholder="A7K9P2"
              aria-label="Room code"
              aria-invalid={error?.field === 'code'}
              aria-describedby={error?.field === 'code' ? 'ludo-code-error' : undefined}
              className={cn(
                'h-14 w-full rounded-xl border bg-background/60 px-3 text-center font-mono text-2xl font-bold uppercase tracking-[0.3em] text-foreground placeholder:text-subtle/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                error?.field === 'code' ? 'border-rose-400' : 'border-border-strong',
              )}
            />
            {error?.field === 'code' && (
              <span id="ludo-code-error" role="alert" className="mt-1.5 block text-xs text-rose-400">
                {error.text}
              </span>
            )}
          </label>
          <Button type="submit" size="lg" className="min-h-12 w-full tracking-[0.14em]" isLoading={busy} disabled={unavailable}>
            JOIN ROOM
          </Button>
        </form>
      )}
    </div>
  );
}
