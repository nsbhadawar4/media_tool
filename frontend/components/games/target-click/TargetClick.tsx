'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Crosshair, LayoutGrid, Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { GameControls } from '../GameControls';
import { GameCountdown } from '../GameCountdown';
import { GameLayout } from '../GameLayout';
import { GameResult } from '../GameResult';
import { GameStart } from '../GameStart';
import { ModePicker } from '../ModePicker';
import { findGame, formatClock } from '../games';
import { SoundToggle, useGameSound } from '../useGameSound';
import {
  MIN_HIT_PX,
  MODE_CONFIG,
  PERFECT_RADIUS,
  accuracyOf,
  comboMultiplier,
  nextTargetSpec,
  placeTarget,
  type Target,
  type TargetMode,
} from './targetLogic';

type Phase = 'menu' | 'countdown' | 'running' | 'paused' | 'over';

interface Burst {
  id: number;
  x: number;
  y: number;
  color: string;
  /** Floating text; empty for a plain miss ripple. */
  text: string;
  miss: boolean;
  until: number;
}

interface Engine {
  clock: number;
  targets: Target[];
  bursts: Burst[];
  nextSpawnAt: number;
  nextId: number;
  hits: number;
  misses: number;
  score: number;
  combo: number;
  bestCombo: number;
  lastSecond: number;
}

interface Snapshot {
  targets: Target[];
  bursts: Burst[];
  secondsLeft: number;
  hits: number;
  misses: number;
  score: number;
  combo: number;
  bestCombo: number;
}

const MODES = [
  { value: 'classic', label: 'Classic', description: '30 seconds. Big targets are safe, small ones pay more.' },
  { value: 'attack', label: 'Time Attack', description: 'Every hit makes targets smaller and quicker.' },
  { value: 'precision', label: 'Precision', description: 'Tiny targets. Hit the bullseye to score double.' },
] as const;

const LEAVE_MS = 220;
const BURST_MS = 750;
const PARTICLES = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2 + (i % 2) * 0.3;
  const dist = 34 + (i % 3) * 14;
  return { bx: Math.round(Math.cos(angle) * dist), by: Math.round(Math.sin(angle) * dist) };
});

const emptySnapshot = (seconds: number): Snapshot => ({
  targets: [],
  bursts: [],
  secondsLeft: seconds,
  hits: 0,
  misses: 0,
  score: 0,
  combo: 0,
  bestCombo: 0,
});

