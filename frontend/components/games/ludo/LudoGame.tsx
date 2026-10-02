'use client';

import { useState } from 'react';
import { Globe2, Users } from 'lucide-react';
import { GameLayout } from '../GameLayout';
import { findGame } from '../games';
import LudoLocal from './LudoLocal';
import { LudoOnline } from './online/LudoOnline';

type View = 'menu' | 'local' | 'online';

/** Ludo's entry point: play on this device (with bots), or play online in a room. */
export default function LudoGame() {
  const [view, setView] = useState<View>('menu');

  if (view === 'local') return <LudoLocal onMenu={() => setView('menu')} />;
  if (view === 'online') return <LudoOnline onMenu={() => setView('menu')} />;

  const game = findGame('ludo')!;
  return (
    <GameLayout game={game} stats={[]}>
      <div className="ludo-enter mx-auto flex min-h-[420px] w-full max-w-sm flex-col items-center justify-center gap-4 py-8 text-center">
        <h2 className="text-3xl font-bold tracking-[0.3em] text-foreground">LUDO</h2>
        <p className="text-sm text-muted">Classic Multiplayer Board Game</p>
        <button
          type="button"
          onClick={() => setView('online')}
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
          onClick={() => setView('local')}
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
    </GameLayout>
  );
}
