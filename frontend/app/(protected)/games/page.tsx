'use client';

import { useMemo, useState } from 'react';
import { Gamepad2, SearchX } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { GameCard } from '@/components/games/GameCard';
import { GAME_CATEGORIES } from '@/components/games/games';
import { useContentCatalog } from '@/lib/content/useContentCatalog';

type Category = (typeof GAME_CATEGORIES)[number];

/** The mini-game hub. Everything on it runs in the browser; nothing is saved. */
export default function GamesPage() {
  // The games an administrator has listed, in their order and under their names.
  const GAMES = useContentCatalog().arcadeGames;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('All');

  const tabs = useMemo(
    () =>
      GAME_CATEGORIES.map((value) => ({
        value,
        label: value,
        count: value === 'All' ? GAMES.length : GAMES.filter((game) => game.category === value).length,
      })),
    [GAMES],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return GAMES.filter(
      (game) =>
        (category === 'All' || game.category === category) &&
        (query === '' ||
          game.name.toLowerCase().includes(query) ||
          game.description.toLowerCase().includes(query)),
    );
  }, [search, category, GAMES]);

  return (
    <div>
      <PageHeader
        icon={Gamepad2}
        eyebrow={`${GAMES.length} Games`}
        title="Games"
        description="Take a quick break and play some mini games."
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput value={search} onChange={setSearch} placeholder="Search games…" className="lg:max-w-xs" />
        <div className="flex min-w-0 items-center gap-3">
          <Tabs tabs={tabs} value={category} onChange={setCategory} aria-label="Game category" />
          <p className="hidden shrink-0 text-xs text-muted sm:block" aria-live="polite">
            {visible.length} {visible.length === 1 ? 'game' : 'games'}
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No games found"
          description="Nothing matches that search. Try another name or category."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearch('');
                setCategory('All');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          {visible.map((game, index) => (
            <GameCard key={game.slug} game={game} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
