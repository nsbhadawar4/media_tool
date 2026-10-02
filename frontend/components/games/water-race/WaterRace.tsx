'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronsLeft, ChevronsRight, Droplets, Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { cn } from '@/utils/cn';
import { GameControls } from '../GameControls';
import { GameCountdown } from '../GameCountdown';
import { GameLayout } from '../GameLayout';
import { GameResult } from '../GameResult';
import { GameStart } from '../GameStart';
import { findGame, formatClock } from '../games';
import { SoundToggle, useGameSound } from '../useGameSound';
import { WaterLane, type LaneStyle } from './WaterLane';
import {
  BOTS,
  CAPACITY,
  GAME_MS,
  accuracy,
  act,
  botMove,
  createTeam,
  go,
  nextBotDelay,
  settle,
  winnerOf,
  type ActionResult,
  type BotLevel,
  type Team,
  type TeamId,
  type WaterMode,
} from './waterRaceLogic';

type Phase = 'setup' | 'countdown' | 'running' | 'paused' | 'over';

const TEAMS: Record<TeamId, LaneStyle> = {
  a: { name: 'Team A', color: '#38bdf8' },
  b: { name: 'Team B', color: '#a78bfa' },
};

const MODES = [
  { value: 'bot', label: 'VS Bot' },
  { value: 'versus', label: '2 Players' },
] as const;
const LEVELS = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
] as const;

interface Engine {
  /** Game clock in ms. Only advances while a round is running, so pausing freezes everything. */
  clock: number;
  a: Team;
  b: Team;
  botAt: number;
  lastSecond: number;
}
interface Snapshot {
  a: Team;
  b: Team;
  secondsLeft: number;
}

const INITIAL: Snapshot = { a: createTeam('a'), b: createTeam('b'), secondsLeft: GAME_MS / 1000 };

