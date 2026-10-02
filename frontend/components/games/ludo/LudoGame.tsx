'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, DoorOpen, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { GameControls } from '../GameControls';
import { GameLayout } from '../GameLayout';
import { findGame } from '../games';
import { SoundToggle, useGameSound } from '../useGameSound';
import { chooseBotMove } from './bot';
import { LudoBoard, type AnimOverride, type BurstFx } from './LudoBoard';
import { LudoDice } from './LudoDice';
import { LudoPlayerPanel } from './LudoPlayerPanel';
import { LudoRules } from './LudoRules';
import { LudoSetup } from './LudoSetup';
import { LudoWinner } from './LudoWinner';
import { COLOR_HEX, COLOR_NAME, PROGRESS_YARD, SEATS, tokenCell } from './ludoLayout';
import { applyMove, applyRoll, createGame, currentPlayer, getValidMoves, rollDie } from './ludoEngine';
import { LUDO_CSS, ROLL_MS, STEP_MS } from './ludoStyles';
import type { BotLevel, Controller, GameMode, GameState, PlayerColor, PlayerCount } from './ludoTypes';

const PASS_MS = 1000;
const EMOJI: Record<PlayerColor, string> = { yellow: '🟡', green: '🟢', red: '🔴', blue: '🔵' };

type Busy = 'idle' | 'rolling' | 'moving' | 'passing';

interface Config {
  count: PlayerCount;
  mode: GameMode;
  level: BotLevel;
}

