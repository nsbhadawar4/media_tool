'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, Play } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { GameDifficulty, GameMeta } from './games';

/** Dot colour per level; the pill itself is dark glass so it reads over any artwork. */
const DIFFICULTY_DOT: Record<GameDifficulty, string> = {
  Easy: 'bg-emerald-400',
  Medium: 'bg-amber-400',
  Hard: 'bg-rose-400',
};

/**
 * One game in the hub. The whole card is a link; the artwork zooms, the card lifts, and the
 * Play Now button's arrow slides on hover — but Play Now is always visible, so touch screens
 * lose nothing.
 */
export function GameCard({ game, index = 0 }: { game: GameMeta; index?: number }) {
  const Icon = game.icon;
  const [c1, c2] = game.colors;

  return (
    <article
      style={{ '--i': index } as CSSProperties}
      className="card-interactive card-lift-4 anim-rise-scale group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <Link
        href={`/games/${game.slug}`}
        aria-label={`Play ${game.name}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />

      {/* Artwork */}
      <div className="relative aspect-[16/10] overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.06]"
          style={{ backgroundImage: `linear-gradient(135deg, ${c1}, ${c2})` }}
        >
          {/* Soft shapes so the gradient reads as an illustration rather than a flat fill. */}
          <span className="absolute -right-6 -top-8 h-36 w-36 rounded-full bg-white/20 blur-[2px]" />
          <span className="absolute -bottom-10 left-6 h-28 w-28 rounded-full bg-black/20" />
          <span className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/30 bg-white/10 backdrop-blur-sm" />
          <Icon
            className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"
            strokeWidth={1.6}
          />
        </div>
        <span
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-black/55 via-transparent to-black/10 transition-opacity duration-300 group-hover:opacity-80"
        />

        <span className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-md border border-white/15 bg-black/45 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
          <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', DIFFICULTY_DOT[game.difficulty])} />
          {game.difficulty}
        </span>
        <span className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded-md bg-black/40 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-md">
          <Clock className="h-3 w-3" />
          {game.playTime}
        </span>

        {/* Pointer-only flourish: a play disc fades up over the artwork. */}
        <span className="pointer-events-none absolute inset-0 z-20 hidden items-center justify-center opacity-0 transition-all duration-300 group-hover:opacity-100 lg:flex">
          <span className="flex h-14 w-14 translate-y-2 items-center justify-center rounded-full bg-white/90 text-black shadow-xl transition-transform duration-300 group-hover:translate-y-0">
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          </span>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 border-t border-border p-4">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-base font-semibold tracking-tight text-foreground">{game.name}</h3>
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-subtle">
              {game.category}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">{game.description}</p>
        </div>

        <span className="btn-primary mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-medium text-accent-foreground">
          Play Now
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      </div>
    </article>
  );
}
