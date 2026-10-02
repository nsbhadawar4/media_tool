'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { LayoutGrid, RotateCcw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { GameControls } from '../GameControls';
import { GameLayout } from '../GameLayout';
import { GameResult } from '../GameResult';
import { GameStart } from '../GameStart';
import { ModePicker } from '../ModePicker';
import { findGame } from '../games';
import { SoundToggle, useGameSound } from '../useGameSound';
import {
  FIVE_ROUNDS,
  LIGHTS_MS,
  holdDelay,
  rate,
  speedPoints,
  speedWindow,
  summarize,
  type ReactionMode,
} from './reactionLogic';

type Phase = 'menu' | 'ready' | 'go' | 'result' | 'early' | 'miss' | 'done';

interface Run {
  mode: ReactionMode;
  phase: Phase;
  round: number;
  /** Reaction times of this run, in ms. */
  times: number[];
  lights: number;
  score: number;
  /** Points from the last round, for the score pop. */
  gain: number;
}

const MODES = [
  { value: 'classic', label: 'Classic', description: 'One reaction at a time. Try to beat your best.' },
  { value: 'five', label: 'Five Round Challenge', description: 'Five reactions, scored on average and consistency.' },
  { value: 'speed', label: 'Speed Mode', description: 'The window keeps shrinking. One slip ends the run.' },
] as const;

const FRESH: Run = { mode: 'classic', phase: 'menu', round: 1, times: [], lights: 0, score: 0, gain: 0 };
/** Results auto-advance in the multi-round modes; a tap skips the wait. */
const AUTO_NEXT_MS = 1400;
/** Ignore taps this soon after a result appears, so a double-tap does not skip it unseen. */
const TAP_GUARD_MS = 320;

