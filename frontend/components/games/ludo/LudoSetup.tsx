import { useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { ALL_COLORS, COLOR_HEX } from './ludoLayout';
import { createGame } from './ludoEngine';
import { LudoBoard } from './LudoBoard';
import type { BotLevel, GameMode, PlayerCount } from './ludoTypes';

const COUNTS: readonly PlayerCount[] = [2, 3, 4];
const LEVELS: readonly { value: BotLevel; label: string; hint: string }[] = [
  { value: 'easy', label: 'Easy', hint: 'Plays any legal move' },
  { value: 'medium', label: 'Medium', hint: 'Captures and advances' },
  { value: 'hard', label: 'Hard', hint: 'Plans ahead, avoids danger' },
];
const PREVIEW = createGame(4);
const NO_HINTS: never[] = [];
const NO_SET: ReadonlySet<string> = new Set();

function Segment<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="w-full">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-subtle">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-12 rounded-xl border px-2 py-2 text-sm font-semibold transition duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              value === o.value
                ? 'border-accent bg-accent/15 text-foreground shadow-[0_0_0_3px_rgba(124,92,255,.18)]'
                : 'border-border bg-white/[0.03] text-muted hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {options.find((o) => o.value === value)?.hint && (
        <p className="mt-1.5 text-xs text-muted">{options.find((o) => o.value === value)!.hint}</p>
      )}
    </div>
  );
}

/** Pre-game screen: a dimmed board preview behind a glass panel with the options. */
export function LudoSetup({
  onStart,
  onBack,
}: {
  onStart: (count: PlayerCount, mode: GameMode, level: BotLevel) => void;
  onBack?: () => void;
}) {
  const [count, setCount] = useState<PlayerCount>(4);
  const [mode, setMode] = useState<GameMode>('local');
  const [level, setLevel] = useState<BotLevel>('medium');

  return (
    <div className="relative flex min-h-[520px] w-full items-center justify-center overflow-hidden rounded-3xl py-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-55 blur-[2px]">
        <div className="w-[min(92%,520px)]">
          <LudoBoard
            state={PREVIEW}
            anim={null}
            active={null}
            validIds={NO_HINTS}
            selectable={false}
            burst={null}
            returning={NO_SET}
            hopKey={0}
            onSelect={() => {}}
            hints={NO_HINTS}
          />
        </div>
      </div>

      <div className="ludo-enter relative mx-auto flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl border border-border-strong bg-background/70 p-6 text-center shadow-pop backdrop-blur-xl">
        <div className="flex gap-1.5" aria-hidden>
          {ALL_COLORS.map((c) => (
            <span key={c} className="h-4 w-4 rounded-full" style={{ background: COLOR_HEX[c], boxShadow: `0 0 10px ${COLOR_HEX[c]}` }} />
          ))}
        </div>
        <div>
          <h2 className="text-3xl font-bold tracking-[0.3em] text-foreground">LUDO</h2>
          <p className="mt-1 text-sm text-muted">Classic Multiplayer Board Game</p>
        </div>

        <Segment label="Players" options={COUNTS.map((n) => ({ value: n, label: String(n) }))} value={count} onChange={setCount} />
        <Segment
          label="Mode"
          options={[
            { value: 'local' as GameMode, label: 'Local Multiplayer', hint: 'Pass the device around' },
            { value: 'bot' as GameMode, label: 'Vs Bot', hint: 'You play Yellow; the bots take the rest' },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === 'bot' && <Segment label="Difficulty" options={LEVELS} value={level} onChange={setLevel} />}

        <Button size="lg" className="min-h-12 w-full tracking-[0.18em]" onClick={() => onStart(count, mode, level)}>
          <Play className="h-4 w-4" />
          START GAME
        </Button>
        {onBack && (
          <button type="button" onClick={onBack} className="min-h-11 text-sm font-medium text-muted transition hover:text-foreground">
            ← Change game type
          </button>
        )}
      </div>
    </div>
  );
}
