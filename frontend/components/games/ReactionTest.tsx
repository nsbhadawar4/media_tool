'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { GameControls } from './GameControls';
import { GameLayout } from './GameLayout';
import { findGame } from './games';

type Phase = 'idle' | 'waiting' | 'ready' | 'result' | 'early';

const PAD: Record<Phase, { bg: string; title: string; hint: string }> = {
  idle: { bg: 'bg-surface-elevated border-border-strong', title: 'Ready?', hint: 'Press Start, then wait for green.' },
  waiting: { bg: 'bg-danger/15 border-danger/50', title: 'WAIT...', hint: 'Do not click yet.' },
  ready: { bg: 'bg-success/25 border-success/70', title: 'CLICK!', hint: 'Now!' },
  result: { bg: 'bg-accent/15 border-accent/50', title: '', hint: 'Tap to try again.' },
  early: { bg: 'bg-warning/15 border-warning/50', title: 'Too soon!', hint: 'Wait for green. Tap to retry.' },
};

export default function ReactionTest() {
  const game = findGame('reaction-test')!;
  const [phase, setPhase] = useState<Phase>('idle');
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [attempts, setAttempts] = useState<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const begin = () => {
    if (timer.current) clearTimeout(timer.current);
    setPhase('waiting');
    // 1.5 to 4 seconds of suspense.
    timer.current = setTimeout(() => {
      startedAt.current = performance.now();
      setPhase('ready');
    }, 1500 + Math.random() * 2500);
  };

  const press = () => {
    if (phase === 'idle' || phase === 'result' || phase === 'early') {
      begin();
    } else if (phase === 'waiting') {
      if (timer.current) clearTimeout(timer.current);
      setPhase('early');
    } else if (phase === 'ready') {
      const ms = Math.round(performance.now() - startedAt.current);
      setLastMs(ms);
      setAttempts((prev) => [ms, ...prev].slice(0, 8));
      setPhase('result');
    }
  };

  // Space bar plays too.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        press();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const best = attempts.length ? Math.min(...attempts) : null;
  const average = attempts.length ? Math.round(attempts.reduce((a, b) => a + b, 0) / attempts.length) : null;
  const pad = PAD[phase];

  const rating = (ms: number) =>
    ms < 200 ? 'Lightning fast' : ms < 270 ? 'Great reflexes' : ms < 350 ? 'Good' : 'Keep practising';

  return (
    <GameLayout
      game={game}
      stats={[
        { label: 'Last', value: lastMs !== null ? `${lastMs} ms` : '—' },
        { label: 'Best', value: best !== null ? `${best} ms` : '—', tone: 'success' },
        { label: 'Average', value: average !== null ? `${average} ms` : '—' },
        { label: 'Attempts', value: attempts.length },
      ]}
      controls={
        <GameControls>
          <Button onClick={press} disabled={phase === 'waiting' || phase === 'ready'}>
            {phase === 'idle' ? <Play className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
            {phase === 'idle' ? 'Start' : 'Retry'}
          </Button>
          {attempts.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                setAttempts([]);
                setLastMs(null);
                setPhase('idle');
              }}
            >
              Clear scores
            </Button>
          )}
        </GameControls>
      }
    >
      <button
        type="button"
        // pointerdown, not click: a click only fires on release, which would add the length
        // of the press to every measured time.
        onPointerDown={(event) => {
          event.preventDefault();
          press();
        }}
        onKeyDown={(event) => event.key === ' ' && event.preventDefault()}
        className={cn(
          'reaction-pad flex h-72 w-full select-none flex-col items-center justify-center gap-2 rounded-2xl border-2 text-center max-md:h-auto max-md:min-h-[52dvh] max-md:flex-1 sm:h-96',
          pad.bg,
        )}
        aria-live="polite"
      >
        {phase === 'result' && lastMs !== null ? (
          <>
            <span className="text-sm font-medium uppercase tracking-wider text-muted">Reaction time</span>
            <span key={lastMs} className="anim-pop text-6xl font-semibold tabular-nums tracking-tight text-foreground sm:text-7xl">
              {lastMs} <span className="text-3xl text-muted">ms</span>
            </span>
            <span className="text-sm font-medium text-accent-2">{rating(lastMs)}</span>
          </>
        ) : (
          <>
            <Zap className={cn('h-10 w-10', phase === 'ready' ? 'text-success' : 'text-muted')} />
            <span
              className={cn(
                'text-4xl font-semibold tracking-tight sm:text-6xl',
                phase === 'waiting' && 'text-danger',
                phase === 'ready' && 'text-success',
                phase === 'early' && 'text-warning',
              )}
            >
              {pad.title}
            </span>
          </>
        )}
        <span className="text-sm text-muted">{pad.hint}</span>
      </button>

      {attempts.length > 0 && (
        <ol className="mt-4 flex flex-wrap gap-2" aria-label="Previous attempts">
          {attempts.map((ms, i) => (
            <li
              key={`${i}-${ms}`}
              className={cn(
                'rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums',
                ms === best ? 'border-success/40 bg-success/10 text-success' : 'border-border bg-surface-elevated text-muted',
              )}
            >
              {ms} ms
            </li>
          ))}
        </ol>
      )}
    </GameLayout>
  );
}
