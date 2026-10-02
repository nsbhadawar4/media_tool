import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { findGame } from '../games';
import { LudoLoader } from '../loaders/LudoLoader';
import { MemoryMatchLoader } from '../loaders/MemoryMatchLoader';
import { NumberPuzzleLoader } from '../loaders/NumberPuzzleLoader';
import { ReactionTestLoader } from '../loaders/ReactionTestLoader';
import { SnakeLoader } from '../loaders/SnakeLoader';
import { TargetClickLoader } from '../loaders/TargetClickLoader';
import { WaterRaceLoader } from '../loaders/WaterRaceLoader';

/** The slugs that have a loader. These are the routes under /games/[slug]. */
export type GameLoaderVariant =
  | 'ludo'
  | 'snake'
  | 'memory-match'
  | 'number-puzzle'
  | 'reaction-test'
  | 'target-click'
  | 'water-race';

const VISUALS: Record<GameLoaderVariant, () => ReactNode> = {
  ludo: () => <LudoLoader />,
  snake: () => <SnakeLoader />,
  'memory-match': () => <MemoryMatchLoader />,
  'number-puzzle': () => <NumberPuzzleLoader />,
  'reaction-test': () => <ReactionTestLoader />,
  'target-click': () => <TargetClickLoader />,
  'water-race': () => <WaterRaceLoader />,
};

export function isGameLoaderVariant(slug: string): slug is GameLoaderVariant {
  return Object.prototype.hasOwnProperty.call(VISUALS, slug);
}

export type GameLoadingLayout =
  /** Fills the game area it sits in (inside GameLayout). */
  | 'inline'
  /** Before the game frame exists but inside the app shell: covers the phone screen, sits in the page on desktop. */
  | 'screen'
  /** Before the app shell exists (while the session is being checked): covers the whole viewport. */
  | 'boot';

interface GameLoadingProps {
  variant: GameLoaderVariant;
  label?: string;
  layout?: GameLoadingLayout;
  children?: ReactNode;
}

/** Same offset as the phone game header, so the visual does not move when the real frame replaces it. */
const MOBILE_FRAME =
  'fixed inset-0 z-40 pt-[calc(57px+env(safe-area-inset-top,0px))] pb-[env(safe-area-inset-bottom,0px)]';

const LAYOUTS: Record<GameLoadingLayout, string> = {
  inline: 'max-md:min-h-[260px] max-md:flex-1 md:min-h-[420px]',
  screen: `${MOBILE_FRAME} bg-background md:static md:z-auto md:min-h-[60dvh] md:bg-transparent md:p-0`,
  boot: `${MOBILE_FRAME} bg-background md:pt-0`,
};

/**
 * The one loading state for every game: a game-specific picture, the game's name and a status line,
 * centred with grid `place-items-center` over the whole available area. It is used as the very first
 * thing on screen (before the session check and before the game code arrives), so there is never a
 * generic spinner in front of it. Every variant shares size, type and spacing; only the picture differs.
 */
export function GameLoading({ variant, label = 'Loading game...', layout = 'inline', children }: GameLoadingProps) {
  const game = findGame(variant);
  const glow = game?.colors[0] ?? '#7c5cff';
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${game?.name ?? 'Game'}: ${label}`}
      className={cn('gl-fadein grid w-full place-items-center overflow-hidden', LAYOUTS[layout])}
      style={{ backgroundImage: `radial-gradient(55% 40% at 50% 46%, color-mix(in srgb, ${glow} 12%, transparent), transparent 75%)` }}
    >
      <div className="flex flex-col items-center gap-5 text-center">
        {VISUALS[variant]()}
        <div>
          <p className="text-lg font-bold uppercase tracking-[0.28em] text-foreground">{game?.name ?? variant}</p>
          <p className="ludo-load-text mt-1.5 text-xs text-muted">{label}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