export default function WaterRace() {
  const game = findGame('water-race')!;
  const { muted, toggleMute, play } = useGameSound();

  const [phase, setPhase] = useState<Phase>('setup');
  const [mode, setMode] = useState<WaterMode>('bot');
  const [level, setLevel] = useState<BotLevel>('normal');
  const [count, setCount] = useState<number | 'GO!'>(3);
  const [snap, setSnap] = useState<Snapshot>(INITIAL);

  const engine = useRef<Engine | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const phaseRef = useRef<Phase>('setup');
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
    setSnap({ a: { ...e.a }, b: { ...e.b }, secondsLeft: Math.max(0, Math.ceil((GAME_MS - e.clock) / 1000)) });
  }, []);

  const sound = useCallback(
    (result: ActionResult) => {
      if (result.kind === 'scoop') play('collect');
      else if (result.kind === 'pour') play(result.combo >= 2 ? 'success' : 'pour');
      else if (result.kind === 'carry' || result.kind === 'return') play('tap');
    },
    [play],
  );

  /** One button press for a team: the action button (scoop / pour) or the move button. */
  const press = useCallback(
    (id: TeamId, move: 'act' | 'go') => {
      const e = engine.current;
      if (!e || phaseRef.current !== 'running') return;
      const team = e[id];
      const result = move === 'act' ? act(team) : go(team, e.clock);
      if (result.kind === 'ignored') return;
      sound(result);
      commit();
    },
    [commit, sound],
  );

  const begin = useCallback(() => {
    clearTimers();
    engine.current = { clock: 0, a: createTeam('a'), b: createTeam('b'), botAt: 900, lastSecond: GAME_MS / 1000 };
    commit();
    setPhase('countdown');
    setCount(3);
    play('tick');
    const steps: Array<[number | 'GO!', number]> = [
      [2, 850],
      [1, 1700],
      ['GO!', 2550],
    ];
    for (const [value, at] of steps) {
      timers.current.push(
        setTimeout(() => {
          setCount(value);
          play(value === 'GO!' ? 'go' : 'tick');
        }, at),
      );
    }
    timers.current.push(setTimeout(() => setPhase('running'), 3200));
  }, [clearTimers, commit, play]);

  const finish = useCallback(() => {
    commit();
    setPhase('over');
    const e = engine.current!;
    const winner = winnerOf(e.a, e.b);
    play(winner === 'a' || mode === 'versus' ? 'win' : 'lose');
  }, [commit, mode, play]);

  // The round clock: settles arriving buckets, runs the bot, and ends the round.
  useEffect(() => {
    if (phase !== 'running') return;
    let last = performance.now();
    const id = setInterval(() => {
      const e = engine.current;
      if (!e) return;
      const now = performance.now();
      e.clock += Math.min(100, now - last);
      last = now;

      let dirty = false;
      for (const team of [e.a, e.b]) if (settle(team, e.clock)) dirty = true;

      if (mode === 'bot' && e.clock >= e.botAt) {
        const config = BOTS[level];
        const move = botMove(e.b, config);
        e.botAt = e.clock + nextBotDelay(config);
        if (move) {
          const result = move === 'act' ? act(e.b) : go(e.b, e.clock);
          if (result.kind === 'pour') play('pour');
          if (result.kind !== 'ignored') dirty = true;
        }
      }

      const secondsLeft = Math.max(0, Math.ceil((GAME_MS - e.clock) / 1000));
      const done = e.clock >= GAME_MS || e.a.water >= 100 || e.b.water >= 100;
      if (done) {
        finish();
      } else if (dirty || secondsLeft !== e.lastSecond) {
        if (secondsLeft <= 5 && secondsLeft !== e.lastSecond) play('tick');
        e.lastSecond = secondsLeft;
        commit();
      }
    }, 50);
    return () => clearInterval(id);
  }, [phase, mode, level, commit, finish, play]);

  // Keyboard. Player 1: A / D move, W / S act. Player 2: ← / → move, ↑ / ↓ act. Against the bot
  // either set of keys drives Team A.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const p = phaseRef.current;
      if (key === 'p' || key === 'Escape') {
        if (p === 'running') setPhase('paused');
        else if (p === 'paused') setPhase('running');
        return;
      }
      if (p !== 'running') return;
      const e = engine.current;
      if (!e) return;

      let id: TeamId | null = null;
      let move: 'act' | 'go' | null = null;
      let dir: 'tank' | 'well' | null = null;
      if (key === 'd') [id, move, dir] = ['a', 'go', 'tank'];
      else if (key === 'a') [id, move, dir] = ['a', 'go', 'well'];
      else if (key === 'w' || key === 's') [id, move] = ['a', 'act'];
      else if (key === 'ArrowRight') [id, move, dir] = [mode === 'bot' ? 'a' : 'b', 'go', 'tank'];
      else if (key === 'ArrowLeft') [id, move, dir] = [mode === 'bot' ? 'a' : 'b', 'go', 'well'];
      else if (key === 'ArrowUp' || key === 'ArrowDown') [id, move] = [mode === 'bot' ? 'a' : 'b', 'act'];
      if (!id || !move) return;
      event.preventDefault();
      // A direction key only moves the bucket the way it points.
      if (dir === 'tank' && e[id].location !== 'well') return;
      if (dir === 'well' && e[id].location !== 'tank') return;
      press(id, move);
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
  }, [mode, press]);

  const { a, b } = snap;
  const isRunning = phase === 'running';
  const winner = phase === 'over' ? winnerOf(a, b) : null;
  const leader = Math.round(a.water) === Math.round(b.water) ? '—' : a.water > b.water ? 'Team A' : 'Team B';
  const winnerTeam = winner === 'b' ? b : a;

  return (
    <GameLayout
      game={game}
      stats={[
        { label: 'Time', value: formatClock(snap.secondsLeft), tone: snap.secondsLeft <= 10 && phase !== 'setup' ? 'danger' : 'default' },
        { label: 'Team A', value: `${Math.round(a.water)}%`, tone: 'accent' },
        { label: 'Team B', value: `${Math.round(b.water)}%`, tone: 'accent' },
        { label: 'Leading', value: leader },
      ]}
      controls={
        <GameControls>
          <div className="flex w-full items-center gap-2.5">
            {phase === 'running' || phase === 'paused' ? (
              <Button variant="secondary" onClick={() => setPhase(phase === 'paused' ? 'running' : 'paused')}>
                {phase === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {phase === 'paused' ? 'Resume' : 'Pause'}
              </Button>
            ) : (
              <Button onClick={begin} disabled={phase === 'countdown'}>
                <Play className="h-4 w-4" />
                {phase === 'over' ? 'Play again' : 'Start race'}
              </Button>
            )}
            <Button variant="ghost" onClick={begin} disabled={phase === 'setup' || phase === 'countdown'}>
              <RotateCcw className="h-4 w-4" />
              Restart
            </Button>
            <SoundToggle muted={muted} onToggle={toggleMute} />
            <p className="ml-auto hidden text-xs text-subtle lg:block">
              P1: A/D move · W/S act &nbsp;·&nbsp; P2: ←/→ move · ↑/↓ act
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2.5 max-md:pb-1">
            {(['a', 'b'] as const).map((id) => (
              <TeamPad
                key={id}
                team={snap[id]}
                style={TEAMS[id]}
                enabled={isRunning && !(mode === 'bot' && id === 'b')}
                label={mode === 'bot' && id === 'b' ? `Bot · ${level}` : null}
                onPress={(move) => press(id, move)}
              />
            ))}
          </div>
        </GameControls>
      }
    >
      <div className="flex flex-col gap-3 max-md:gap-2.5">
        <WaterLane team={a} style={TEAMS.a} isBot={false} isWinner={winner === 'a'} active={isRunning} />
        <WaterLane team={b} style={TEAMS.b} isBot={mode === 'bot'} isWinner={winner === 'b'} active={isRunning && mode === 'versus'} />
      </div>

      {phase === 'setup' && (
        <GameStart
          title="Ready to race?"
          description="Scoop at the well, carry the bucket to your tank and pour. Full buckets in a row build a combo."
          buttonLabel="Start race"
          icon={Droplets}
          onStart={begin}
        >
          <Tabs tabs={MODES} value={mode} onChange={setMode} aria-label="Game mode" />
          {mode === 'bot' ? (
            <Tabs tabs={LEVELS} value={level} onChange={setLevel} aria-label="Bot difficulty" />
          ) : (
            <p className="text-xs text-muted">Two players, one screen — each team has its own controls.</p>
          )}
        </GameStart>
      )}
      {phase === 'countdown' && <GameCountdown value={count} color="#38bdf8" />}
      {phase === 'paused' && <GameStart title="Paused" buttonLabel="Resume" onStart={() => setPhase('running')} />}
      {phase === 'over' && (
        <GameResult
          title={winner ? `🏆 ${TEAMS[winner].name.toUpperCase()} WINS` : 'IT’S A DRAW'}
          subtitle={`${Math.round(a.water)}%  vs  ${Math.round(b.water)}%${mode === 'bot' && winner === 'b' ? ' — the bot got you this time' : ''}`}
          variant={winner && (mode === 'versus' || winner === 'a') ? 'win' : 'neutral'}
          stats={[
            { label: 'Final Score', value: winnerTeam.score },
            { label: 'Water Collected', value: winnerTeam.delivered, suffix: ' L' },
            { label: 'Accuracy', value: accuracy(winnerTeam), suffix: '%' },
            { label: 'Best Combo', value: winnerTeam.bestCombo, suffix: '×' },
          ]}
          onPlayAgain={begin}
          playAgainLabel="Play Again"
        >
          <p className="mt-3 text-xs text-subtle">
            Figures shown for {winner ? TEAMS[winner].name : 'Team A'}. Other team: {winnerTeam === a ? b.score : a.score} pts ·{' '}
            {winnerTeam === a ? b.delivered : a.delivered} L
          </p>
        </GameResult>
      )}
    </GameLayout>
  );
}

