'use client';

import { useId, useMemo, useState, type CSSProperties } from 'react';
import { Check, Eye, Lightbulb, MessageCircle, PartyPopper, Sparkles, Sprout, Square, Star, ThumbsDown, ThumbsUp, Volume2, type LucideIcon } from 'lucide-react';
import type { CurriculumQuestion } from '@/lib/api/adminClasses';
import { CHEERS, isCorrect, NUDGES, pick, questionLayout, splitBlank, splitStage, splitVisual, starsFor, type StageRow } from '@/lib/learn/lessonFlow';
import { cn } from '@/utils/cn';
import { useSpeech } from './useSpeech';

export interface Settled {
  /** Stars earned: 10 first time, 5 after a retry, 0 when the answer was shown. */
  stars: number;
  firstTry: boolean;
}

/** Reads text aloud (see useSpeech): tap to listen, tap again to stop. Nothing is shown where speech is unsupported. */
export function SpeakButton({ text, label = 'Listen', className }: { text: string; label?: string; className?: string }) {
  const { supported, speaking, toggle } = useSpeech(text);
  if (!supported) return null;
  const title = speaking ? 'Stop' : label;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={title}
      aria-pressed={speaking}
      title={title}
      className={cn(
        'kl-speak relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition duration-200 hover:scale-105 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)',
        speaking ? 'kl-speaking border-(--kg) bg-linear-to-br from-(--kg) to-(--kg-2) text-white shadow-lg' : 'border-border bg-surface text-accent shadow-card hover:border-(--kg)',
        className,
      )}
    >
      {speaking ? <Square aria-hidden className="h-4 w-4 fill-current" /> : <Volume2 aria-hidden className="h-5 w-5" />}
      {speaking && <Volume2 aria-hidden className="kl-wave pointer-events-none absolute -right-1 -top-1 h-4 w-4 rounded-full bg-surface p-0.5 text-(--kg)" />}
    </button>
  );
}

/** Emoji from a prompt, shown big (and counted for screen readers, who get "3 🎈"). */
export function EmojiStage({ items }: { items: string[] }) {
  if (!items.length) return null;
  const same = items.every((e) => e === items[0]);
  return (
    <div role="img" aria-label={same ? `${items.length} ${items[0]}` : items.join(' ')} className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-3xl bg-surface/70 px-4 py-5 text-5xl leading-none sm:text-6xl">
      {items.map((e, i) => (
        <span key={i} aria-hidden className="kl-pop kl-float inline-block" style={{ '--i': i } as CSSProperties}>
          {e}
        </span>
      ))}
    </div>
  );
}

const CLASS_TONE = { '--t1': 'var(--kg)', '--t2': 'var(--kg-2)' } as CSSProperties;
const SIGN_WORD: Record<string, string> = { '+': 'plus', '−': 'minus', '-': 'minus', '×': 'times', '=': 'equals', '?': 'what' };