export default function LudoGame() {
  const game = findGame('ludo')!;
  const router = useRouter();
  const { muted, toggleMute, play } = useGameSound();

  const [config, setConfig] = useState<Config | null>(null);
  const [controllers, setControllers] = useState<Record<PlayerColor, Controller>>({
    yellow: 'human',
    green: 'human',
    red: 'human',
    blue: 'human',
  });
  const [state, setState] = useState<GameState | null>(null);
  const [busy, setBusyState] = useState<Busy>('idle');
  const [shownDie, setShownDie] = useState<number | null>(null);
  const [rollCount, setRollCount] = useState(0);
  const [note, setNote] = useState('');
  const [anim, setAnim] = useState<AnimOverride | null>(null);
  const [hopKey, setHopKey] = useState(0);
  const [burst, setBurst] = useState<BurstFx | null>(null);
  const [returning, setReturning] = useState<ReadonlySet<string>>(() => new Set());
  const [tally, setTally] = useState({ moves: 0, captures: 0 });
  const [seconds, setSeconds] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);

  const busyRef = useRef<Busy>('idle');
  const burstId = useRef(0);
  const startedAt = useRef(0);
  const [timers] = useState(() => new Set<number>());

  const setBusy = useCallback((b: Busy) => {
    busyRef.current = b;
    setBusyState(b);
  }, []);

  const schedule = useCallback(
    (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    },
    [timers],
  );

  const clearTimers = useCallback(() => {
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
  }, [timers]);

  useEffect(() => {
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, [timers]);

  const resetFx = useCallback(() => {
    setBusy('idle');
    setShownDie(null);
    setNote('');
    setAnim(null);
    setBurst(null);
    setReturning(new Set());
    setTally({ moves: 0, captures: 0 });
    setSeconds(0);
  }, [setBusy]);

  const startGame = useCallback(
    (cfg: Config) => {
      clearTimers();
      resetFx();
      const seats = SEATS[cfg.count];
      setControllers({
        yellow: 'human',
        green: 'human',
        red: 'human',
        blue: 'human',
        ...Object.fromEntries(seats.map((c, i) => [c, cfg.mode === 'bot' && i > 0 ? 'bot' : 'human'])),
      } as Record<PlayerColor, Controller>);
      setConfig(cfg);
      setState(createGame(cfg.count));
      startedAt.current = performance.now();
      play('tap');
    },
    [clearTimers, play, resetFx],
  );

  const toSetup = useCallback(() => {
    clearTimers();
    resetFx();
    setState(null);
    setConfig(null);
  }, [clearTimers, resetFx]);

  const roll = useCallback(() => {
    if (!state || state.phase !== 'roll' || busyRef.current !== 'idle') return;
    const die = rollDie(Math.random);
    setBusy('rolling');
    setNote('ROLLING...');
    setShownDie(die);
    setRollCount((n) => n + 1);
    play('dice');
    schedule(() => {
      const res = applyRoll(state, die);
      if (res.kind === 'move') {
        setState(res.state);
        setNote('');
        setBusy('idle');
        return;
      }
      setNote(res.kind === 'forfeit' ? 'Three 6s in a row. Turn lost' : 'No moves possible');
      setBusy('passing');
      schedule(() => {
        setState(res.state);
        setNote('');
        setBusy('idle');
      }, PASS_MS);
    }, ROLL_MS);
  }, [state, play, schedule, setBusy]);

  const moveToken = useCallback(
    (tokenId: number) => {
      if (!state || state.phase !== 'move' || state.die === null || busyRef.current !== 'idle') return;
      if (!getValidMoves(state, state.die).includes(tokenId)) return;
      const { state: next, events } = applyMove(state, tokenId);
      setBusy('moving');
      setNote('');
      events.progressSteps.forEach((progress, i) => {
        schedule(() => {
          setAnim({ color: events.color, tokenId, progress });
          setHopKey((n) => n + 1);
          play('move');
        }, i * STEP_MS);
      });
      schedule(() => {
        setState(next);
        setAnim(null);
        setTally((t) => ({ moves: t.moves + 1, captures: t.captures + events.captures.length }));
        if (events.captures.length > 0) {
          burstId.current += 1;
          setBurst({ id: burstId.current, cell: events.captures[0]!.cell, color: events.color });
          setReturning(new Set(events.captures.map((c) => `${c.color}-${c.tokenId}`)));
          play('capture');
          schedule(() => setBurst(null), 700);
          schedule(() => setReturning(new Set()), 650);
        } else if (events.reachedHome) {
          play('success');
        }
        if (events.won) {
          setSeconds(Math.round((performance.now() - startedAt.current) / 1000));
          play('win');
        } else if (events.extraTurn) {
          setNote('Rolled a 6! Roll again');
        }
        setBusy('idle');
      }, events.progressSteps.length * STEP_MS + 40);
    },
    [state, play, schedule, setBusy],
  );

  const active = state && state.phase !== 'over' ? currentPlayer(state) : null;
  const activeColor = active?.color ?? null;
  const isBotTurn = activeColor !== null && controllers[activeColor] === 'bot';
  const vsBot = config?.mode === 'bot';
  const humanCanAct = state !== null && !isBotTurn && busy === 'idle';
  const canRoll = humanCanAct && state.phase === 'roll';
  const canPick = humanCanAct && state.phase === 'move';

  // Bots take their turns on a short delay so the player can follow what happened.
  useEffect(() => {
    if (!state || !isBotTurn || busy !== 'idle' || state.phase === 'over' || !config) return;
    const id = window.setTimeout(
      () => {
        if (state.phase === 'roll') roll();
        else if (state.die !== null) moveToken(chooseBotMove(state, state.die, config.level));
      },
      state.phase === 'roll' ? 600 + Math.random() * 300 : 500 + Math.random() * 400,
    );
    return () => window.clearTimeout(id);
  }, [state, isBotTurn, busy, config, roll, moveToken]);

  // Space / Enter rolls for the person whose turn it is.
  useEffect(() => {
    if (!canRoll) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const t = e.target;
      if (t instanceof HTMLElement && t.closest('button, a, input, select, textarea, [role="dialog"]')) return;
      e.preventDefault();
      roll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canRoll, roll]);

  const validIds = useMemo(
    () => (state && state.phase === 'move' && state.die !== null ? getValidMoves(state, state.die) : []),
    [state],
  );

  const hints = useMemo(() => {
    if (!state || !active || !canPick || state.die === null) return [];
    return validIds.map((id) => {
      const from = active.tokens[id]!.progress;
      const to = from === PROGRESS_YARD ? 0 : from + state.die!;
      return { color: active.color, cell: tokenCell(active.color, to, id) };
    });
  }, [state, active, canPick, validIds]);

  const winner = state?.winner ?? null;
  const diceColor = activeColor ? COLOR_HEX[activeColor] : '#7c5cff';

  const banner = winner
    ? `${EMOJI[winner]} ${COLOR_NAME[winner]} wins`
    : activeColor
      ? `${EMOJI[activeColor]} ${vsBot && !isBotTurn ? 'Your' : `${COLOR_NAME[activeColor]}'s`} Turn`
      : '';
  const subtitle =
    note ||
    (canRoll
      ? 'Roll the dice to play'
      : canPick
        ? 'Choose a token to move'
        : isBotTurn && busy === 'idle'
          ? `${COLOR_NAME[activeColor!]} Bot is thinking…`
          : '');

  const diceCaption = busy === 'rolling' ? 'Rolling…' : canRoll ? 'Roll Dice' : isBotTurn ? 'Bot' : shownDie ? `Rolled ${shownDie}` : 'Roll Dice';

  const controls = (
    <GameControls>
      <Button variant="secondary" onClick={() => config && startGame(config)} disabled={!state} className="gap-2">
        <RotateCcw className="h-4 w-4" />
        Restart
      </Button>
      <Button variant="secondary" onClick={() => setRulesOpen(true)} className="gap-2">
        <BookOpen className="h-4 w-4" />
        Rules
      </Button>
      <Button variant="ghost" onClick={toSetup} disabled={!state} aria-label="Change players and mode" className="gap-2">
        <SlidersHorizontal className="h-4 w-4" />
        <span className="max-sm:hidden">Setup</span>
      </Button>
      <SoundToggle muted={muted} onToggle={toggleMute} />
      <Button variant="ghost" onClick={() => router.push('/games')} aria-label="Exit to games" className="gap-2 md:ml-auto">
        <DoorOpen className="h-4 w-4" />
        <span className="max-sm:hidden">Exit</span>
      </Button>
    </GameControls>
  );

  return (
    <GameLayout game={game} stats={[]} controls={controls}>
      <style>{LUDO_CSS}</style>

      {!state || !config ? (
        <LudoSetup onStart={(count, mode, level) => startGame({ count, mode, level })} />
      ) : (
        <div className="ludo-enter mx-auto flex w-full max-w-[1000px] flex-col gap-3 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start lg:gap-6">
          <div className="order-1 flex flex-col items-center gap-3 lg:order-2">
            {/* Turn banner */}
            <div
              aria-live="polite"
              className="w-full max-w-[600px] rounded-2xl border bg-white/[0.04] px-4 py-2.5 text-center backdrop-blur-md transition-colors duration-300"
              style={{ borderColor: `${diceColor}77`, boxShadow: `0 0 26px -12px ${diceColor}` }}
            >
              <div className="text-base font-bold tracking-wide text-foreground">{banner}</div>
              <div className="min-h-4 text-xs text-muted">{subtitle}</div>
            </div>

            <div style={{ width: 'max(300px, min(100%, 600px, calc(100dvh - 330px)))' }}>
              <LudoBoard
                state={state}
                anim={anim}
                active={activeColor}
                validIds={validIds}
                selectable={canPick}
                burst={burst}
                returning={returning}
                hopKey={hopKey}
                onSelect={moveToken}
                hints={hints}
              />
            </div>
          </div>

          <div className="order-2 flex flex-row-reverse items-center gap-3 lg:order-1 lg:flex-col lg:items-stretch">
            <LudoPlayerPanel state={state} controllers={controllers} vsBot={vsBot} active={activeColor} />
            <div className="flex shrink-0 justify-center">
              <LudoDice
                value={shownDie}
                rollCount={rollCount}
                rolling={busy === 'rolling'}
                color={diceColor}
                canRoll={canRoll}
                onRoll={roll}
                caption={diceCaption}
              />
            </div>
          </div>
        </div>
      )}

      <LudoRules open={rulesOpen} onClose={() => setRulesOpen(false)} />

      {winner && busy === 'idle' && (
        <LudoWinner
          winner={winner}
          moves={tally.moves}
          captures={tally.captures}
          seconds={seconds}
          onPlayAgain={() => config && startGame(config)}
        />
      )}
    </GameLayout>
  );
}

