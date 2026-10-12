import { GamePlayer } from '@/components/games/GamePlayer';
import { ContentGate } from '@/components/content/ContentGate';
import { GAMES } from '@/components/games/games';

/**
 * One game, full screen: /games/water-race, /games/memory-match, …
 *
 * A game an administrator disabled is refused here, on the server (the Games feature as a whole is
 * gated by the layout). An unknown slug falls through to the player's own "Game not found".
 */
export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const known = GAMES.some((g) => g.slug === slug);
  return (
    <ContentGate allowed={(catalog) => !known || catalog.isArcadePlayable(slug)} name="This game" back={{ href: '/games', label: 'Back to Games' }}>
      <GamePlayer slug={slug} />
    </ContentGate>
  );
}
