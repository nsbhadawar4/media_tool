'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { ChoiceQuestion } from '@/lib/kid-games/types';
import { MAX_TRIES, type EngineProps } from './engineTypes';

export type ChoiceLayout = 'standard' | 'picture' | 'blank';

const KEYS = ['1', '2', '3', '4'];

/**
 * The shared board behind Multiple Choice, Image Choice, Fill in the Blank and the quiz: a
 * question, an optional picture or passage, and up to four big answer buttons. A first miss marks
 * that option (× and amber, never just colour) and lets the child try again; a second miss shows
 * the right answer. Keys 1–4 pick an option.
 */
export function ChoiceBoard({ question, subject, onResult, onRetry, done, layout = 'standard' }: EngineProps<ChoiceQuestion> & { layout?: ChoiceLayout }) {
  const [missed, setMissed] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const lang = subject === 'hindi' ? 'hi' : 'en';

  const choose = (option: string) => {
    if (done || picked || revealed || missed.includes(option)) return;
    if (option === question.answer) {
      setPicked(option);
      onResult(missed.length === 0 ? 1 : 0);
      return;
    }
    const nextMissed = [...missed, option];
    setMissed(nextMissed);
    // Out of tries, or only the answer is left: show it rather than make the child click it.
    if (nextMissed.length >= MAX_TRIES || nextMissed.length >= question.options.length - 1) {
      setRevealed(true);
      onResult(0, question.answer, question.explain);
    } else {
      onRetry();
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest('input, textarea')) return;
      const i = KEYS.indexOf(event.key);
      if (i >= 0 && i < question.options.length) choose(question.options[i]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const longest = Math.max(...question.options.map((o) => o.length));
  const twoColumns = longest <= 14;
  const blank = question.sentence ?? (layout === 'blank' ? question.prompt : null);
  const filled = picked ?? (revealed ? question.answer : null);

  return (
    <div className="flex w-full flex-col gap-5 sm:gap-6">
      {(layout !== 'blank' || question.sentence) && (
        <p className="text-balance text-center text-lg font-semibold text-foreground sm:text-xl" lang={lang}>
          {question.prompt}
        </p>
      )}

      {question.passage && (
        <div className="kg-tint rounded-2xl border border-border p-4 text-left text-base leading-relaxed text-foreground-soft sm:p-5 sm:text-lg" lang={lang}>
          {question.passage}
        </div>
      )}

      {question.visual && (
        <div
          className={cn(
            'kg-visual mx-auto flex max-w-full items-center justify-center wrap-break-word text-center font-bold leading-tight text-foreground',
            layout === 'picture' && 'kg-tint aspect-square w-40 rounded-4xl border border-border text-7xl sm:w-48 sm:text-8xl',
          )}
          role={layout === 'picture' ? 'img' : undefined}
          aria-label={layout === 'picture' ? 'Picture for this question' : undefined}
          lang={lang}
        >
          {question.visual}
        </div>
      )}

      {blank && (
        <p className="text-balance text-center text-xl font-semibold leading-loose text-foreground sm:text-2xl" lang={lang}>
          {blank.split('___').map((part, i, parts) => (
            <span key={i}>
              {part}
              {i < parts.length - 1 && (
                <span
                  className={cn(
                    'mx-1 inline-flex min-w-16 justify-center rounded-xl border-2 border-dashed px-3 align-middle',
                    filled ? 'border-(--kid-correct) text-(--kid-correct)' : 'kg-ring kg-text',
                  )}
                >
                  {filled ?? '?'}
                  {!filled && <span className="sr-only">blank</span>}
                </span>
              )}
            </span>
          ))}
        </p>
      )}

      <div role="group" aria-label="Answers" className={cn('grid gap-3', twoColumns ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2')}>
        {question.options.map((option, i) => {
          const state =
            picked === option ? 'correct' : revealed && option === question.answer ? 'reveal' : missed.includes(option) ? 'missed' : 'idle';
          return (
            <button
              key={option}
              type="button"
              data-state={state}
              disabled={done || state === 'missed'}
              onClick={() => choose(option)}
              aria-label={`${option}${state === 'correct' ? ', correct' : state === 'missed' ? ', not this one' : state === 'reveal' ? ', the right answer' : ''}`}
              className="kg-option relative flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-border bg-surface-elevated px-4 py-3 text-center text-lg font-semibold text-foreground shadow-card hover:border-border-strong disabled:cursor-default"
              lang={lang}
            >
              <span aria-hidden className="absolute left-2.5 top-2 text-[10px] font-semibold text-subtle max-sm:hidden">
                {i + 1}
              </span>
              {state === 'correct' && <Check aria-hidden className="h-5 w-5 shrink-0 text-(--kid-correct)" strokeWidth={3} />}
              {state === 'missed' && <X aria-hidden className="h-5 w-5 shrink-0 text-(--kid-retry)" strokeWidth={3} />}
              <span className="min-w-0 wrap-break-word">{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