/** One team's touch controls: a move button and an action button, each at least 56px tall. */
function TeamPad({
  team,
  style,
  enabled,
  label,
  onPress,
}: {
  team: Team;
  style: LaneStyle;
  enabled: boolean;
  /** Replaces the buttons with a caption (for the bot's pad). */
  label: string | null;
  onPress: (move: 'act' | 'go') => void;
}) {
  const atWell = team.location === 'well' || team.location === 'to-well';
  const full = team.load >= CAPACITY;
  const press = (move: 'act' | 'go') => ({
    onPointerDown: (event: ReactPointerEvent) => {
      event.preventDefault();
      onPress(move);
    },
    // Keyboard activation only; pointer presses are already handled on pointerdown.
    onClick: (event: ReactMouseEvent) => {
      if (event.detail === 0) onPress(move);
    },
  });

  if (label) {
    return (
      <div
        className="flex h-14 items-center justify-center rounded-2xl border border-dashed border-border-strong text-sm font-medium capitalize text-muted"
        style={{ color: style.color }}
      >
        {label}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={`${style.name} controls`}
      className="grid grid-cols-[0.8fr_1.2fr] gap-2 rounded-2xl border bg-surface/60 p-1.5"
      style={{ borderColor: `${style.color}40` }}
    >
      <button
        type="button"
        disabled={!enabled}
        aria-label={`${style.name}: ${atWell ? 'carry to tank' : 'return to well'}`}
        {...press('go')}
        className="flex h-14 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl border border-border-strong bg-surface-elevated text-[11px] font-medium text-foreground-soft transition duration-100 active:scale-95 disabled:opacity-40"
      >
        {atWell ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
        {atWell ? 'Carry' : 'Return'}
      </button>
      <button
        type="button"
        disabled={!enabled}
        aria-label={`${style.name}: ${team.location === 'tank' || team.location === 'to-tank' ? 'pour' : 'scoop'}`}
        {...press('act')}
        className={cn(
          'flex h-14 touch-manipulation flex-col items-center justify-center rounded-xl text-sm font-bold uppercase tracking-wide text-[#05121c] transition duration-100 active:scale-95 disabled:opacity-40',
          full && atWell && 'animate-pulse',
        )}
        style={{ backgroundColor: style.color, boxShadow: enabled ? `0 6px 20px -8px ${style.color}` : undefined }}
      >
        {team.location === 'tank' || team.location === 'to-tank' ? 'Pour' : 'Scoop'}
        <span className="text-[10px] font-semibold opacity-70">{team.load}/{CAPACITY}</span>
      </button>
    </div>
  );
}
