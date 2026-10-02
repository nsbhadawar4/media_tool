import type { ReactNode } from 'react';
import { GameFullscreenLayout } from './GameFullscreenLayout';
import type { GameLeaveConfig } from './GameLeave';
import type { GameStat } from './GameHeader';
import type { GameMeta } from './games';

interface GameLayoutProps {
  game: GameMeta;
  stats: GameStat[];
  children: ReactNode;
  controls?: ReactNode;
  leave?: GameLeaveConfig;
}

/**
 * The frame the five games share. All of the responsive behaviour — the immersive phone
 * screen and the in-app desktop layout — lives in GameFullscreenLayout; this stays as the
 * single entry point the games import.
 */
export function GameLayout(props: GameLayoutProps) {
  return <GameFullscreenLayout {...props} />;
}
