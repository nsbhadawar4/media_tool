'use client';

import { useEffect, useRef, useState } from 'react';
import { Crosshair, Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useInterval } from '@/hooks/useInterval';
import { cn } from '@/utils/cn';
import { GameControls } from './GameControls';
import { GameLayout } from './GameLayout';
import { GameResult } from './GameResult';
import { GameStart } from './GameStart';
import { findGame } from './games';

type Phase = 'idle' | 'running' | 'paused' | 'over';

const GAME_SECONDS = 30;
/** A target that is not hit moves after this long. */
const TARGET_LIFETIME_MS = 1300;
const POINTS_PER_HIT = 10;

interface Spot {
  x: number;
  y: number;
  /** Changes with every new target, restarting its entrance animation. */
  id: number;
}

/** A position inside the board, kept away from the edges so a target is never clipped. */
function randomSpot(id: number): Spot {
  // 14% margin keeps the largest target (80px) fully inside even a 360px-wide board.
  return { x: 14 + Math.random() * 72, y: 14 + Math.random() * 72, id };
}

export default function TargetClick() {
  const game = findGame('target-click')!;
  const [phase, setPhase] = useState<Phase>('idle');
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [spot, setSpot] = useState<Spot>({ x: 50, y: 50, id: 0 });
  const [ripple, setRipple] = useState<{ x: number; y: number; id: number } | null>(null);
  const idCounter = useRef(1);

  const isFinished = phase === 'running' && timeLeft <= 0;
  const current: Phase = isFinished ? 'over' : phase;
  const isRunning = current === 'running';

  const respawn = () => setSpot(randomSpot(idCounter.current++));

  useInterval(() => setTimeLeft((t) => t - 1), isRunning ? 1000 : null);

  // A target that sits too long hops somewhere else. Re-armed on every new target.
  useEffect(() => {
    if (!isRunning) return;
    const t = setTimeout(() => setSpot(randomSpot(idCounter.current++)), TARGET_LIFETIME_MS);
    return () => clearTimeout(t);
  }, [isRunning, spot.id]);

  const start = () => {
    setHits(0);
    setMisses(0);
    setTimeLeft(GAME_SECONDS);
    setRipple(null);
    respawn();
    setPhase('running');
  };

  const hit = (event: React.PointerEvent) => {
    event.stopPropagation();
    if (!isRunning) return;
    setHits((h) => h + 1);
    setRipple({ x: spot.x, y: spot.y, id: idCounter.current++ });
    respawn();
  };

  const miss = () => {
    if (isRunning) setMisses((m) => m + 1);
  };

  const score = hits * POINTS_PER_HIT;
  const total = hits + misses;
  const accuracy = total === 0 ? 0 : Math.round((hits / total) * 100);
  // The target shrinks as the clock runs down.
  const size = Math.round(46 + (Math.max(timeLeft, 0) / GAME_SECONDS) * 34);

  return (
    <GameLayout
      game={game}
      stats={[
        { label: 'Score', value: score, tone: 'accent' },
        { label: 'Time left', value: `${Math.max(timeLeft, 0)}s`, tone: timeLeft <= 5 && current !== 'idle' ? 'danger' : 'default' },
        { label: 'Targets hit', value: hits },
        { label: 'Accuracy', value: `${accuracy}%` },
      ]}
      controls={
        <GameControls>
          {current === 'idle' || current === 'over' ? (
            <Button onClick={start}>
              <Play className="h-4 w-4" />
              {current === 'over' ? 'Play again' : 'Start'}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setPhase(current === 'paused' ? 'running' : 'paused')}>
                {current === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {current === 'paused' ? 'Resume' : 'Pause'}
              </Button>
              <Button variant="ghost" onClick={start}>
                <RotateCcw className="h-4 w-4" />
                Restart
              </Button>
            </>
          )}
        </GameControls>
      }
    >
      <div
        onPointerDown={miss}
        className={cn(
          'relative aspect-[4/3] w-full touch-none select-none overflow-hidden rounded-2xl border border-border-strong max-md:aspect-auto max-md:min-h-[52dvh] max-md:flex-1 sm:aspect-video',
          'bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_70%)] bg-background/60',
          isRunning && 'cursor-crosshair',
        )}
      >
        {/* Faint grid so movement across the board is easy to read. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {(isRunning || current === 'paused') && (
          <button
            key={spot.id}
            type="button"
            onPointerDown={hit}
            aria-label="Target"
            className="anim-target-in absolute rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            style={{ left: `${spot.x}%`, top: `${spot.y}%`, width: size, height: size }}
          >
            <span className="absolute inset-0 rounded-full bg-danger" style={{ boxShadow: '0 0 24px rgba(239, 68, 68, 0.5)' }} />
            <span className="absolute inset-[18%] rounded-full bg-white" />
            <span className="absolute inset-[36%] rounded-full bg-danger" />
          </button>
        )}

        {ripple && (
          <span
            key={ripple.id}
            aria-hidden
            className="anim-ripple pointer-events-none absolute h-16 w-16 rounded-full border-2 border-accent-2"
            style={{ left: `${ripple.x}%`, top: `${ripple.y}%` }}
          />
        )}

        {current === 'idle' && (
          <GameStart
            title="Ready?"
            description="Hit every target in 30 seconds. They shrink as time runs down."
            icon={Crosshair}
            onStart={start}
          />
        )}
        {current === 'paused' && <GameStart title="Paused" buttonLabel="Resume" onStart={() => setPhase('running')} />}
        {current === 'over' && (
          <GameResult
            title="Time is up!"
            subtitle={`You hit ${hits} ${hits === 1 ? 'target' : 'targets'}.`}
            stats={[
              { label: 'Score', value: score },
              { label: 'Accuracy', value: `${accuracy}%` },
            ]}
            onPlayAgain={start}
            variant={hits >= 15 ? 'win' : 'neutral'}
          />
        )}
      </div>
    </GameLayout>
  );
}
