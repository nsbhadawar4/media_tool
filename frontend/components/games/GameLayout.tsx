import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { GameHeader, type GameStat } from './GameHeader';
import { GameInstructions } from './GameInstructions';
import type { GameMeta } from './games';

interface GameLayoutProps {
  game: GameMeta;
  stats: GameStat[];
  /** The playing surface; a GameResult overlay covers it. */
  children: ReactNode;
  /** A GameControls row. */
  controls?: ReactNode;
}

/** Common frame for every game: back link, title and live stats, board, controls, rules. */
export function GameLayout({ game, stats, children, controls }: GameLayoutProps) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link
        href="/games"
        className="group mb-5 inline-flex items-center gap-2 rounded-lg py-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
        Back to Games
      </Link>

      <GameHeader game={game} stats={stats} />

      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-3 shadow-card sm:p-5">
        {children}
      </div>

      {controls}
      <GameInstructions steps={game.instructions} />
    </div>
  );
}
