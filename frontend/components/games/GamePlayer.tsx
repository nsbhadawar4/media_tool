'use client';

import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Gamepad2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { GameLoading, isGameLoaderVariant, type GameLoaderVariant } from './shared/GameLoading';
import { useContentCatalog } from '@/lib/content/useContentCatalog';

/**
 * Each game is its own chunk, so the hub page does not pay for code it may never run. While a chunk
 * loads, the fallback is that game's own loader (never a generic skeleton or spinner).
 */
const load = (slug: GameLoaderVariant, importer: () => Promise<{ default: ComponentType }>) =>
  dynamic(importer, { loading: () => <GameLoading variant={slug} layout="screen" /> });

const PLAYERS: Record<GameLoaderVariant, ComponentType> = {
  'water-race': load('water-race', () => import('./water-race/WaterRace')),
  'memory-match': load('memory-match', () => import('./memory-match/MemoryMatch')),
  'reaction-test': load('reaction-test', () => import('./reaction-test/ReactionTest')),
  'target-click': load('target-click', () => import('./target-click/TargetClick')),
  'number-puzzle': load('number-puzzle', () => import('./number-puzzle/NumberPuzzle')),
  snake: load('snake', () => import('./snake/SnakeGame')),
  ludo: load('ludo', () => import('./ludo/LudoGame')),
};

/** Picks the game for a URL slug, or says plainly that there is no such game. */
export function GamePlayer({ slug }: { slug: string }) {
  const Game = isGameLoaderVariant(slug) ? PLAYERS[slug] : undefined;
  // A game an administrator has switched off doesn't open; wait for the catalog before deciding.
  const catalog = useContentCatalog();
  if (Game && !catalog.settled) return <GameLoading variant={slug as GameLoaderVariant} layout="screen" />;
  const unavailable = Boolean(Game) && !catalog.isArcadePlayable(slug);

  if (!Game || unavailable) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <EmptyState
          icon={Gamepad2}
          title={unavailable ? 'Not available right now' : 'Game not found'}
          description={unavailable ? 'This game has been switched off for now. Pick another one from the hub.' : 'That game does not exist. Head back to the hub to pick one.'}
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
