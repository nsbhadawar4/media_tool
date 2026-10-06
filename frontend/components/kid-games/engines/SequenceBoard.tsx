'use client';

import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { cn } from '@/utils/cn';
import { shuffleAway } from '@/lib/kid-games/session';
import { MAX_TRIES } from './engineTypes';

interface Tile {
  id: number;
  text: string;
}

interface SequenceBoardProps {
  prompt: string;
  visual?: string;
  /** The correct sequence. */
  tiles: string[];
  extra?: string[];
  /** How the built answer reads back: '' for a word, ' ' for a sentence, null for a numbered list. */
  joiner: '' | ' ' | null;
  lang: 'hi' | 'en';
  done: boolean;
  onResult: (points: number, reveal?: string) => void;
  onRetry: () => void;
  onStep: () => void;
}

/**
 * The board behind Ordering and Word Builder: tap tiles in the right order to fill the slots, tap
 * a placed tile to take it back. A full row is checked at once. On a first miss the right start is
 * kept and the rest goes back, so the child fixes only what was wrong; a second miss shows the answer.
 */
export function SequenceBoard({ prompt, visual, tiles, extra = [], joiner, lang, done, onResult, onRetry, onStep }: SequenceBoardProps) {
  // Shuffled once per question (the engine is re-mounted for each one), never on re-render.
  const [pool] = useState<Tile[]>(() => shuffleAway([...tiles, ...extra]).map((text, id) => ({ id, text })));
  const [placed, setPlaced] = useState<number[]>([]);
  const [tries, setTries] = useState(0);
  const [state, setState] = useState<'building' | 'correct' | 'missed' | 'reveal'>('building');
  const [shake, setShake] = useState(0);
  const locked = done || state === 'correct' || state === 'reveal';
  const list = joiner === null;

  const textOf = (id: number) => pool.find((t) => t.id === id)!.text;

  const check = (ids: number[]) => {
    const built = ids.map(textOf);
    if (built.every((text, i) => text === tiles[i])) {
      setState('correct');
      onResult(tries === 0 ? 1 : 0);
      return;
    }
    const nextTries = tries + 1;
    setTries(nextTries);
    setShake((n) => n + 1);
    if (nextTries >= MAX_TRIES) {
      setState('reveal');
      onResult(0, joiner === null ? tiles.join(' → ') : tiles.join(joiner));
      return;
    }
    // Keep the correct beginning; everything after the first slip goes back to the tray.
    let keep = 0;
    while (keep < built.length && built[keep] === tiles[keep]) keep++;
    setState('missed');
    setPlaced(ids.slice(0, keep));
    onRetry();
  };

  const place = (id: number) => {
    if (locked || placed.includes(id)) return;
    if (state === 'missed') setState('building');
    const next = [...placed, id];
    setPlaced(next);
    if (next.length === tiles.length) check(next);
    else onStep();
  };

  const unplace = (id: number) => {
    if (locked) return;
    setPlaced(placed.filter((p) => p !== id));
  };

  const shown = state === 'reveal' ? tiles : placed.map(textOf);

  return (
    <div className="flex w-full flex-col gap-5">
      <p className="text-balance text-center text-lg font-semibold text-foreground sm:text-xl" lang={lang}>
        {prompt}
      </p>
      {visual && <div className="kg-visual mx-auto text-center font-bold leading-tight text-foreground">{visual}</div>}

      {/* The answer being built */}
      <div
        key={shake}
        aria-live="polite"
        aria-label={`Your answer: ${shown.join(joiner ?? ', ') || 'empty'}`}
        className={cn(
          'flex min-h-20 flex-wrap items-center justify-center gap-2 rounded-3xl border-2 border-dashed p-3',
          list && 'flex-col items-stretch',
          state === 'correct' && 'kg-pop border-solid border-(--kid-correct)',
          state === 'reveal' && 'border-(--kid-correct)',
          state === 'missed' && 'kg-shake border-(--kid-retry)',
          state === 'building' && 'kg-ring',
        )}
      >
        {Array.from({ length: tiles.length }, (_, slot) => {
          const id = placed[slot];
          const text = shown[slot];
          return text !== undefined ? (
            <button
              key={`s${slot}`}
              type="button"
              onClick={() => id !== undefined && unplace(id)}
              disabled={locked}
              aria-label={`${text}, position ${slot + 1}. Tap to take back.`}
              className={cn(
                'kg-option flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 bg-surface-elevated px-3.5 text-xl font-bold text-foreground shadow-card disabled:cursor-default',
                list ? 'w-full justify-start text-left text-base sm:text-lg' : 'min-w-12',
                state === 'correct' || state === 'reveal' ? 'border-(--kid-correct)' : 'kg-ring',
              )}
              lang={lang}
            >
              {list && <span className="kg-text w-5 shrink-0 text-sm font-bold tabular-nums">{slot + 1}.</span>}
              {text}
            </button>
          ) : (
            <span
              key={`s${slot}`}
              aria-hidden
              className={cn('flex min-h-12 items-center justify-center rounded-2xl bg-surface-hover/70 text-sm font-semibold text-subtle', list ? 'w-full' : 'min-w-12')}
            >
              {slot + 1}
            </span>
          );
        })}
      </div>

      {state === 'correct' && joiner !== null && (
        <p className="kg-pop text-center text-2xl font-bold text-(--kid-correct)" lang={lang}>
          <Check aria-hidden className="mr-1 inline h-6 w-6" strokeWidth={3} />
          {tiles.join(joiner)}
        </p>
      )}

      {/* The tray */}
      <div className={cn('flex flex-wrap justify-center gap-2.5', list && 'flex-col')} role="group" aria-label="Tiles">
        {pool.map((tile) => {
          const used = placed.includes(tile.id);
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => place(tile.id)}
              disabled={locked || used}
              aria-label={tile.text}
              className={cn(
                'kg-option min-h-12 rounded-2xl border-2 border-border bg-surface-elevated px-4 text-xl font-bold text-foreground shadow-card hover:border-border-strong',
                list ? 'w-full text-left text-base sm:text-lg' : 'min-w-12',
                used && 'invisible',
              )}
              lang={lang}
            >
              {tile.text}
            </button>
          );
        })}
      </div>

      {placed.length > 0 && !locked && (
        <button
          type="button"
          onClick={() => setPlaced([])}
          className="mx-auto inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted transition hover:text-foreground"
        >
          <RotateCcw className="h-4 w-4" />
          {lang === 'hi' ? 'फिर से शुरू करो' : 'Start again'}
        </button>
      )}
    </div>
  );
}
