'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, RotateCcw, Worm } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { GameControls } from '../GameControls';
import { GameLayout } from '../GameLayout';
import { GameResult } from '../GameResult';
import { GameStart } from '../GameStart';
import { findGame } from '../games';
import { SoundToggle, useGameSound } from '../useGameSound';
import { BONUS_TTL, COLS, DIRS, ROWS, createSnake, queueDirection, stepSnake, tickInterval } from './snakeEngine';
import type { Direction, SnakeEvent, SnakeState, SnakeStatus } from './snakeTypes';

/** The one thing this game keeps: the best score, in this browser only. */
const BEST_KEY = 'media_tool_snake_best';

const KEY_DIRS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}
interface Pop {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}
interface Fx {
  particles: Particle[];
  pops: Pop[];
  /** Milliseconds banked towards the next move. */
  acc: number;
}

interface Ui {
  status: SnakeStatus;
  score: number;
  level: number;
  length: number;
  newBest: boolean;
}

const INITIAL_UI: Ui = { status: 'ready', score: 0, level: 1, length: 3, newBest: false };

function readBest(): number {
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}
function writeBest(value: number) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Private mode or blocked storage: the score just is not remembered.
  }
}

export default function SnakeGame() {
  const game = findGame('snake')!;
  const { muted, toggleMute, play } = useGameSound();

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<SnakeState | null>(null);
  const fxRef = useRef<Fx>({ particles: [], pops: [], acc: 0 });
  const bestRef = useRef(0);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [ui, setUi] = useState<Ui>(INITIAL_UI);
  const [best, setBest] = useState(0);
  const [shake, setShake] = useState(false);
  const [levelFlash, setLevelFlash] = useState(0);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const sync = useCallback((newBest = false) => {
    const s = stateRef.current;
    if (!s) return;
    setUi({ status: s.status, score: s.score, level: s.level, length: s.snake.length, newBest });
  }, []);

  const handleEvents = useCallback(
    (events: SnakeEvent[]) => {
      const s = stateRef.current!;
      const fx = fxRef.current;
      let newBest = false;
      for (const event of events) {
        if (event.type === 'eat') {
          const bonus = event.kind === 'bonus';
          const color = bonus ? '#fbbf24' : '#fb7185';
          for (let i = 0; i < (bonus ? 18 : 11); i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * (bonus ? 5 : 3.5);
            fx.particles.push({
              x: event.at.x + 0.5,
              y: event.at.y + 0.5,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 0.5 + Math.random() * 0.3,
              max: 0.8,
              size: 0.1 + Math.random() * 0.12,
              color,
            });
          }
          fx.pops.push({ x: event.at.x + 0.5, y: event.at.y, text: `+${event.points}`, life: 0.9, color });
          play(bonus ? 'bonus' : 'eat');
        } else if (event.type === 'level') {
          setLevelFlash((n) => n + 1);
          later(() => play('level'), 120);
        } else if (event.type === 'bonus-spawn') {
          play('success');
        } else if (event.type === 'dead') {
          play('lose');
          setShake(true);
          later(() => setShake(false), 500);
          if (s.score > bestRef.current) {
            bestRef.current = s.score;
            newBest = true;
            setBest(s.score);
            writeBest(s.score);
          }
        }
      }
      sync(newBest);
    },
    [later, play, sync],
  );

  const start = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.status !== 'ready') return;
    s.status = 'playing';
    fxRef.current.acc = 0;
    play('go');
    sync();
  }, [play, sync]);

  const restart = useCallback(() => {
    const fresh = createSnake();
    fresh.status = 'playing';
    stateRef.current = fresh;
    fxRef.current = { particles: [], pops: [], acc: 0 };
    play('go');
    sync();
  }, [play, sync]);

  const togglePause = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    if (s.status === 'playing') s.status = 'paused';
    else if (s.status === 'paused') {
      s.status = 'playing';
      fxRef.current.acc = 0;
    } else return;
    sync();
  }, [sync]);

  const steer = useCallback(
    (dir: Direction) => {
      const s = stateRef.current;
      if (!s) return;
      if (s.status === 'ready') {
        // Setting off with a turn: sideways is honoured, a reverse is just a start.
        queueDirection(s, dir);
        start();
        return;
      }
      if (s.status === 'playing') queueDirection(s, dir);
    },
    [start],
  );

  // Initial state and the saved best are created after mount so server and client markup agree.
  useEffect(() => {
    stateRef.current = createSnake();
    bestRef.current = readBest();
    setBest(bestRef.current);
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // Keyboard, plus pausing when the tab or window loses focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      const dir = KEY_DIRS[event.key] ?? KEY_DIRS[event.key.toLowerCase()];
      if (dir) {
        event.preventDefault();
        steer(dir);
        return;
      }
      const status = stateRef.current?.status;
      if (event.key === ' ' || event.key.toLowerCase() === 'p') {
        if (status === 'ready') start();
        else if (status === 'over') restart();
        else togglePause();
        event.preventDefault();
      } else if (event.key === 'Enter' && (status === 'over' || status === 'ready')) {
        if (status === 'over') restart();
        else start();
      }
    };
    const autoPause = () => {
      if (stateRef.current?.status === 'playing') togglePause();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', autoPause);
    document.addEventListener('visibilitychange', autoPause);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', autoPause);
      document.removeEventListener('visibilitychange', autoPause);
    };
  }, [restart, start, steer, togglePause]);

  // The game loop. One requestAnimationFrame chain, a fixed-step simulation, and canvas drawing —
  // React is only told when something it shows (score, level, status) changes.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let cell = 16;

    const resize = () => {
      const width = Math.floor(wrap.getBoundingClientRect().width);
      if (width <= 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = width * dpr;
      canvas.height = width * dpr;
      cell = (width * dpr) / COLS;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(64, now - last);
      last = now;
      const s = stateRef.current;
      if (!s) return;
      const fx = fxRef.current;

      if (s.status === 'playing') {
        fx.acc += dt;
        const tick = tickInterval(s.level);
        const events: SnakeEvent[] = [];
        // Bounded so a stalled frame cannot fast-forward the snake through a wall.
        let steps = 0;
        while (fx.acc >= tick && s.status === 'playing' && steps < 3) {
          fx.acc -= tick;
          events.push(...stepSnake(s));
          steps++;
        }
        if (events.length > 0) handleEvents(events);
      }

      const seconds = dt / 1000;
      for (const p of fx.particles) {
        p.life -= seconds;
        p.x += p.vx * seconds;
        p.y += p.vy * seconds;
        p.vx *= 0.94;
        p.vy *= 0.94;
      }
      fx.particles = fx.particles.filter((p) => p.life > 0);
      for (const pop of fx.pops) pop.life -= seconds;
      fx.pops = fx.pops.filter((pop) => pop.life > 0);

      const t = s.status === 'playing' ? Math.min(1, fx.acc / tickInterval(s.level)) : 1;
      draw(ctx, s, fx, cell, now / 1000, t);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [handleEvents]);

  // Swipes on the board steer the snake: every ~24px of travel in one direction is a turn.
  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType === 'mouse') return;
    swipeRef.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    const origin = swipeRef.current;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    swipeRef.current = { x: event.clientX, y: event.clientY };
  };
  const endSwipe = () => {
    swipeRef.current = null;
  };

  const speed = (150 / tickInterval(ui.level)).toFixed(1);

  return (
    <GameLayout
      game={game}
      stats={[
        { label: 'Score', value: ui.score, tone: 'accent' },
        { label: 'Best', value: Math.max(best, ui.score) },
        { label: 'Level', value: ui.level },
        { label: 'Speed', value: `${speed}×` },
      ]}
      controls={
        <GameControls>
          <Button
            variant="secondary"
            onClick={ui.status === 'ready' ? start : togglePause}
            disabled={ui.status === 'over'}
          >
            {ui.status === 'playing' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {ui.status === 'playing' ? 'Pause' : ui.status === 'paused' ? 'Resume' : 'Start'}
          </Button>
          <Button variant="ghost" onClick={restart}>
            <RotateCcw className="h-4 w-4" />
            Restart
          </Button>
          <SoundToggle muted={muted} onToggle={toggleMute} />
          <p className="ml-auto hidden text-xs text-subtle lg:block">Arrows / WASD · Space to pause</p>
          <DPad onSteer={steer} />
        </GameControls>
      }
    >
      <div className={`relative mx-auto aspect-square w-full max-w-[min(560px,calc(100dvh-340px))] min-w-[300px] max-md:max-w-[min(100%,52dvh)] ${shake ? 'anim-shake' : ''}`}>
        <div
          ref={wrapRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endSwipe}
          onPointerCancel={endSwipe}
          onPointerLeave={endSwipe}
          className="absolute inset-0 touch-none overflow-hidden rounded-2xl border border-border-strong bg-[#06100d] shadow-[0_0_48px_-18px_#10b981]"
        >
          <canvas ref={canvasRef} className="block h-full w-full" aria-label="Snake board" />
          {levelFlash > 0 && (
            <div key={levelFlash} aria-hidden className="game-banner pointer-events-none absolute inset-x-0 top-[38%] text-center">
              <span className="rounded-full border border-emerald-300/40 bg-emerald-400/15 px-5 py-2 text-lg font-semibold tracking-[0.2em] text-emerald-200 backdrop-blur-sm">
                LEVEL {ui.level}
              </span>
            </div>
          )}
        </div>
      </div>

      {ui.status === 'ready' && (
        <GameStart
          title="Ready to slither?"
          description="Eat to grow, dodge the walls and your own tail. Swipe, use the D-pad, or press an arrow key to begin."
          buttonLabel="Start game"
          icon={Worm}
          onStart={start}
        />
      )}
      {ui.status === 'paused' && <GameStart title="Paused" buttonLabel="Resume" onStart={togglePause} />}
      {ui.status === 'over' && (
        <GameResult
          title="GAME OVER"
          subtitle={ui.newBest ? 'New best score!' : undefined}
          variant={ui.newBest ? 'win' : 'neutral'}
          stats={[
            { label: 'Score', value: ui.score },
            { label: 'Best', value: Math.max(best, ui.score) },
            { label: 'Length', value: ui.length },
            { label: 'Level', value: ui.level },
          ]}
          onPlayAgain={restart}
          playAgainLabel="Play Again"
        />
      )}
    </GameLayout>
  );
}

