'use client';

import { useParams } from 'next/navigation';
import { GamePlayer } from '@/components/games/GamePlayer';

/** One game, full screen: /games/water-race, /games/memory-match, … */
export default function GamePage() {
  const { slug } = useParams<{ slug: string }>();
  return <GamePlayer slug={slug} />;
}
