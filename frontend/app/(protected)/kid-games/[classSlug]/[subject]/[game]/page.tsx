'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { KidGameLoader } from '@/components/kid-games/loaders/KidGameLoader';
import type { Subject } from '@/lib/kid-games/types';

/*
 * The player (engines and all) is its own chunk, so the hub pages never download it. While it
 * arrives, the subject's own loader is on screen; the three wrappers share one chunk and differ
 * only in which loader they show.
 */
const importPlayer = () => import('@/components/kid-games/player/KidGamePlayer').then((m) => m.KidGamePlayer);
const PLAYERS = {
  hindi: dynamic(importPlayer, { loading: () => <KidGameLoader variant="hindi" layout="screen" /> }),
  english: dynamic(importPlayer, { loading: () => <KidGameLoader variant="english" layout="screen" /> }),
  math: dynamic(importPlayer, { loading: () => <KidGameLoader variant="math" layout="screen" /> }),
} satisfies Record<Subject, unknown>;

/** /kid-games/class-3/math/addition-adventure: every one of the 150 games is this one route. */
export default function KidGameRoute() {
  const { classSlug, subject, game } = useParams<{ classSlug: string; subject: string; game: string }>();
  const Player = PLAYERS[subject as Subject] ?? PLAYERS.math;
  return <Player classSlug={classSlug} subjectSlug={subject} slot={game} />;
}
