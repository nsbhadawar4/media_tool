'use client';

import { useState, type ReactNode } from 'react';
import { ArrowLeft, CircleHelp } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { BackToGames } from './BackToGames';
import { GameExitButton, GameLeaveProvider, useGameLeave, type GameLeaveConfig } from './GameLeave';
import { GameHeader, StatsStrip, type GameStat } from './GameHeader';
import { GameInstructions } from './GameInstructions';
import type { GameMeta } from './games';

interface GameFullscreenLayoutProps {
  game: GameMeta;
  stats: GameStat[];
  /** The playing surface. Overlays (start, result) are positioned against the screen on phones. */
  children: ReactNode;
  /** A GameControls row. Pinned to the bottom edge on phones. */
  controls?: ReactNode;
  /** When set, leaving the game asks for confirmation and runs `onLeave` (see GameLeave). */
  leave?: GameLeaveConfig;
}

/**
 * The one frame every game uses.
 *
 * Below 768px it is an immersive full-screen experience: a fixed layer exactly one dynamic
 * viewport tall, with a slim header (Back, title, help), the live figures pinned under it,
 * the board filling the middle, and the controls pinned to the bottom above the home
 * indicator. The app's own sidebar, header and tab bar are hidden by AdminShell for these
 * routes, so nothing else competes for the screen.
 *
 * From 768px up it is the original in-app layout. It is a single tree styled by breakpoint
 * rather than two trees, so the game itself is mounted exactly once either way.
 */
export function GameFullscreenLayout({ leave, ...props }: GameFullscreenLayoutProps) {
  return (
    <GameLeaveProvider leave={leave}>
      <GameFrame {...props} hasExit={!!leave} />
    </GameLeaveProvider>
  );
}

/** Desktop "Back to Games" link: goes through the same leave flow as the phone Back button. */
function DesktopBack() {
  const leave = useGameLeave();
  return (
    <button
      type="button"
      onClick={leave}
      className="group mb-5 inline-flex items-center gap-2 rounded-lg py-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
      Back to Games
    </button>
  );
}

function GameFrame({ game, stats, children, controls, hasExit }: Omit<GameFullscreenLayoutProps, 'leave'> & { hasExit: boolean }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [c1, c2] = game.colors;

  return (
    <div className="game-screen gl-fadein max-md:fixed max-md:inset-0 max-md:z-40 max-md:flex max-md:flex-col max-md:overflow-x-hidden max-md:overflow-y-auto max-md:overscroll-contain max-md:bg-background md:mx-auto md:w-full md:max-w-4xl">
      {/* Phone only: a wash of the game's own colour at the top of the screen. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 md:hidden"
        style={{
          backgroundImage: `radial-gradient(90% 100% at 50% -20%, color-mix(in srgb, ${c1} 28%, transparent), transparent 70%), radial-gradient(60% 60% at 100% 0%, color-mix(in srgb, ${c2} 18%, transparent), transparent 70%)`,
        }}
      />

      {/* ---- Phone header: Back, title, help; figures stay visible underneath ---- */}
      <div className="game-safe-top sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md md:hidden">
        <div className="grid h-14 grid-cols-[auto_1fr_auto] items-center gap-2 px-3">
          <BackToGames />
          <h1 className="truncate text-center text-base font-semibold tracking-tight text-foreground">{game.name}</h1>
          {hasExit ? (
            <GameExitButton />
          ) : (
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="How to play"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border-strong bg-surface-elevated/80 text-muted transition duration-150 hover:text-foreground active:scale-95"
          >
            <CircleHelp className="h-5 w-5" />
          </button>
          )}
        </div>
        <StatsStrip stats={stats} compact />
      </div>

      {/* ---- Tablet / desktop header ---- */}
      <div className="max-md:hidden">
        <DesktopBack />
        <GameHeader game={game} stats={stats} actions={hasExit ? <GameExitButton /> : undefined} />
      </div>

      {/* ---- Board ---- */}
      <div className="game-surface relative max-md:flex max-md:flex-1 max-md:flex-col max-md:justify-center max-md:px-4 max-md:py-4 md:overflow-hidden md:rounded-3xl md:border md:border-border md:bg-surface md:p-5 md:shadow-card">
        {children}
      </div>

      {/* ---- Controls ---- */}
      {controls && (
        <div className="game-safe-bottom max-md:sticky max-md:bottom-0 max-md:z-20 max-md:border-t max-md:border-border max-md:bg-background/85 max-md:px-4 max-md:pt-3 max-md:backdrop-blur-md">
          {controls}
        </div>
      )}

      <div className="max-md:hidden">
        <GameInstructions steps={game.instructions} />
      </div>

      {/* Phone: the rules live in a sheet so they never take screen from the game. */}
      <Modal isOpen={helpOpen} onClose={() => setHelpOpen(false)} title="How to play" size="sm">
        <ol className="space-y-3 text-sm text-muted">
          {game.instructions.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11px] font-semibold text-foreground-soft">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Modal>
    </div>
  );
}