export default function TargetClick() {
  const game = findGame('target-click')!;
  const { muted, toggleMute, play } = useGameSound();

  const [phase, setPhase] = useState<Phase>('menu');
  const [mode, setMode] = useState<TargetMode>('classic');
  const [count, setCount] = useState<number | 'GO!'>(3);
  const [snap, setSnap] = useState<Snapshot>(() => emptySnapshot(30));
  const [shake, setShake] = useState(false);

  const arenaRef = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const phaseRef = useRef<Phase>('menu');
  const modeRef = useRef<TargetMode>('classic');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const commit = useCallback(() => {
    const e = engine.current;
    if (!e) return;
    const seconds = MODE_CONFIG[modeRef.current].seconds;
    setSnap({
      targets: [...e.targets],
      bursts: [...e.bursts],
      secondsLeft: Math.max(0, Math.ceil(seconds - e.clock / 1000)),
      hits: e.hits,
      misses: e.misses,
      score: e.score,
      combo: e.combo,
      bestCombo: e.bestCombo,
    });
  }, []);

  const shakeOnce = useCallback(() => {
    setShake(true);
    timers.current.push(setTimeout(() => setShake(false), 460));
  }, []);

  const begin = useCallback(
    (m: TargetMode) => {
      clearTimers();
      modeRef.current = m;
      const seconds = MODE_CONFIG[m].seconds;
      engine.current = {
        clock: 0,
        targets: [],
        bursts: [],
        nextSpawnAt: 350,
        nextId: 1,
        hits: 0,
        misses: 0,
        score: 0,
        combo: 0,
        bestCombo: 0,
        lastSecond: seconds,
      };
      setSnap(emptySnapshot(seconds));
      setShake(false);
      setPhase('countdown');
      setCount(3);
      play('tick');
      for (const [value, at] of [[2, 800], [1, 1600], ['GO!', 2400]] as const) {
        timers.current.push(
          setTimeout(() => {
            setCount(value);
            play(value === 'GO!' ? 'go' : 'tick');
          }, at),
        );
      }
      timers.current.push(setTimeout(() => setPhase('running'), 3000));
    },
    [clearTimers, play],
  );

  const toMenu = useCallback(() => {
    clearTimers();
    setPhase('menu');
  }, [clearTimers]);

  // The round loop: spawn, expire, tidy up effects, and end the round.
  useEffect(() => {
    if (phase !== 'running') return;
    let last = performance.now();
    const id = setInterval(() => {
      const e = engine.current;
      const arena = arenaRef.current;
      if (!e || !arena) return;
      const now = performance.now();
      e.clock += Math.min(100, now - last);
      last = now;
      const m = modeRef.current;
      const config = MODE_CONFIG[m];
      let dirty = false;

      for (const t of e.targets) {
        if (t.leaveAt === null && e.clock >= t.bornAt + t.ttl) {
          t.leaveAt = e.clock + LEAVE_MS;
          e.misses += 1;
          if (e.combo >= 10) shakeOnce();
          e.combo = 0;
          dirty = true;
        }
      }
      const before = e.targets.length;
      e.targets = e.targets.filter((t) => t.leaveAt === null || e.clock < t.leaveAt);
      if (e.targets.length !== before) dirty = true;
      const bursts = e.bursts.length;
      e.bursts = e.bursts.filter((b) => e.clock < b.until);
      if (e.bursts.length !== bursts) dirty = true;

      const live = e.targets.filter((t) => t.leaveAt === null).length;
      if (live < config.maxLive(e.hits) && e.clock >= e.nextSpawnAt) {
        const spec = nextTargetSpec(m, e.hits, e.clock);
        const rect = arena.getBoundingClientRect();
        const spot = placeTarget(rect.width, rect.height, spec.size, e.targets.filter((t) => t.leaveAt === null));
        e.targets.push({ id: e.nextId++, ...spot, ...spec, bornAt: e.clock, leaveAt: null });
        const [lo, hi] = config.gap(e.hits);
        e.nextSpawnAt = e.clock + lo + Math.random() * (hi - lo);
        dirty = true;
      }

      const secondsLeft = Math.max(0, Math.ceil(config.seconds - e.clock / 1000));
      if (e.clock >= config.seconds * 1000) {
        commit();
        setPhase('over');
        play('win');
      } else if (dirty || secondsLeft !== e.lastSecond) {
        if (secondsLeft <= 3 && secondsLeft !== e.lastSecond) play('tick');
        e.lastSecond = secondsLeft;
        commit();
      }
    }, 40);
    return () => clearInterval(id);
  }, [phase, commit, play, shakeOnce]);

  const onHit = (target: Target, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const e = engine.current;
    if (!e || phaseRef.current !== 'running') return;
    if (!e.targets.some((t) => t.id === target.id && t.leaveAt === null)) return;

    let perfect = false;
    if (modeRef.current === 'precision') {
      const rect = event.currentTarget.getBoundingClientRect();
      const dist = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
      perfect = dist <= (target.size / 2) * PERFECT_RADIUS;
    }
    e.combo += 1;
    e.hits += 1;
    e.bestCombo = Math.max(e.bestCombo, e.combo);
    const points = target.points * comboMultiplier(e.combo) * (perfect ? 2 : 1);
    e.score += points;
    e.targets = e.targets.filter((t) => t.id !== target.id);
    e.bursts.push({
      id: e.nextId++,
      x: target.x,
      y: target.y,
      color: perfect ? '#fbbf24' : '#34d399',
      text: perfect ? `PERFECT +${points}` : `+${points}`,
      miss: false,
      until: e.clock + BURST_MS,
    });
    const milestone = e.combo % 10 === 0;
    if (milestone) shakeOnce();
    play(milestone ? 'success' : 'eat');
    commit();
  };

  const onMiss = (event: ReactPointerEvent<HTMLDivElement>) => {
    const e = engine.current;
    const arena = arenaRef.current;
    if (!e || !arena || phaseRef.current !== 'running') return;
    const rect = arena.getBoundingClientRect();
    e.misses += 1;
    if (e.combo >= 10) shakeOnce();
    e.combo = 0;
    e.bursts.push({
      id: e.nextId++,
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
      color: '#fb7185',
      text: '',
      miss: true,
      until: e.clock + 450,
    });
    play('fail');
    commit();
  };

  // P or Escape pauses; leaving the tab pauses too.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'p' && event.key !== 'Escape') return;
      if (phaseRef.current === 'running') setPhase('paused');
      else if (phaseRef.current === 'paused') setPhase('running');
    };
    const onHide = () => {
      if (phaseRef.current === 'running') setPhase('paused');
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  const seconds = MODE_CONFIG[mode].seconds;
  const active = phase === 'running' || phase === 'paused';
  const accuracy = accuracyOf(snap.hits, snap.misses);
  const multiplier = comboMultiplier(snap.combo);
  const timeFrac = Math.min(1, snap.secondsLeft / seconds);

  return (
    <GameLayout
      game={game}
      stats={[
        { label: 'Time', value: formatClock(snap.secondsLeft), tone: snap.secondsLeft <= 5 && active ? 'danger' : 'default' },
        { label: 'Score', value: snap.score, tone: 'accent' },
        { label: 'Combo', value: snap.combo >= 2 ? `×${snap.combo}` : '—' },
        { label: 'Accuracy', value: `${accuracy}%` },
      ]}
      controls={
        <GameControls>
          {active ? (
            <Button variant="secondary" onClick={() => setPhase(phase === 'paused' ? 'running' : 'paused')}>
              {phase === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {phase === 'paused' ? 'Resume' : 'Pause'}
            </Button>
          ) : (
            <Button variant="secondary" onClick={toMenu} disabled={phase === 'menu'}>
              <LayoutGrid className="h-4 w-4" />
              Modes
            </Button>
          )}
          <Button variant="ghost" onClick={() => begin(mode)} disabled={phase === 'menu' || phase === 'countdown'}>
            <RotateCcw className="h-4 w-4" />
            Restart
          </Button>
          <SoundToggle muted={muted} onToggle={toggleMute} />
          <p className="ml-auto hidden text-xs text-subtle lg:block">Click or tap targets · P to pause</p>
        </GameControls>
      }
    >
      <div className={cn('relative', shake && 'anim-shake')}>
        <div
          ref={arenaRef}
          onPointerDown={onMiss}
          className="relative h-[56dvh] min-h-[320px] w-full cursor-crosshair touch-manipulation overflow-hidden rounded-3xl border border-emerald-400/20 bg-[#07110f] md:h-[440px]"
          style={{
            backgroundImage:
              'radial-gradient(60% 50% at 50% 0%, rgba(34,197,94,0.14), transparent 70%), radial-gradient(50% 50% at 100% 100%, rgba(6,182,212,0.12), transparent 70%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: 'auto, auto, 36px 36px, 36px 36px',
          }}
        >
          {/* Time remaining */}
          <div className="absolute inset-x-0 top-0 h-1 bg-white/5" aria-hidden>
            <div
              className={cn('h-full transition-[width] duration-1000 ease-linear', snap.secondsLeft <= 5 ? 'bg-red-400' : 'bg-emerald-400')}
              style={{ width: `${timeFrac * 100}%` }}
            />
          </div>

          {/* Combo badge */}
          {snap.combo >= 2 && (
            <div key={snap.combo} className="anim-pop pointer-events-none absolute left-3 top-4 rounded-full border border-emerald-300/40 bg-emerald-400/10 px-3 py-1 text-xs font-bold tracking-wide text-emerald-200 backdrop-blur-sm">
              COMBO ×{snap.combo}
              {multiplier > 1 && <span className="ml-1.5 text-amber-300">{multiplier}× pts</span>}
            </div>
          )}

          {snap.targets.map((t) => {
            const hit = Math.max(t.size, MIN_HIT_PX);
            const leaving = t.leaveAt !== null;
            return (
              <button
                key={t.id}
                type="button"
                aria-label="Target"
                tabIndex={-1}
                disabled={leaving}
                onPointerDown={(event) => onHit(t, event)}
                className={cn('absolute flex items-center justify-center rounded-full outline-none', leaving ? 'tc-out' : 'anim-target-in')}
                style={{ left: `${t.x}%`, top: `${t.y}%`, width: hit, height: hit }}
              >
                {/* Shrinking ring: how long this target has left. */}
                {!leaving && (
                  <span
                    aria-hidden
                    className="tc-ring pointer-events-none absolute rounded-full border-2 border-emerald-300/50"
                    style={{ width: t.size, height: t.size, animationDuration: `${t.ttl}ms` }}
                  />
                )}
                <span
                  aria-hidden
                  className="pointer-events-none relative block rounded-full shadow-[0_0_22px_-4px_#22c55e]"
                  style={{
                    width: t.size,
                    height: t.size,
                    backgroundImage:
                      'radial-gradient(circle, #ecfdf5 0 11%, #10b981 12% 30%, #052e22 31% 36%, #22d3ee 37% 62%, #064e3b 63% 68%, #34d399 69% 100%)',
                  }}
                />
              </button>
            );
          })}

          {snap.bursts.map((b) =>
            b.miss ? (
              <span
                key={b.id}
                aria-hidden
                className="anim-ripple pointer-events-none absolute h-10 w-10 rounded-full border-2 border-rose-400/70"
                style={{ left: `${b.x}%`, top: `${b.y}%` }}
              />
            ) : (
              <div key={b.id} aria-hidden className="pointer-events-none absolute" style={{ left: `${b.x}%`, top: `${b.y}%` }}>
                {PARTICLES.map((p, i) => (
                  <span
                    key={i}
                    className="tc-spark absolute h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: b.color, '--bx': `${p.bx}px`, '--by': `${p.by}px` } as CSSProperties}
                  />
                ))}
                <span
                  className="tc-pop absolute -translate-x-1/2 whitespace-nowrap text-sm font-bold"
                  style={{ color: b.color }}
                >
                  {b.text}
                </span>
              </div>
            ),
          )}
        </div>
      </div>

      {phase === 'menu' && (
        <GameStart
          title="Target Click"
          description="Hit targets as they appear. Chain hits for a combo multiplier; any miss resets it."
          buttonLabel="Start"
          icon={Crosshair}
          onStart={() => begin(mode)}
        >
          <ModePicker options={MODES} value={mode} onChange={setMode} accent="#22c55e" aria-label="Target mode" />
        </GameStart>
      )}
      {phase === 'countdown' && <GameCountdown value={count} color="#22c55e" />}
      {phase === 'paused' && <GameStart title="Paused" buttonLabel="Resume" onStart={() => setPhase('running')} />}
      {phase === 'over' && (
        <GameResult
          title="Time’s up!"
          subtitle={MODES.find((m) => m.value === mode)!.label}
          variant={snap.hits > 0 ? 'win' : 'neutral'}
          stats={[
            { label: 'Score', value: snap.score },
            { label: 'Accuracy', value: accuracy, suffix: '%' },
            { label: 'Targets Hit', value: snap.hits },
            { label: 'Misses', value: snap.misses },
            { label: 'Best Combo', value: snap.bestCombo, suffix: '×' },
            { label: 'Time', value: formatClock(seconds) },
          ]}
          onPlayAgain={() => begin(mode)}
        />
      )}
    </GameLayout>
  );
}
