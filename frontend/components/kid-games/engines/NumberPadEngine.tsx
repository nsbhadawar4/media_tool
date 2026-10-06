'use client';

import { useEffect, useState } from 'react';
import { Check, Delete } from 'lucide-react';
import { cn } from '@/utils/cn';
import { sameNumber } from '@/lib/kid-games/session';
import type { NumberQuestion } from '@/lib/kid-games/types';
import { MAX_TRIES, type EngineProps } from './engineTypes';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Number Puzzle: type the answer on a big on-screen keypad (or the keyboard). Decimals and
 * fractions get their own keys only when the answer needs them, so younger children see just digits.
 */
export function NumberPadEngine({ question, onResult, onRetry, done }: EngineProps<NumberQuestion>) {
  const [value, setValue] = useState('');
  const [tries, setTries] = useState(0);
  const [state, setState] = useState<'idle' | 'correct' | 'missed' | 'reveal'>('idle');
  const [shake, setShake] = useState(0);
  const needsDot = question.answer.includes('.');
  const needsSlash = question.answer.includes('/');
  const locked = done || state === 'correct' || state === 'reveal';
  const rupees = question.unit === '₹';

  const press = (key: string) => {
    if (locked) return;
    if (state === 'missed') setState('idle');
    setValue((current) => {
      if (key === 'back') return current.slice(0, -1);
      if (current.length >= 9) return current;
      if ((key === '.' && (current.includes('.') || !needsDot)) || (key === '/' && (current.includes('/') || !needsSlash))) return current;
      return current + key;
    });
  };

  const check = () => {
    if (locked || value === '') return;
    if (sameNumber(value, question.answer)) {
      setState('correct');
      onResult(tries === 0 ? 1 : 0);
      return;
    }
    const nextTries = tries + 1;
    setTries(nextTries);
    setShake((n) => n + 1);
    if (nextTries >= MAX_TRIES) {
      setState('reveal');
      setValue(question.answer);
      onResult(0, rupees ? `₹${question.answer}` : `${question.answer}${question.unit ? ` ${question.unit}` : ''}`, question.explain);
    } else {
      setState('missed');
      setValue('');
      onRetry();
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^[0-9./]$/.test(event.key)) press(event.key);
      else if (event.key === 'Backspace') press('back');
      else if (event.key === 'Enter') check();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const keys = [...DIGITS, needsDot ? '.' : needsSlash ? '/' : '', '0', 'back'];

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <p className="text-balance text-center text-lg font-semibold text-foreground sm:text-xl">{question.prompt}</p>
      {question.visual && (
        <div className="kg-visual max-w-full wrap-break-word text-center font-bold leading-tight text-foreground">{question.visual}</div>
      )}

      <div
        key={shake}
        aria-live="polite"
        className={cn(
          'flex h-16 min-w-40 items-center justify-center gap-2 rounded-2xl border-2 bg-surface-elevated px-5 text-3xl font-bold tabular-nums text-foreground shadow-card',
          state === 'correct' && 'kg-pop border-(--kid-correct)',
          state === 'reveal' && 'border-dashed border-(--kid-correct)',
          state === 'missed' && 'kg-shake border-(--kid-retry)',
          state === 'idle' && 'kg-ring',
        )}
      >
        {state === 'correct' && <Check aria-hidden className="h-6 w-6 text-(--kid-correct)" strokeWidth={3} />}
        {/* Rupees are written before the amount (₹45); every other unit after it (45 cm). */}
        {rupees && <span className="text-2xl font-semibold text-muted">₹</span>}
        <span aria-label={value ? `Your answer: ${value}` : 'Type your answer'}>{value || <span className="text-subtle">?</span>}</span>
        {question.unit && !rupees && <span className="text-lg font-semibold text-muted">{question.unit}</span>}
      </div>

      <div className="grid w-full max-w-xs grid-cols-3 gap-2.5" role="group" aria-label="Number keys">
        {keys.map((key, i) =>
          key === '' ? (
            <span key={`gap-${i}`} />
          ) : (
            <button
              key={key}
              type="button"
              disabled={locked}
              onClick={() => press(key)}
              aria-label={key === 'back' ? 'Delete' : key === '.' ? 'Decimal point' : key === '/' ? 'Fraction bar' : key}
              className="kg-option flex h-14 items-center justify-center rounded-2xl border-2 border-border bg-surface-elevated text-2xl font-bold text-foreground shadow-card hover:border-border-strong disabled:opacity-50"
            >
              {key === 'back' ? <Delete className="h-6 w-6" /> : key}
            </button>
          ),
        )}
      </div>

      <button
        type="button"
        onClick={check}
        disabled={locked || value === ''}
        className="kg-btn inline-flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-2xl text-base font-bold tracking-wider"
      >
        <Check className="h-5 w-5" strokeWidth={3} />
        CHECK
      </button>
    </div>
  );
}
