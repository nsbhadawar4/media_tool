'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { SortQuestion } from '@/lib/kid-games/types';
import type { EngineProps } from './engineTypes';
import { subjectStyle } from '../theme';

interface Drag {
  index: number;
  startX: number;
  startY: number;
  moved: boolean;
}

/**
 * Drag & Drop: drag each word into its group. Dragging uses pointer events, so it works with a
 * finger, a mouse or a pen; tapping a word and then a group does the same thing, which is also how
 * it works from the keyboard. A word dropped in the wrong group wobbles back to try again; it
 * scores if its first drop was right.
 */
export function DragDropEngine({ question, subject, onResult, onRetry, onStep, done }: EngineProps<SortQuestion>) {
  const lang = subject === 'hindi' ? 'hi' : 'en';
  const [placed, setPlaced] = useState<Record<number, string>>({});
  const [slipped, setSlipped] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [wobble, setWobble] = useState<{ index: number; n: number } | null>(null);
  /** The word being dragged and where the drag started (the floating copy appears there). */
  const [dragging, setDragging] = useState<{ index: number; x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const ghost = useRef<HTMLDivElement>(null);

  const remaining = question.items.map((_, i) => i).filter((i) => placed[i] === undefined);

  const drop = (index: number, bucket: string) => {
    setSelected(null);
    if (done || placed[index] !== undefined) return;
    if (question.items[index].bucket === bucket) {
      const next = { ...placed, [index]: bucket };
      setPlaced(next);
      if (Object.keys(next).length === question.items.length) onResult(question.items.length - slipped.length);
      else onStep();
    } else {
      if (!slipped.includes(index)) setSlipped([...slipped, index]);
      setWobble({ index, n: (wobble?.n ?? 0) + 1 });
      onRetry();
    }
  };

  const bucketAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest('[data-bucket]') as HTMLElement | null)?.dataset.bucket ?? null;

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (done || event.button !== 0) return;
    drag.current = { index, startX: event.clientX, startY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) return;
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 8) return;
    if (!current.moved) {
      current.moved = true;
      setDragging({ index: current.index, x: event.clientX, y: event.clientY });
      setSelected(null);
    }
    if (ghost.current) ghost.current.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -50%) scale(1.06)`;
    const target = bucketAt(event.clientX, event.clientY);
    setOver((prev) => (prev === target ? prev : target));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (current.moved) {
      const target = bucketAt(event.clientX, event.clientY);
      setDragging(null);
      setOver(null);
      if (target) drop(current.index, target);
    } else {
      // A tap: select it, then tap a group.
      setSelected((s) => (s === current.index ? null : current.index));
    }
  };

  // Losing the window mid-drag (an alert, a tab switch) must not leave a word stuck to nothing.
  useEffect(() => {
    if (dragging === null) return;
    const cancel = () => {
      drag.current = null;
      setDragging(null);
      setOver(null);
    };
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, [dragging]);

  return (
    <div className="flex w-full flex-col gap-5">
      <p className="text-balance text-center text-lg font-semibold text-foreground sm:text-xl" lang={lang}>
        {question.prompt}
      </p>
      <p className="-mt-3 text-center text-sm text-muted" lang={lang}>
        {lang === 'hi' ? 'हर शब्द को सही डिब्बे में खींचो, या शब्द छूकर फिर डिब्बा छुओ।' : 'Drag each word into a box, or tap a word and then a box.'}
      </p>

      {/* Words still to sort */}
      <div className="flex min-h-14 flex-wrap justify-center gap-2.5" role="group" aria-label="Words to sort">
        {remaining.length === 0 && <span className="self-center text-sm font-semibold text-(--kid-correct)">{lang === 'hi' ? 'सब सही जगह पर!' : 'All sorted!'}</span>}
        {remaining.map((index) => (
          <button
            key={`${index}-${wobble?.index === index ? wobble.n : 0}`}
            type="button"
            onPointerDown={(e) => onPointerDown(e, index)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              drag.current = null;
              setDragging(null);
              setOver(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelected((s) => (s === index ? null : index));
              }
            }}
            disabled={done}
            aria-pressed={selected === index}
            aria-label={`${question.items[index].text}${selected === index ? ', picked up. Now choose a box.' : ''}`}
            data-state={selected === index ? 'selected' : 'idle'}
            className={cn(
              'kg-option kg-chip min-h-12 cursor-grab rounded-2xl border-2 border-border bg-surface-elevated px-4 text-lg font-bold text-foreground shadow-card hover:border-border-strong active:cursor-grabbing',
              wobble?.index === index && 'kg-shake',
              dragging?.index === index && 'opacity-30',
            )}
            lang={lang}
          >
            {question.items[index].text}
          </button>
        ))}
      </div>

      {/* Groups */}
      <div className={cn('grid gap-3', question.buckets.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2')}>
        {question.buckets.map((bucket) => {
          const inside = question.items.map((item, i) => ({ ...item, i })).filter(({ i }) => placed[i] === bucket);
          return (
            <button
              key={bucket}
              type="button"
              data-bucket={bucket}
              data-over={over === bucket || (selected !== null && !done)}
              onClick={() => selected !== null && drop(selected, bucket)}
              disabled={done}
              aria-label={`${bucket} box, ${inside.length} inside${selected !== null ? '. Put the word here.' : ''}`}
              className="kg-drop flex min-h-36 flex-col items-stretch gap-2 rounded-3xl border-2 border-dashed border-border-strong bg-surface/60 p-3 text-left transition-colors disabled:cursor-default"
            >
              <span className="kg-text pointer-events-none text-center text-base font-bold sm:text-lg" lang={lang}>
                {bucket}
              </span>
              <span className="pointer-events-none flex flex-wrap justify-center gap-1.5">
                {inside.map((item) => (
                  <span
                    key={item.i}
                    className="kg-pop inline-flex items-center gap-1 rounded-xl border border-(--kid-correct) bg-surface-elevated px-2.5 py-1 text-base font-semibold text-foreground"
                    lang={lang}
                  >
                    <Check aria-hidden className="h-3.5 w-3.5 text-(--kid-correct)" strokeWidth={3} />
                    {item.text}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {dragging !== null &&
        createPortal(
          <div
            ref={ghost}
            aria-hidden
            className="kg-drag-ghost rounded-2xl border-2 border-(--kg) bg-surface-elevated px-4 py-2.5 text-lg font-bold text-foreground"
            style={{ ...subjectStyle(subject), transform: `translate(${dragging.x}px, ${dragging.y}px) translate(-50%, -50%) scale(1.06)` }}
            lang={lang}
          >
            {question.items[dragging.index].text}
          </div>,
          document.body,
        )}
    </div>
  );
}
