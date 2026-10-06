'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';
import { shuffle } from '@/lib/kid-games/session';
import type { MatchQuestion } from '@/lib/kid-games/types';
import type { EngineProps } from './engineTypes';

/**
 * Matching: tap something on the left, then its partner on the right (either side first works).
 * A right pair locks in with a tick; a wrong one wobbles and the child simply tries again. A pair
 * scores if it was found without a slip.
 */
export function MatchingEngine({ question, subject, onResult, onRetry, onStep, done }: EngineProps<MatchQuestion>) {
  const lang = subject === 'hindi' ? 'hi' : 'en';
  const [rightOrder] = useState(() => shuffle(question.pairs.map((_, i) => i)));
  const [left, setLeft] = useState<number | null>(null);
  const [right, setRight] = useState<number | null>(null);
  const [matched, setMatched] = useState<number[]>([]);
  const [slipped, setSlipped] = useState<number[]>([]);
  const [wobble, setWobble] = useState<{ l: number; r: number; n: number } | null>(null);

  const attempt = (l: number, r: number) => {
    setLeft(null);
    setRight(null);
    if (l === r) {
      const next = [...matched, l];
      setMatched(next);
      if (next.length === question.pairs.length) {
        onResult(question.pairs.length - slipped.length);
      } else onStep();
    } else {
      if (!slipped.includes(l)) setSlipped([...slipped, l]);
      setWobble({ l, r, n: (wobble?.n ?? 0) + 1 });
      onRetry();
    }
  };

  const pickLeft = (i: number) => {
    if (done || matched.includes(i)) return;
    if (right !== null) attempt(i, right);
    else setLeft(left === i ? null : i);
  };
  const pickRight = (i: number) => {
    if (done || matched.includes(i)) return;
    if (left !== null) attempt(left, i);
    else setRight(right === i ? null : i);
  };

  const tile = (text: string, i: number, side: 'l' | 'r') => {
    const isMatched = matched.includes(i);
    const isSelected = side === 'l' ? left === i : right === i;
    const isWobbling = wobble && (side === 'l' ? wobble.l === i : wobble.r === i);
    return (
      <button
        key={`${side}${i}${isWobbling ? wobble.n : ''}`}
        type="button"
        onClick={() => (side === 'l' ? pickLeft(i) : pickRight(i))}
        disabled={done || isMatched}
        aria-pressed={isSelected}
        aria-label={`${text}${isMatched ? ', matched' : ''}`}
        data-state={isMatched ? 'correct' : isSelected ? 'selected' : 'idle'}
        className={cn(
          'kg-option flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-border bg-surface-elevated px-3 py-2.5 text-center text-lg font-semibold text-foreground shadow-card hover:border-border-strong disabled:cursor-default sm:text-xl',
          isWobbling && 'kg-shake',
        )}
        lang={lang}
      >
        {isMatched && <Check aria-hidden className="h-5 w-5 shrink-0 text-(--kid-correct)" strokeWidth={3} />}
        <span className="min-w-0 wrap-break-word">{text}</span>
      </button>
    );
  };

  return (
    <div className="flex w-full flex-col gap-5">
      <p className="text-balance text-center text-lg font-semibold text-foreground sm:text-xl" lang={lang}>
        {question.prompt}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:gap-6">
        <div className="flex flex-col gap-3" role="group" aria-label="Left side">
          {question.pairs.map(([text], i) => tile(text, i, 'l'))}
        </div>
        <div className="flex flex-col gap-3" role="group" aria-label="Right side">
          {rightOrder.map((i) => tile(question.pairs[i][1], i, 'r'))}
        </div>
      </div>
    </div>
  );
}
