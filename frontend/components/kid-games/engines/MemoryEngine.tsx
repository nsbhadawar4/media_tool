'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';
import { shuffle } from '@/lib/kid-games/session';
import type { MatchQuestion } from '@/lib/kid-games/types';
import type { EngineProps } from './engineTypes';

interface MemoryCard {
  id: string;
  pair: number;
  text: string;
}

/** Emoji-only cards get a big glyph; words get type sized to fit the card. */
function faceSize(text: string): string {
  if (/^\p{Extended_Pictographic}/u.test(text) && [...text].length <= 3) return 'text-4xl sm:text-5xl';
  if (text.length <= 4) return 'text-2xl sm:text-3xl';
  if (text.length <= 8) return 'text-lg sm:text-xl';
  return 'text-sm sm:text-base';
}

/**
 * Memory: every pair is split across two face-down cards. Flip two; a pair stays open, anything
 * else turns back over. Some misses are part of the game, so the first few are free; only the
 * ones after that cost points.
 */
export function MemoryEngine({ question, subject, onResult, onStep, done }: EngineProps<MatchQuestion>) {
  const lang = subject === 'hindi' ? 'hi' : 'en';
  const [cards] = useState<MemoryCard[]>(() =>
    shuffle(
      question.pairs.flatMap(([a, b], pair) => [
        { id: `${pair}a`, pair, text: a },
        { id: `${pair}b`, pair, text: b },
      ]),
    ),
  );
  const [open, setOpen] = useState<string[]>([]);
  const [found, setFound] = useState<number[]>([]);
  const [misses, setMisses] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const flip = (card: MemoryCard) => {
    if (done || found.includes(card.pair) || open.includes(card.id) || open.length === 2) return;
    const next = [...open, card.id];
    setOpen(next);
    if (next.length < 2) return;

    const [first, second] = next.map((id) => cards.find((c) => c.id === id)!);
    if (first.pair === second.pair) {
      const nextFound = [...found, first.pair];
      setFound(nextFound);
      setOpen([]);
      if (nextFound.length === question.pairs.length) {
        const free = question.pairs.length;
        onResult(Math.max(0, question.pairs.length - Math.max(0, misses - free)));
      } else onStep();
    } else {
      setMisses((m) => m + 1);
      closeTimer.current = setTimeout(() => setOpen([]), 900);
    }
  };

  const columns = cards.length <= 6 ? 'grid-cols-3' : cards.length <= 8 ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-4';

  return (
    <div className="flex w-full flex-col gap-5">
      <p className="text-balance text-center text-lg font-semibold text-foreground sm:text-xl" lang={lang}>
        {question.prompt}
      </p>
      <p className="-mt-3 text-center text-sm text-muted" lang={lang}>
        {lang === 'hi' ? 'दो पत्ते पलटो और जोड़ी ढूँढो।' : 'Flip two cards to find a pair.'}
      </p>
      <div className={cn('mx-auto grid w-full max-w-lg gap-2.5 sm:gap-3', columns)}>
        {cards.map((card, i) => {
          const isFound = found.includes(card.pair);
          const isOpen = isFound || open.includes(card.id);
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => flip(card)}
              disabled={done || isFound}
              aria-label={isOpen ? `${card.text}${isFound ? ', pair found' : ''}` : `Card ${i + 1}, face down`}
              className="kg-memory-card aspect-[3/4] w-full rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)"
            >
              <span className="kg-memory-inner block" data-open={isOpen}>
                <span aria-hidden className="kg-memory-face kg-gradient text-2xl font-bold text-white/85 shadow-card">
                  ?
                </span>
                <span
                  className={cn(
                    'kg-memory-face kg-memory-front border-2 bg-surface-elevated p-1.5 text-center font-semibold leading-tight text-foreground shadow-card',
                    isFound ? 'border-(--kid-correct)' : 'border-border-strong',
                  )}
                  lang={lang}
                >
                  <span className={cn('wrap-break-word', faceSize(card.text))}>{card.text}</span>
                  {isFound && <Check aria-hidden className="absolute right-1.5 top-1.5 h-4 w-4 text-(--kid-correct)" strokeWidth={3} />}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