/** On-screen arrows for touch screens: hidden where there is a keyboard and mouse. */
function DPad({ onSteer }: { onSteer: (dir: Direction) => void }) {
  const button = (dir: Direction, Icon: typeof ArrowUp, label: string, className = '') => (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        onSteer(dir);
      }}
      className={`flex h-[52px] w-[64px] touch-manipulation items-center justify-center rounded-2xl border border-border-strong bg-surface-elevated text-foreground shadow-card transition duration-100 active:scale-90 active:border-emerald-400/60 active:bg-emerald-500/15 ${className}`}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
  return (
    <div className="hidden w-full justify-center pt-1 max-md:flex pointer-coarse:flex" role="group" aria-label="Direction pad">
      <div className="grid grid-cols-3 gap-2">
        {button('up', ArrowUp, 'Up', 'col-start-2')}
        {button('left', ArrowLeft, 'Left', 'col-start-1 row-start-2')}
        {button('down', ArrowDown, 'Down', 'col-start-2 row-start-2')}
        {button('right', ArrowRight, 'Right', 'col-start-3 row-start-2')}
      </div>
    </div>
  );
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function draw(ctx: CanvasRenderingContext2D, s: SnakeState, fx: Fx, cell: number, time: number, t: number) {
  const size = cell * COLS;
  const dead = s.status === 'over';
  ctx.clearRect(0, 0, size, size);

  // Board: a faint checker so movement reads, with a soft vignette.
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#08150f' : '#0a1a13';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  // Food: a breathing orb with a halo.
  const pulse = 0.5 + 0.5 * Math.sin(time * 6);
  const orb = (x: number, y: number, radius: number, color: string, glow: string) => {
    const cx = (x + 0.5) * cell;
    const cy = (y + 0.5) * cell;
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = cell * (0.7 + pulse * 0.5);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(cx - radius * 0.3, cy - radius * 0.32, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
  };
  orb(s.food.x, s.food.y, cell * (0.3 + pulse * 0.05), '#fb7185', 'rgba(251,113,133,0.9)');
  if (s.bonus) {
    const b = s.bonus;
    const left = Math.max(0, b.ttl) / BONUS_TTL;
    orb(b.x, b.y, cell * (0.36 + pulse * 0.07), '#fbbf24', 'rgba(251,191,36,0.95)');
    ctx.strokeStyle = left < 0.3 && Math.floor(time * 8) % 2 === 0 ? 'rgba(251,191,36,0.25)' : 'rgba(251,191,36,0.8)';
    ctx.lineWidth = Math.max(1.5, cell * 0.08);
    ctx.beginPath();
    ctx.arc((b.x + 0.5) * cell, (b.y + 0.5) * cell, cell * 0.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    ctx.stroke();
  }

  // Snake: one rounded stroke through the (interpolated) segment centres.
  const pts = s.snake.map((p, i) => {
    const from = s.prev[i] ?? p;
    return { x: (lerp(from.x, p.x, t) + 0.5) * cell, y: (lerp(from.y, p.y, t) + 0.5) * cell };
  });
  const path = () => {
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.shadowColor = dead ? 'rgba(248,113,113,0.6)' : 'rgba(52,211,153,0.75)';
  ctx.shadowBlur = cell * 0.9;
  ctx.strokeStyle = dead ? '#b91c1c' : '#059669';
  ctx.lineWidth = cell * 0.78;
  path();
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = dead ? '#ef4444' : '#34d399';
  ctx.lineWidth = cell * 0.56;
  path();
  ctx.stroke();
  ctx.save();
  ctx.strokeStyle = 'rgba(209,250,229,0.35)';
  ctx.lineWidth = cell * 0.16;
  ctx.translate(-cell * 0.08, -cell * 0.1);
  path();
  ctx.stroke();
  ctx.restore();

  // Head and eyes.
  const head = pts[0]!;
  ctx.fillStyle = dead ? '#fca5a5' : '#6ee7b7';
  ctx.beginPath();
  ctx.arc(head.x, head.y, cell * 0.4, 0, Math.PI * 2);
  ctx.fill();
  const v = DIRS[s.dir];
  const px = -v.y;
  const py = v.x;
  for (const side of [-1, 1]) {
    const ex = head.x + v.x * cell * 0.14 + px * side * cell * 0.17;
    const ey = head.y + v.y * cell * 0.14 + py * side * cell * 0.17;
    ctx.fillStyle = '#052e1c';
    ctx.beginPath();
    ctx.arc(ex, ey, cell * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }

  // Effects.
  for (const p of fx.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x * cell, p.y * cell, p.size * cell, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = `700 ${Math.round(cell * 0.8)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (const pop of fx.pops) {
    const age = 1 - pop.life / 0.9;
    ctx.globalAlpha = Math.min(1, pop.life * 3);
    ctx.fillStyle = pop.color;
    ctx.fillText(pop.text, pop.x * cell, (pop.y - age * 1.6) * cell);
  }
  ctx.globalAlpha = 1;
}
