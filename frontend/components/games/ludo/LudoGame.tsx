'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe2, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { GameLayout } from '../GameLayout';
import { findGame } from '../games';
import LudoLocal from './LudoLocal';
import { LudoOnline } from './online/LudoOnline';
import { GameLoading } from '../shared/GameLoading';
import { clearLudoSession, loadLudoSession, type PersistedLocalGame } from './persistence';

type View =
  /** First render: identical on server and client. Browser storage is only read afterwards. */
  | { kind: 'boot' }
  | { kind: 'restoring'; local: PersistedLocalGame }
  | { kind: 'expired' }
  | { kind: 'menu' }
  | { kind: 'local'; restore?: PersistedLocalGame }
  | { kind: 'online' };

/** How long "Restoring your game..." stays up, so it reads as a state rather than a flicker. */
const RESTORE_MS = 450;

/**
 * Ludo's entry point. On load it looks for a saved session and continues it; the setup screen
 * and the menu only appear when there is nothing valid to resume.
 */
export default function LudoGame() {
  const game = findGame('ludo')!;
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: 'boot' });

  useEffect(() => {
    const read = loadLudoSession();
    if (read.kind === 'none') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView({ kind: 'menu' });
    } else if (read.kind === 'expired') {
      setView({ kind: 'expired' });
    } else if (read.session.gameMode === 'multiplayer') {
      // The server is authoritative: LudoOnline reconnects with the saved identity and rejoins.
      setView({ kind: 'online' });
    } else {
      setView({ kind: 'restoring', local: read.session.local! });
    }
  }, []);

  useEffect(() => {
    if (view.kind !== 'restoring') return;
    const local = view.local;
    const id = setTimeout(() => setView({ kind: 'local', restore: local }), RESTORE_MS);
    return () => clearTimeout(id);
  }, [view]);

  if (view.kind === 'local') return <LudoLocal restore={view.restore} onMenu={() => setView({ kind: 'menu' })} />;
  if (view.kind === 'online') return <LudoOnline onMenu={() => setView({ kind: 'menu' })} />;

  return (
    <GameLayout game={game} stats={[]}>
      {view.kind === 'boot' && <GameLoading variant="ludo" />}

      {view.kind === 'restoring' && <GameLoading variant="ludo" label="Restoring your game..." />}

      {view.kind === 'expired' && (
        <div className="ludo-enter mx-auto flex min-h-[420px] w-full max-w-sm flex-col items-center justify-center gap-4 text-center">
          <h2 className="text-xl font-semibold text-foreground">Your previous Ludo session has expired.</h2>
          <Button
            size="lg"
            className="min-h-12 w-full"
            onClick={() => {
              clearLudoSession();
              setView({ kind: 'menu' });
            }}
          >
            START NEW GAME
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="min-h-12 w-full"
            onClick={() => {
              clearLudoSession();
              router.push('/games');
            }}
          >
            BACK TO GAMES
          </Button>
        </div>
      )}

      {view.kind === 'menu' && (
        <div className="ludo-enter mx-auto flex min-h-[420px] w-full max-w-sm flex-col items-center justify-center gap-4 py-8 text-center">
          <h2 className="text-3xl font-bold tracking-[0.3em] text-foreground">LUDO</h2>
          <p className="text-sm text-muted">Classic Multiplayer Board Game</p>
          <button
            type="button"
            onClick={() => setView({ kind: 'online' })}
            className="group flex min-h-16 w-full items-center gap-4 rounded-2xl border border-accent/50 bg-accent/10 px-5 py-3 text-left shadow-[0_0_30px_-14px_#7c5cff] transition duration-200 hover:bg-accent/15 active:scale-[0.98]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent-2">
              <Globe2 className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-base font-semibold text-foreground">Online Multiplayer</span>
              <span className="block text-xs text-muted">Create a room and share the code with friends</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setView({ kind: 'local' })}
            className="group flex min-h-16 w-full items-center gap-4 rounded-2xl border border-border bg-white/[0.03] px-5 py-3 text-left transition duration-200 hover:border-border-strong active:scale-[0.98]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-foreground-soft">
              <Users className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-base font-semibold text-foreground">Play on this device</span>
              <span className="block text-xs text-muted">Pass-and-play, or take on Easy / Medium / Hard bots</span>
            </span>
          </button>
        </div>
      )}
    </GameLayout>
  );
}