/** Pictures from a prompt (see splitVisual): each row is groups of emoji joined by signs, drawn large. */
export function PictureRows({ rows }: { rows: StageRow[] }) {
  const alt = rows.map((r) => `${r.label ? `${r.label}: ` : ''}${r.parts.map((p) => ('items' in p ? `${p.items.length} ${p.items.every((e) => e === p.items[0]) ? p.items[0] : p.items.join(' ')}` : SIGN_WORD[p.sign])).join(' ')}`).join('. ');
  const total = Math.max(...rows.map((r) => r.parts.reduce((n, p) => n + ('items' in p ? p.items.length : 1), 0)));
  const size = total > 14 ? 'text-3xl sm:text-4xl' : total > 8 ? 'text-4xl sm:text-5xl' : 'text-5xl sm:text-6xl';
  let i = 0;
  return (
    <div role="img" aria-label={alt} className="flex flex-col gap-2 rounded-3xl bg-surface/70 px-3 py-4 sm:px-5">
      {rows.map((r, ri) => (
        <div key={ri} aria-hidden className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {r.label && <span style={CLASS_TONE} className="kl-badge kl-icon flex h-9 w-9 items-center justify-center rounded-xl text-base font-extrabold text-white">{r.label}</span>}
          {r.parts.map((p, pi) =>
            'items' in p ? (
              <span key={pi} className={cn('flex flex-wrap items-center justify-center gap-x-1.5 leading-none', size)}>
                {p.items.map((e, k) => (
                  <span key={k} className="kl-pop inline-block" style={{ '--i': i++ } as CSSProperties}>
                    {e}
                  </span>
                ))}
              </span>
            ) : (
              <span key={pi} style={p.sign === '?' ? CLASS_TONE : undefined} className={cn('font-extrabold text-(--kg)', p.sign === '?' ? 'kl-badge kl-icon flex h-12 w-12 items-center justify-center rounded-2xl text-2xl text-white' : 'text-4xl')}>
                {p.sign === '-' ? '−' : p.sign}
              </span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

const BURST = [
  ['-90px', '-70px'], ['90px', '-70px'], ['-120px', '0px'], ['120px', '0px'], ['-70px', '70px'], ['70px', '70px'], ['0px', '-95px'], ['0px', '85px'],
] as const;

function Burst() {
  return (
    <div aria-hidden className="kl-burst">
      {BURST.map(([x, y], i) => (
        <span key={i} style={{ '--x': x, '--y': y, '--i': i } as CSSProperties}>
          <Star className="h-6 w-6 fill-amber-400 text-amber-500" />
        </span>
      ))}
    </div>
  );
}

/**
 * One question as a small game: look, answer, get kind feedback. The layout comes from the question's
 * shape (see questionLayout); the content — prompt, options, answer, explanation — is the database's.
 * A wrong answer is a nudge, never a failure; after two tries "Show me" reveals the answer so a child
 * is never stuck. Nothing is saved here: stars are for this sitting, lesson progress is saved by the
 * lesson once it is finished.
 */
export function ActivityCard({ q, seed, label, icon: LabelIcon, onSettled }: { q: CurriculumQuestion; seed: number; label: string; icon?: LucideIcon; onSettled: (r: Settled) => void }) {
  const id = useId();
  const layout = questionLayout(q);
  const visual = useMemo(() => splitVisual(q.prompt), [q.prompt]);
  const { text, stage } = useMemo(() => (visual.rows.length ? { text: visual.text, stage: [] as string[] } : splitStage(q.prompt)), [q.prompt, visual]);
  const blank = useMemo(() => splitBlank(text), [text]);
  const options = useMemo(() => q.options.filter((o) => o.trim()), [q.options]);
  const answer = (q.answer ?? '').trim();

  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [tried, setTried] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [status, setStatus] = useState<'idle' | 'nudge' | 'right' | 'shown'>('idle');
  const [revealed, setRevealed] = useState(false);
  const [shake, setShake] = useState(0);
  const done = status === 'right' || status === 'shown';

  const settle = (kind: 'right' | 'shown', stars: number, firstTry: boolean) => {
    setStatus(kind);
    onSettled({ stars, firstTry });
  };
  const check = () => {
    const given = layout === 'type' ? typed : picked;
    if (!given || !given.trim() || done) return;
    const n = attempts + 1;
    setAttempts(n);
    if (isCorrect(q, given, layout !== 'type')) return settle('right', starsFor(n), n === 1);
    setStatus('nudge');
    setShake((s) => s + 1);
    if (layout !== 'type') setTried((t) => [...t, given]);
    setPicked(null);
  };
  const show = () => settle('shown', 0, false);

  const cheer = pick(CHEERS, seed + attempts);
  const nudge = pick(NUDGES, seed + attempts);
  const canCheck = layout === 'type' ? typed.trim() !== '' : picked !== null;
  const isAnswer = (o: string) => done && isCorrect(q, o, true);

  const optionState = (o: string) =>
    cn(
      'relative flex w-full items-center justify-center border-2 font-bold transition duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)',
      isAnswer(o)
        ? 'border-(--kid-correct) bg-(--kid-correct)/15 text-foreground'
        : picked === o
          ? 'border-(--kg) bg-(--kg)/15 text-foreground shadow-card'
          : tried.includes(o)
            ? 'border-dashed border-border bg-surface/40 text-subtle opacity-60'
            : 'border-border bg-surface text-foreground hover:-translate-y-0.5 hover:border-(--kg) hover:shadow-card',
    );
  const mark = (o: string) => (isAnswer(o) ? <Check aria-label="Right answer" className="absolute right-2 top-2 h-5 w-5 text-(--kid-correct)" strokeWidth={3} /> : null);

  return (
    <section aria-labelledby={`${id}-p`} className="kl-tint relative overflow-hidden rounded-[2rem] border-2 p-5 shadow-card sm:p-8">
      {status === 'right' && <Burst />}
      <p className="kl-text flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em]">
        {LabelIcon && (
          <span aria-hidden className="kl-badge kl-icon flex h-8 w-8 items-center justify-center rounded-xl text-white">
            <LabelIcon className="h-4 w-4" strokeWidth={2.5} />
          </span>
        )}
        {label}
      </p>

      <div className="mt-3 flex items-start gap-3">
        <h2 id={`${id}-p`} className="min-w-0 flex-1 text-balance text-2xl font-bold leading-snug text-foreground [overflow-wrap:anywhere] sm:text-3xl">
          {blank ? (
            <>
              <span className="whitespace-pre-line">{blank[0]}</span>
              <span className={cn('mx-1 inline-flex min-w-[2.2em] items-center justify-center rounded-2xl border-2 border-dashed px-3 align-middle', picked || isAnswer(answer) ? 'border-(--kg) bg-(--kg)/15' : 'border-border bg-surface')}>
                {done ? answer : (picked ?? '?')}
              </span>
              <span className="whitespace-pre-line">{blank[1]}</span>
            </>
          ) : (
            <span className="whitespace-pre-line">{text}</span>
          )}
        </h2>
        <SpeakButton text={blank ? `${blank[0]} ${blank[1]}` : text} label="Listen to the question" />
      </div>

      {visual.rows.length > 0 && (
        <div className="mt-4">
          <PictureRows rows={visual.rows} />
        </div>
      )}
      {stage.length > 0 && (
        <div className="mt-4">
          <EmojiStage items={stage} />
        </div>
      )}

      <div key={shake} className={cn('mt-5', shake > 0 && 'kl-wiggle')}>
        {layout === 'truefalse' && (
          <div role="group" aria-labelledby={`${id}-p`} className="grid grid-cols-2 gap-3">
            {options.map((o, i) => (
              <button key={o} type="button" data-option={o} aria-pressed={picked === o} disabled={done || tried.includes(o)} onClick={() => setPicked(o)} className={cn(optionState(o), 'min-h-20 gap-2 rounded-3xl px-3 text-2xl sm:min-h-24 sm:text-3xl')}>
                {i === 0 ? <ThumbsUp aria-hidden className="h-7 w-7" /> : <ThumbsDown aria-hidden className="h-7 w-7" />}
                {o}
                {mark(o)}
              </button>
            ))}
          </div>
        )}

        {layout === 'tiles' && (
          <div role="group" aria-labelledby={`${id}-p`} className={cn('grid gap-3', options.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : options.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
            {options.map((o) => (
              <button key={o} type="button" data-option={o} aria-pressed={picked === o} disabled={done || tried.includes(o)} onClick={() => setPicked(o)} className={cn(optionState(o), 'min-h-24 rounded-3xl px-2 text-5xl sm:min-h-28')}>
                {o}
                {mark(o)}
              </button>
            ))}
          </div>
        )}

        {layout === 'choices' && (
          <div role="group" aria-labelledby={`${id}-p`} className="grid gap-3">
            {options.map((o, i) => (
              <button key={o} type="button" data-option={o} aria-pressed={picked === o} disabled={done || tried.includes(o)} onClick={() => setPicked(o)} className={cn(optionState(o), 'min-h-16 justify-start gap-4 rounded-2xl px-4 text-left text-xl')}>
                <span aria-hidden className="kl-badge flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-extrabold text-white" style={{ '--t1': 'var(--kg)', '--t2': 'var(--kg-2)' } as CSSProperties}>
                  {i + 1}
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{o}</span>
                {mark(o)}
              </button>
            ))}
          </div>
        )}

        {layout === 'type' && (
          <div>
            <label htmlFor={`${id}-in`} className="sr-only">
              Your answer
            </label>
            <input
              id={`${id}-in`}
              value={done ? answer : typed}
              disabled={done}
              inputMode={/^\d+$/.test(answer) ? 'numeric' : 'text'}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && check()}
              placeholder="Type your answer"
              className="h-16 w-full rounded-3xl border-2 border-border bg-surface px-4 text-center text-3xl font-bold text-foreground outline-none placeholder:text-base placeholder:font-medium placeholder:text-subtle focus:border-(--kg) disabled:border-(--kid-correct)"
            />
          </div>
        )}

        {layout === 'reflect' && !done && (
          <div className="rounded-3xl border-2 border-dashed border-border bg-surface/60 p-4 text-center">
            <p className="inline-flex items-center gap-2 text-lg font-semibold text-foreground">
              <MessageCircle aria-hidden className="h-5 w-5 text-(--kg)" />
              Think about it, or say it out loud!
            </p>
            {answer && !revealed && (
              <button type="button" onClick={() => setRevealed(true)} className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-border bg-surface px-5 text-base font-bold text-foreground transition active:scale-95 hover:border-(--kg)">
                <Eye aria-hidden className="h-5 w-5" />
                Show me
              </button>
            )}
            {answer && revealed && <p className="mt-3 rounded-2xl bg-(--kg)/12 px-4 py-3 text-xl font-bold text-foreground">{answer}</p>}
          </div>
        )}
      </div>

      {/* Feedback: kind, never "wrong". */}
      <div role="status" aria-live="polite" className="mt-4 min-h-0">
        {status === 'right' && (
          <div className="kl-pop flex flex-wrap items-center gap-x-3 gap-y-1 rounded-3xl bg-(--kid-correct)/14 px-4 py-3">
            <span aria-hidden className="kl-badge kl-icon flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ '--t1': 'var(--kid-correct)', '--t2': 'var(--kg-2)' } as CSSProperties}>
              <PartyPopper className="h-6 w-6" />
            </span>
            <span className="text-xl font-extrabold text-foreground">{cheer.text}</span>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-base font-extrabold text-foreground shadow-card">
              +{starsFor(attempts)} <Star aria-hidden className="h-4 w-4 fill-amber-400 text-amber-500" />
              <span className="sr-only">stars</span>
            </span>
            {q.explanation && <span className="basis-full text-base text-foreground-soft">{q.explanation}</span>}
          </div>
        )}
        {status === 'nudge' && (
          <div className="kl-pop flex items-center gap-3 rounded-3xl bg-(--kid-retry)/14 px-4 py-3">
            <span aria-hidden className="kl-badge kl-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white" style={{ '--t1': 'var(--kid-retry)', '--t2': '#f97316' } as CSSProperties}>
              <Lightbulb className="h-6 w-6" />
            </span>
            <span className="text-lg font-bold text-foreground">
              {nudge.text} <span className="font-medium text-foreground-soft">{nudge.hint}</span>
            </span>
          </div>
        )}
        {status === 'shown' && (
          <div className="kl-pop rounded-3xl bg-(--kg)/12 px-4 py-3">
            <p className="text-lg font-bold text-foreground">
              <Sprout aria-hidden className="mr-1.5 inline h-5 w-5 align-text-bottom text-(--kid-correct)" />Here it is{answer ? `: ${answer}` : ''}. Let&apos;s keep going!
            </p>
            {q.explanation && <p className="mt-1 text-base text-foreground-soft">{q.explanation}</p>}
          </div>
        )}
      </div>

      {/* Actions */}
      {!done && layout !== 'reflect' && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={check}
            disabled={!canCheck}
            className="btn-primary inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-8 text-lg font-extrabold text-accent-foreground transition active:scale-95 disabled:opacity-50 sm:min-w-56"
          >
            <Check aria-hidden className="h-5 w-5" strokeWidth={3} />
            Check answer
          </button>
          {attempts >= 2 && answer && (
            <button type="button" onClick={show} className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-border bg-surface px-6 text-base font-bold text-foreground transition active:scale-95 hover:border-(--kg)">
              <Eye aria-hidden className="h-5 w-5" />
              Show me
            </button>
          )}
        </div>
      )}
      {layout === 'reflect' && !done && (!answer || revealed) && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => settle('right', starsFor(1), true)} className="btn-primary inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-8 text-lg font-extrabold text-accent-foreground transition active:scale-95">
            <Sparkles aria-hidden className="h-5 w-5" />
            {answer ? 'I got it!' : 'I did it!'}
          </button>
          {answer && (
            <button type="button" onClick={show} className="inline-flex h-14 items-center justify-center rounded-2xl border-2 border-border bg-surface px-6 text-base font-bold text-foreground transition active:scale-95 hover:border-(--kg)">
              Let me practise
            </button>
          )}
        </div>
      )}
    </section>
  );
}
