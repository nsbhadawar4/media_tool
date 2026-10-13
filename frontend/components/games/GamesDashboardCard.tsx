'use client';

import Link from 'next/link';
import { ArrowRight, Gamepad2, Star } from 'lucide-react';
import type { GameMeta } from './games';

/**
 * The dashboard's way into the games: every listed game as a small tile that opens it, and a
 * link to the full hub. `games` is the catalog's list (what an administrator has made visible,
 * in their order), so the dashboard never offers a game the hub doesn't.
 */
export function GamesDashboardCard({ games, featured = () => false }: { games: readonly GameMeta[]; featured?: (slug: string) => boolean }) {
  return (
    <section aria-label="Games" className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-card"
            style={{ backgroundImage: 'linear-gradient(135deg, #f472b6, #10b981)' }}
          >
            <Gamepad2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-foreground">Games</h2>
            <p className="text-xs text-muted">
              {games.length} {games.length === 1 ? 'game' : 'games'} for a quick break
            </p>
          </div>
        </div>
        <Link
          href="/games"
          className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-accent transition hover:underline lg:min-h-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          All games
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
        {games.map((game) => {
          const Icon = game.icon;
          return (
            <li key={game.slug} className="min-w-0">
              <Link
                href={`/games/${game.slug}`}
                aria-label={`Play ${game.name}`}
                className="card-interactive group flex min-w-0 flex-col items-start gap-2 rounded-xl border border-border bg-surface-hover/30 p-2.5 sm:flex-row sm:items-center sm:gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white transition-transform duration-200 group-hover:scale-105"
                  style={{ backgroundImage: `linear-gradient(135deg, ${game.colors[0]}, ${game.colors[1]})` }}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <span className="w-full min-w-0">
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-sm font-medium text-foreground">{game.name}</span>
                    {featured(game.slug) && (
                      <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {game.category} · {game.playTime}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
