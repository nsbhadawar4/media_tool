import { ContentGate } from '@/components/content/ContentGate';
import { classFromSlug, findLearningGame, gameId, isSubject } from '@/lib/kid-games/catalog';
import { KidGameScreen } from './KidGameScreen';

/**
 * /kid-games/class-3/math/addition-adventure: every one of the 150 games is this one route.
 *
 * A game that can't be played — it, its class, its subject, the class's subject or its course
 * switched off — is refused here, on the server. An unknown address falls through to the player's
 * own "no such game".
 */
export default async function KidGameRoute({ params }: { params: Promise<{ classSlug: string; subject: string; game: string }> }) {
  const { classSlug, subject, game } = await params;
  const level = classFromSlug(classSlug);
  const known = level && isSubject(subject) ? findLearningGame(gameId(level, subject, game)) : undefined;
  return (
    <ContentGate allowed={(catalog) => !known || catalog.isGamePlayable(known.id)} name="This game" back={{ href: '/kid-games', label: 'Back to Kid Games' }}>
      <KidGameScreen classSlug={classSlug} subject={subject} game={game} />
    </ContentGate>
  );
}
