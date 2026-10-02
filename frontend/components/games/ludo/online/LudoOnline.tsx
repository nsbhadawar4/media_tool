'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Check, Copy, LogOut } from 'lucide-react';
import { MAX_PLAYERS } from 'ludo-core';
import { Button } from '@/components/ui/Button';
import { GameControls } from '../../GameControls';
import { GameLayout } from '../../GameLayout';
import { useGameLeave } from '../../GameLeave';
import { findGame } from '../../games';
import { SoundToggle, useGameSound } from '../../useGameSound';
import { LudoRules } from '../LudoRules';
import { LUDO_CSS } from '../ludoStyles';
import { ConnectionBadge } from './ConnectionBadge';
import { LudoLobby } from './LudoLobby';
import { LudoOnlineGame } from './LudoOnlineGame';
import { OnlineEntry } from './OnlineEntry';
import { StartCountdown } from './StartCountdown';
import { ToastStack } from './ToastStack';
import { useLudoRoom } from './useLudoRoom';

/** Leave button: confirms during a running game; leaving clears the saved seat and returns to /games. */
function LeaveButton() {
  const leave = useGameLeave();
  return (
    <Button variant="ghost" onClick={leave} className="gap-2">
      <LogOut className="h-4 w-4" />
      Leave
    </Button>
  );
}

/** Online Ludo: entry (create / join) → lobby → live game, all driven by the server's room state. */
export function LudoOnline({ onMenu }: { onMenu: () => void }) {
  const game = findGame('ludo')!;
  const api = useLudoRoom();
  const sound = useGameSound();
  const { room, playerId, connection, closedReason } = api;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [copied, setCopied] = useState(false);

  // A reload mid-game: the tab remembers its seat, so rejoin the same room.
  const { resume } = api;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResuming(resume());
  }, [resume]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (room) setResuming(false);
  }, [room]);
  useEffect(() => {
    if (connection === 'disconnected' || connection === 'unavailable') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResuming(false);
    }
  }, [connection]);

  const { toast, clearClosed } = api;
  useEffect(() => {
    if (closedReason) {
      toast(closedReason, 'error');
      clearClosed();
    }
  }, [closedReason, toast, clearClosed]);

  const copyCode = useCallback(async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast('Could not copy the code.', 'error');
    }
  }, [room, toast]);

  const inGame = room && (room.status === 'playing' || room.status === 'finished') && room.game && playerId;
  const inLobby = room && (room.status === 'lobby' || room.status === 'starting') && playerId;

  const controls = (
    <GameControls>
      {room ? (
        <LeaveButton />
      ) : (
        <Button variant="ghost" onClick={onMenu} className="gap-2">
          Back
        </Button>
      )}
      <Button variant="secondary" onClick={() => setRulesOpen(true)} className="gap-2">
        <BookOpen className="h-4 w-4" />
        Rules
      </Button>
      <SoundToggle muted={sound.muted} onToggle={sound.toggleMute} />
    </GameControls>
  );

  return (
    <GameLayout
      game={game}
      stats={[]}
      controls={controls}
      leave={{ confirm: room?.status === 'playing', onLeave: api.leave }}
    >
      <style>{LUDO_CSS}</style>

      {room && playerId && (
        <div className="mx-auto mb-3 flex w-full max-w-[600px] flex-wrap items-center justify-between gap-2">
          <ConnectionBadge state={connection} />
          <button
            type="button"
            onClick={() => void copyCode()}
            aria-label={`Room ${room.code}, tap to copy`}
            className="inline-flex h-9 min-w-[44px] items-center gap-2 rounded-full border border-border-strong bg-white/[0.04] px-3 font-mono text-xs font-bold tracking-[0.25em] text-foreground transition hover:bg-white/[0.08] active:scale-95"
          >
            ROOM {room.code}
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-muted" />}
          </button>
          <span className="text-xs font-semibold tabular-nums text-muted">
            {room.players.filter((p) => p.connected).length}/{MAX_PLAYERS} online
          </span>
        </div>
      )}

      {!room ? (
        resuming ? (
          <div className="mx-auto flex min-h-[260px] w-full max-w-sm flex-col items-center justify-center gap-3 text-center">
            <ConnectionBadge state={connection === 'connected' ? 'connecting' : connection} />
            <p className="text-sm text-muted">Rejoining your room…</p>
          </div>
        ) : (
          <OnlineEntry api={api} connection={connection} onMenu={onMenu} />
        )
      ) : inGame ? (
        <LudoOnlineGame room={room} playerId={playerId!} api={api} sound={sound} onBackToLobby={() => void api.restart()} />
      ) : inLobby ? (
        <>
          <LudoLobby room={room} playerId={playerId!} api={api} />
          {room.status === 'starting' && <StartCountdown />}
        </>
      ) : null}

      <LudoRules open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <ToastStack toasts={api.toasts} onDismiss={api.dismissToast} />
    </GameLayout>
  );
}