export default function ReactionTest() {
  const game = findGame('reaction-test')!;
  const { muted, toggleMute, play } = useGameSound();

  const [run, setRun] = useState<Run>(FRESH);
  const [mode, setMode] = useState<ReactionMode>('classic');
  const [best, setBest] = useState<number | null>(null);

  const runRef = useRef<Run>(FRESH);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const goAt = useRef(0);
  const shownAt = useRef(0);

  const update = useCallback((patch: Partial<Run>) => {
    runRef.current = { ...runRef.current, ...patch };
    setRun(runRef.current);
  }, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const finishSpeed = useCallback(() => {
    clearTimers();
    update({ phase: 'done' });
  }, [clearTimers, update]);

  /** Starts a round: lights count up, hold for a random time, then the screen goes green. */
  const startRound = useCallback(
    (round: number) => {
      clearTimers();
      const { mode: m } = runRef.current;
      update({ phase: 'ready', round, lights: 0, gain: 0 });
      for (let i = 1; i <= 3; i++) {
        later(() => {
          update({ lights: i });
          play('tick');
        }, (LIGHTS_MS / 3) * i - 100);
      }
      later(() => {
        goAt.current = performance.now();
        update({ phase: 'go' });
        play('go');
        if (m === 'speed') {
          later(() => {
            play('fail');
            update({ phase: 'miss' });
            later(finishSpeed, 1100);
          }, speedWindow(round));
        }
      }, LIGHTS_MS + holdDelay(m, round));
    },
    [clearTimers, finishSpeed, later, play, update],
  );

  const begin = useCallback(
    (m: ReactionMode) => {
      clearTimers();
      runRef.current = { ...FRESH, mode: m };
      startRound(1);
    },
    [clearTimers, startRound],
  );

  const toMenu = useCallback(() => {
    clearTimers();
    runRef.current = { ...FRESH };
    setRun(FRESH);
  }, [clearTimers]);

  /** After a result (or false start) is acknowledged: go to the next round, or end the run. */
  const advance = useCallback(() => {
    const r = runRef.current;
    clearTimers();
    if (r.phase === 'early') {
      startRound(r.round);
    } else if (r.mode === 'classic') {
      startRound(1);
    } else if (r.mode === 'five') {
      if (r.round >= FIVE_ROUNDS) {
        update({ phase: 'done' });
        play('win');
      } else startRound(r.round + 1);
    } else startRound(r.round + 1);
  }, [clearTimers, play, startRound, update]);

  /** The one input: a tap, click, Space or Enter anywhere on the pad. */
  const press = useCallback(() => {
    const r = runRef.current;
    if (r.phase === 'ready') {
      // Early. Speed mode ends the run; the others replay the round.
      clearTimers();
      play('fail');
      update({ phase: 'early' });
      shownAt.current = performance.now();
      if (r.mode === 'speed') later(finishSpeed, 1100);
      else if (r.mode === 'five') later(advance, AUTO_NEXT_MS);
    } else if (r.phase === 'go') {
      clearTimers();
      const ms = Math.round(performance.now() - goAt.current);
      const gain = r.mode === 'speed' ? speedPoints(r.round, ms) : 0;
      shownAt.current = performance.now();
      setBest((b) => (b === null || ms < b ? ms : b));
      update({ phase: 'result', times: [...r.times, ms], score: r.score + gain, gain });
      play(rate(ms).label === 'Try Again' ? 'tap' : 'success');
      if (r.mode !== 'classic') later(advance, AUTO_NEXT_MS);
    } else if ((r.phase === 'result' || r.phase === 'early') && performance.now() - shownAt.current > TAP_GUARD_MS) {
      if (r.mode === 'speed' && r.phase === 'early') return;
      advance();
    }
  }, [advance, clearTimers, finishSpeed, later, play, update]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, [role="dialog"]') && target.getAttribute('data-pad') === null) return;
      if (runRef.current.phase === 'menu' || runRef.current.phase === 'done') return;
      event.preventDefault();
      press();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const onPointerDown = (event: ReactPointerEvent) => {
    event.preventDefault();
    press();
  };

  const { phase, times } = run;
  const last = times.length > 0 ? times[times.length - 1]! : null;
  const stats = summarize(times);
  const rating = last !== null ? rate(last) : null;
  const playing = phase !== 'menu' && phase !== 'done';
  const window_ = speedWindow(run.round);

  const headline =
    phase === 'ready'
      ? 'GET READY...'
      : phase === 'go'
        ? 'CLICK NOW!'
        : phase === 'early'
          ? 'TOO SOON!'
          : phase === 'miss'
            ? 'TOO SLOW!'
            : phase === 'result'
              ? `${last} ms`
              : 'Ready?';

  return (
    <GameLayout
      game={game}
      stats={
        run.mode === 'speed' && playing
          ? [
              { label: 'Round', value: run.round },
              { label: 'Window', value: `${window_}ms`, tone: 'accent' },
              { label: 'Score', value: run.score },
              { label: 'Best', value: best === null ? '—' : `${best}ms` },
            ]
          : [
              { label: 'Round', value: run.mode === 'five' && playing ? `${Math.min(run.round, FIVE_ROUNDS)} / ${FIVE_ROUNDS}` : run.mode === 'classic' ? times.length + (phase === 'result' ? 0 : 1) : '—' },
              { label: 'Last', value: last === null ? '—' : `${last}ms` },
              { label: 'Average', value: stats ? `${stats.average}ms` : '—' },
              { label: 'Best', value: best === null ? '—' : `${best}ms`, tone: 'accent' },
            ]
      }
      controls={
        <GameControls>
          <Button variant="secondary" onClick={toMenu} disabled={phase === 'menu'}>
            <LayoutGrid className="h-4 w-4" />
            Modes
          </Button>
          <Button variant="ghost" onClick={() => begin(run.mode)} disabled={phase === 'menu'}>
            <RotateCcw className="h-4 w-4" />
            Restart
          </Button>
          <SoundToggle muted={muted} onToggle={toggleMute} />
          <p className="ml-auto hidden text-xs text-subtle lg:block">Click, tap, or press Space</p>
        </GameControls>
      }
    >
      <button
        type="button"
        data-pad
        onPointerDown={onPointerDown}
        aria-label={headline}
        className={cn(
          'reaction-pad relative flex min-h-[52dvh] w-full touch-manipulation flex-col items-center justify-center overflow-hidden rounded-3xl border px-4 text-center md:min-h-[420px]',
          phase === 'go'
            ? 'border-emerald-300/70 bg-emerald-500 text-white'
            : phase === 'early' || phase === 'miss'
              ? 'anim-shake border-amber-400/60 bg-[#2a1707] text-amber-100'
              : phase === 'result'
                ? 'border-orange-400/40 bg-[#1a0f0a] text-foreground'
                : 'border-red-400/30 bg-[#170a0c] text-foreground',
        )}
        style={
          phase === 'ready' || phase === 'menu'
            ? { backgroundImage: 'radial-gradient(60% 55% at 50% 40%, rgba(239,68,68,0.16), transparent 70%)' }
            : phase === 'result'
              ? { backgroundImage: 'radial-gradient(60% 55% at 50% 40%, rgba(245,158,11,0.18), transparent 70%)' }
              : undefined
        }
      >
        {/* Click flash: a ring that expands from the centre the moment green appears. */}
        {phase === 'go' && <span key={run.round} aria-hidden className="rx-flash absolute left-1/2 top-1/2 h-40 w-40 rounded-full border-4 border-white/70" />}
        {phase === 'ready' && <span aria-hidden className="rx-pulse absolute left-1/2 top-[38%] h-56 w-56 rounded-full border border-red-400/30" />}

        {/* Round pips */}
        {playing && run.mode === 'five' && (
          <div className="absolute inset-x-0 top-4 flex justify-center gap-2" aria-hidden>
            {Array.from({ length: FIVE_ROUNDS }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 w-8 rounded-full transition-colors duration-300',
                  i < times.length ? 'bg-orange-400' : i === run.round - 1 ? 'bg-white/50' : 'bg-white/12',
                )}
              />
            ))}
          </div>
        )}

        {/* The "get ready" lights */}
        <div className="mb-5 flex gap-3" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={cn(
                'h-4 w-4 rounded-full border transition-all duration-200',
                phase === 'go'
                  ? 'scale-110 border-white bg-white shadow-[0_0_18px_#fff]'
                  : phase === 'ready' && run.lights >= n
                    ? 'border-red-300 bg-red-500 shadow-[0_0_16px_#ef4444]'
                    : 'border-white/20 bg-white/5',
              )}
            />
          ))}
        </div>

        <div key={`${phase}-${times.length}-${run.round}`} className="anim-rise-scale">
          <p
            className={cn(
              'font-bold tracking-tight tabular-nums',
              phase === 'result' ? 'text-6xl sm:text-7xl' : 'text-4xl sm:text-5xl',
            )}
          >
            {headline}
          </p>
          {phase === 'result' && rating && (
            <p className="mt-3 flex items-center justify-center gap-3">
              <span
                className="rounded-full border px-3 py-1 text-sm font-semibold"
                style={{ color: rating.color, borderColor: `${rating.color}66`, backgroundColor: `${rating.color}1f` }}
              >
                {rating.label}
              </span>
              {run.mode === 'speed' && run.gain > 0 && (
                <span className="anim-pop text-sm font-bold text-emerald-300">+{run.gain}</span>
              )}
            </p>
          )}
          <p className="mt-3 text-sm text-white/55">
            {phase === 'ready'
              ? 'Wait for green. Do not click yet.'
              : phase === 'go'
                ? run.mode === 'speed'
                  ? `Tap within ${window_}ms!`
                  : 'Tap!'
                : phase === 'early'
                  ? run.mode === 'speed'
                    ? 'You jumped the gun — run over.'
                    : run.mode === 'five'
                      ? 'Wait for green. Replaying this round…'
                      : 'Wait for green. Tap to retry.'
                  : phase === 'miss'
                    ? 'The window closed — run over.'
                    : phase === 'result'
                      ? run.mode === 'classic'
                        ? 'Tap for another go.'
                        : 'Next round starting…'
                      : ''}
          </p>
        </div>

        {/* Speed mode: the window drains while green is showing. */}
        {playing && run.mode === 'speed' && (
          <div className="absolute inset-x-6 bottom-6 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
            {phase === 'go' && (
              <span key={run.round} className="rx-drain block h-full origin-left rounded-full bg-white" style={{ animationDuration: `${window_}ms` }} />
            )}
          </div>
        )}
        {/* Multi-round: auto-advance countdown */}
        {phase === 'result' && run.mode !== 'classic' && (
          <div className="absolute inset-x-6 bottom-6 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <span key={times.length} className="rx-drain block h-full origin-left rounded-full bg-orange-400" style={{ animationDuration: `${AUTO_NEXT_MS}ms` }} />
          </div>
        )}
      </button>

      {phase === 'menu' && (
        <GameStart
          title="Reaction Test"
          description="Pick a mode. When the lights go out and the screen turns green, tap as fast as you can."
          buttonLabel="Start"
          icon={Zap}
          onStart={() => begin(mode)}
        >
          <ModePicker options={MODES} value={mode} onChange={setMode} accent="#f59e0b" aria-label="Reaction mode" />
        </GameStart>
      )}

      {phase === 'done' && run.mode === 'five' && stats && (
        <GameResult
          title="Challenge complete"
          subtitle={`Average rating: ${rate(stats.average).label}`}
          stats={[
            { label: 'Average', value: stats.average, suffix: ' ms' },
            { label: 'Fastest', value: stats.fastest, suffix: ' ms' },
            { label: 'Slowest', value: stats.slowest, suffix: ' ms' },
            { label: 'Consistency', value: stats.consistency, suffix: '%' },
          ]}
          onPlayAgain={() => begin('five')}
        >
          <RoundBars times={times} />
        </GameResult>
      )}
      {phase === 'done' && run.mode === 'speed' && (
        <GameResult
          title={times.length >= 8 ? 'Lightning reflexes' : 'Run over'}
          subtitle={`${Math.max(0, times.length)} round${times.length === 1 ? '' : 's'} cleared`}
          variant={times.length >= 5 ? 'win' : 'neutral'}
          stats={[
            { label: 'Score', value: run.score },
            { label: 'Rounds', value: times.length },
            { label: 'Fastest', value: stats ? stats.fastest : 0, suffix: ' ms' },
            { label: 'Average', value: stats ? stats.average : 0, suffix: ' ms' },
          ]}
          onPlayAgain={() => begin('speed')}
        />
      )}
    </GameLayout>
  );
}

/** One horizontal bar per round, scaled to the slowest, coloured by rating. */
function RoundBars({ times }: { times: number[] }) {
  const max = Math.max(...times, 1);
  return (
    <ul className="mt-4 space-y-1.5 text-left" aria-label="Round times">
      {times.map((ms, i) => {
        const { color } = rate(ms);
        return (
          <li key={i} className="flex items-center gap-2.5 text-xs text-muted">
            <span className="w-14 shrink-0">Round {i + 1}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max(8, (ms / max) * 100)}%`, backgroundColor: color }}
              />
            </span>
            <span className="w-14 text-right font-medium tabular-nums text-foreground">{ms} ms</span>
          </li>
        );
      })}
    </ul>
  );
}
