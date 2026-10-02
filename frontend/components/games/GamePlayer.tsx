'use client';

import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Gamepad2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

function GameSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4" role="status" aria-label="Loading game">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-14 w-72" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-3xl" />
    </div>
  );
}

/** Each game is its own chunk, so the hub page does not pay for code it may never run. */
const load = (importer: () => Promise<{ default: ComponentType }>) =>
  dynamic(importer, { loading: () => <GameSkeleton /> });

const PLAYERS: Record<string, ComponentType> = {
  'water-race': load(() => import('./water-race/WaterRace')),
  'memory-match': load(() => import('./memory-match/MemoryMatch')),
  'reaction-test': load(() => import('./reaction-test/ReactionTest')),
  'target-click': load(() => import('./target-click/TargetClick')),
  'number-puzzle': load(() => import('./number-puzzle/NumberPuzzle')),
  snake: load(() => import('./snake/SnakeGame')),
  ludo: load(() => import('./ludo/LudoGame')),
};

/** Picks the game for a URL slug, or says plainly that there is no such game. */
export function GamePlayer({ slug }: { slug: string }) {
  const Game = PLAYERS[slug];

  if (!Game) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <EmptyState
          icon={Gamepad2}
          title="Game not found"
          description="That game does not exist. Head back to the hub to pick one."
          action={
            <Link
              href="/games"
              className="btn-primary inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-accent-foreground"
            >
              Back to Games
            </Link>
          }
        />
      </div>
    );
  }
  return <Game />;
}
