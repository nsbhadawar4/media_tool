'use client';

import { useEffect, useState } from 'react';
import { Droplets, Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { useInterval } from '@/hooks/useInterval';
import { cn } from '@/utils/cn';
import { GameControls } from './GameControls';
import { GameLayout } from './GameLayout';
import { GameResult } from './GameResult';
import { GameStart } from './GameStart';
import { findGame, formatClock } from './games';

type Phase = 'idle' | 'running' | 'paused' | 'over';
type Mode = 'bot' | 'versus';
type TeamId = 'a' | 'b';

interface Team {
  water: number;
  scoops: number;
  lastAction: 'tap' | 'pour' | null;
  /** Bumped on every action so the bucket animation restarts even for repeated taps. */
  actionCount: number;
}

const GAME_SECONDS = 60;
const SCOOPS_PER_BUCKET = 4;
const POUR_PERCENT = 5;
const BOT_TICK_MS = 650;

const EMPTY_TEAM: Team = { water: 0, scoops: 0, lastAction: null, actionCount: 0 };
const TEAMS: Record<TeamId, { name: string; color: string; glow: string }> = {
  a: { name: 'Team A', color: '#38bdf8', glow: 'rgba(56,189,248,0.35)' },
  b: { name: 'Team B', color: '#a78bfa', glow: 'rgba(167,139,250,0.35)' },
};

const MODES = [
  { value: 'bot', label: 'vs Bot' },
  { value: 'versus', label: '2 Players' },
] as const;

/** One step for a team: scoop until the bucket is full, then pour it into the tank. */
function step(team: Team): Team {
  if (team.scoops < SCOOPS_PER_BUCKET) {
    return { ...team, scoops: team.scoops + 1, lastAction: 'tap', actionCount: team.actionCount + 1 };
  }
  return {
    water: Math.min(100, team.water + POUR_PERCENT),
    scoops: 0,
    lastAction: 'pour',
    actionCount: team.actionCount + 1,
  };
}

export default function WaterRace() {
  const game = findGame('water-race')!;
  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<Mode>('bot');
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [teams, setTeams] = useState<Record<TeamId, Team>>({ a: EMPTY_TEAM, b: EMPTY_TEAM });

  // The round ends on the clock or when a tank is full. Derived rather than set from an
  // effect, so every timer below switches off on the same render the round finishes.
  const isFinished = phase === 'running' && (timeLeft <= 0 || teams.a.water >= 100 || teams.b.water >= 100);
  const current: Phase = isFinished ? 'over' : phase;
  const isRunning = current === 'running';

  const act = (id: TeamId) => {
    if (!isRunning) return;
    setTeams((prev) => ({ ...prev, [id]: step(prev[id]) }));
  };

  useInterval(() => setTimeLeft((t) => t - 1), isRunning ? 1000 : null);
  useInterval(
    () => {
      // The bot hesitates now and then, which keeps it beatable.
      if (Math.random() < 0.18) return;
      setTeams((prev) => ({ ...prev, b: step(prev.b) }));
    },
    isRunning && mode === 'bot' ? BOT_TICK_MS : null,
  );

  // Keyboard: A for Team A, L for Team B.
  useEffect(() => {
    if (!isRunning) return;
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'a') act('a');
      if (key === 'l' && mode === 'versus') act('b');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, mode]);

  const start = () => {
    setTeams({ a: EMPTY_TEAM, b: EMPTY_TEAM });
    setTimeLeft(GAME_SECONDS);
    setPhase('running');
  };

  const a = Math.round(teams.a.water);
  const b = Math.round(teams.b.water);
  const winner = a === b ? null : a > b ? 'a' : 'b';

  return (
    <GameLayout
      game={game}
      stats={[
        { label: 'Time', value: formatClock(Math.max(0, timeLeft)), tone: timeLeft <= 10 && current !== 'idle' ? 'danger' : 'default' },
        { label: 'Team A', value: `${a}%`, tone: 'accent' },
        { label: 'Team B', value: `${b}%`, tone: 'accent' },
        { label: 'Leading', value: a === b ? '—' : a > b ? 'Team A' : 'Team B' },
      ]}
      controls={
        <GameControls>
          {current === 'idle' || current === 'over' ? (
            <Button onClick={start}>
              <Play className="h-4 w-4" />
              {current === 'over' ? 'Play again' : 'Start race'}
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
          <Tabs
            tabs={MODES}
            value={mode}
            onChange={(next) => current === 'idle' && setMode(next)}
            aria-label="Game mode"
            className={cn('ml-auto', current !== 'idle' && 'pointer-events-none opacity-50')}
          />
        </GameControls>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-5 max-md:gap-2.5">
        {(['a', 'b'] as const).map((id) => (
          <TeamPanel
            key={id}
            id={id}
            team={teams[id]}
            isBot={mode === 'bot' && id === 'b'}
            canAct={isRunning}
            onAct={() => act(id)}
          />
        ))}
      </div>

      {current === 'idle' && (
        <GameStart
          title="Ready to race?"
          description={`First tank to 100% wins, or the fuller tank when 60 seconds are up. ${
            mode === 'bot' ? 'Team B is the bot.' : 'Keys: A for Team A, L for Team B.'
          }`}
          buttonLabel="Start race"
          icon={Droplets}
          onStart={start}
        />
      )}
      {current === 'paused' && (
        <GameStart title="Paused" buttonLabel="Resume" onStart={() => setPhase('running')} />
      )}
      {current === 'over' && (
        <GameResult
          title={winner ? `${TEAMS[winner].name} Wins!` : 'It is a draw!'}
          subtitle={`${a}% vs ${b}%`}
          stats={[
            { label: 'Team A', value: `${a}%` },
            { label: 'Team B', value: `${b}%` },
          ]}
          onPlayAgain={start}
          variant={winner ? 'win' : 'neutral'}
        />
      )}
    </GameLayout>
  );
}

function TeamPanel({
  id,
  team,
  isBot,
  canAct,
  onAct,
}: {
  id: TeamId;
  team: Team;
  isBot: boolean;
  canAct: boolean;
  onAct: () => void;
}) {
  const { name, color, glow } = TEAMS[id];
  const pct = Math.round(team.water);
  const bucketFull = team.scoops >= SCOOPS_PER_BUCKET;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="truncate text-sm font-semibold text-foreground">
          {name}
          {isBot && <span className="ml-1.5 text-xs font-normal text-subtle">(Bot)</span>}
        </h2>
        <span className="text-sm font-semibold tabular-nums" style={{ color }}>
          {pct}%
        </span>
      </div>

      {/* Progress meter */}
      <div className="h-2 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${name} tank`}>
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>

      {/* Tank */}
      <div
        className="relative h-[27dvh] min-h-32 overflow-hidden rounded-2xl border border-border-strong bg-background/60 sm:h-60"
        style={{ boxShadow: pct > 0 ? `0 0 40px -18px ${glow}` : undefined }}
      >
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-500 ease-out"
          style={{ height: `${pct}%` }}
        >
          {pct > 0 && (
            <>
              <div className="absolute inset-x-0 -top-3 h-4 overflow-hidden" style={{ color }}>
                <svg viewBox="0 0 200 16" preserveAspectRatio="none" className="water-wave-slow absolute left-0 top-0 h-4 w-[200%]" fill="currentColor" aria-hidden>
                  <path d="M0 9 Q25 1 50 9 T100 9 T150 9 T200 9 V16 H0Z" />
                </svg>
                <svg viewBox="0 0 200 16" preserveAspectRatio="none" className="water-wave absolute left-0 top-0 h-4 w-[200%]" fill="currentColor" aria-hidden>
                  <path d="M0 8 Q25 0 50 8 T100 8 T150 8 T200 8 V16 H0Z" />
                </svg>
              </div>
              <div
                className="absolute inset-0"
                style={{ backgroundImage: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 55%, #0b1220))` }}
              />
            </>
          )}
        </div>

        {/* Falling drops while pouring */}
        {team.lastAction === 'pour' && (
          <div key={team.actionCount} aria-hidden className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2">
            {[-14, 0, 14].map((x, i) => (
              <span
                key={x}
                className="anim-drop absolute h-2.5 w-2 rounded-full"
                style={{ left: x, backgroundColor: color, animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
        )}

        {/* Ticks */}
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col justify-between py-3">
          {[75, 50, 25].map((t) => (
            <span key={t} className="flex items-center gap-1 pl-2 text-[10px] text-white/30">
              <span className="h-px w-3 bg-white/25" />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Bucket */}
      <div className="flex items-center justify-center py-1">
        <div
          key={`${team.actionCount}-${team.lastAction}`}
          className={cn(
            'relative h-14 w-[72px] origin-bottom',
            team.lastAction === 'pour' ? 'anim-bucket-pour' : team.lastAction === 'tap' ? 'anim-bucket-tap' : '',
          )}
        >
          <div className="absolute inset-0 overflow-hidden rounded-b-[28px] rounded-t-md border-2 border-border-strong bg-background/50">
            <div
              className="absolute inset-x-0 bottom-0 transition-[height] duration-300 ease-out"
              style={{ height: `${(team.scoops / SCOOPS_PER_BUCKET) * 100}%`, backgroundColor: color }}
            />
          </div>
          <span aria-hidden className="absolute -top-1.5 left-1/2 h-2 w-[78px] -translate-x-1/2 rounded-full border-2 border-border-strong bg-surface-elevated" />
        </div>
      </div>

      <Button
        size="lg"
        className="h-14 w-full px-2 text-sm leading-tight sm:text-base"
        variant={bucketFull ? 'primary' : 'secondary'}
        onClick={onAct}
        disabled={!canAct || isBot}
        aria-label={`${name}: ${bucketFull ? 'pour into tank' : 'collect water'}`}
      >
        {isBot ? 'Bot is playing' : bucketFull ? 'Pour into tank!' : `Collect water (${team.scoops}/${SCOOPS_PER_BUCKET})`}
      </Button>
    </div>
  );
}
