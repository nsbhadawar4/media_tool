'use client';

import { Gamepad2, GraduationCap, Star } from 'lucide-react';
import type { AdminContentItem } from '@/lib/api/adminContent';
import { GAMES } from '@/components/games/games';
import { GameCard } from '@/components/games/GameCard';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';

/**
 * How a game's card looks to users, with the title and description as saved — a picture only:
 * nothing in it can be clicked, and opening it changes nothing.
 */
export function GamePreview({ item, classTitle, subjectTitle, onClose }: { item: AdminContentItem | null; classTitle: string; subjectTitle: string; onClose: () => void }) {
  const code = item?.type === 'game' ? GAMES.find((g) => g.slug === item.key) : undefined;
  return (
    <Modal isOpen={item !== null} onClose={onClose} title={`Preview: ${item?.title ?? ''}`}>
      {item && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            {item.isEnabled ? <Badge variant="success">Playable</Badge> : <Badge variant="danger">Disabled — direct links say unavailable</Badge>}
            <Badge variant={item.isVisible ? 'accent' : 'default'}>Dashboard: {item.isVisible ? 'shown' : 'hidden'}</Badge>
            <Badge variant={item.showOnLanding ? 'accent' : 'default'}>Landing: {item.showOnLanding ? 'shown' : 'hidden'}</Badge>
            {item.featured && (
              <Badge variant="warning">
                <Star className="h-3 w-3" aria-hidden /> Featured
              </Badge>
            )}
          </div>
          {/* inert: the card's link and button do nothing in a preview. */}
          <div inert className="mx-auto w-full max-w-xs select-none">
            {code ? (
              <GameCard game={{ ...code, name: item.title, description: item.description || code.description }} />
            ) : (
              <article className="overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="flex aspect-[16/10] items-center justify-center bg-linear-to-br from-amber-400 to-pink-500 text-white">
                  {item.type === 'kid_game' ? <GraduationCap className="h-14 w-14" strokeWidth={1.6} /> : <Gamepad2 className="h-14 w-14" strokeWidth={1.6} />}
                </div>
                <div className="p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    {classTitle} · {subjectTitle}
                    {item.difficulty ? ` · ${item.difficulty}` : ''}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-foreground" lang={item.subject === 'hindi' ? 'hi' : undefined}>
                    {item.title}
                  </h3>
                  {item.description && <p className="mt-1 text-sm text-muted">{item.description}</p>}
                </div>
              </article>
            )}
          </div>
          <p className="text-center text-xs text-subtle">Preview only — nothing here is saved or changed.</p>
        </div>
      )}
    </Modal>
  );
}
