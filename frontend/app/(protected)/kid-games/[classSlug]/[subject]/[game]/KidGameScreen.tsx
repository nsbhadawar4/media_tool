'use client';

import dynamic from 'next/dynamic';
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

/** The player for one Kid Game, behind the server's availability check (page.tsx). */
export function KidGameScreen({ classSlug, subject, game }: { classSlug: string; subject: string; game: string }) {
  const Player = PLAYERS[subject as Subject] ?? PLAYERS.math;
  return <Player classSlug={classSlug} subjectSlug={subject} slot={game} />;
}
