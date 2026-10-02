import type { CSSProperties } from 'react';
import { cn } from '@/utils/cn';

const PIPS: Record<number, readonly number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

/** Cube rotation [x, y] that brings each face to the front. */
const FACE_ROTATION: Record<number, readonly [number, number]> = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
};

/** Which side of the cube carries which number (front = 1, back = 6, …). */
const FACES: ReadonlyArray<{ value: number; transform: string }> = [
  { value: 1, transform: 'translateZ(var(--half))' },
  { value: 6, transform: 'rotateY(180deg) translateZ(var(--half))' },
  { value: 3, transform: 'rotateY(90deg) translateZ(var(--half))' },
  { value: 4, transform: 'rotateY(-90deg) translateZ(var(--half))' },
  { value: 2, transform: 'rotateX(90deg) translateZ(var(--half))' },
  { value: 5, transform: 'rotateX(-90deg) translateZ(var(--half))' },
];

interface LudoDiceProps {
  /** The face to settle on. The cube spins towards it as soon as this changes. */
  value: number | null;
  /** Bumped on every roll so the cube always spins forward, even for a repeated number. */
  rollCount: number;
  rolling: boolean;
  color: string;
  canRoll: boolean;
  onRoll: () => void;
  /** Disabled for a bot's turn: nothing for the viewer to click. */
  caption: string;
}

/** A real 3D cube. It tumbles with a CSS transition to the rolled face; no per-frame React work. */
export function LudoDice({ value, rollCount, rolling, color, canRoll, onRoll, caption }: LudoDiceProps) {
  const [rx, ry] = FACE_ROTATION[value ?? 1]!;
  const spin = rollCount * 720;
  return (
    <button
      type="button"
      onClick={onRoll}
      disabled={!canRoll}
      aria-label={canRoll ? 'Roll Dice' : rolling ? 'Rolling' : `Dice shows ${value ?? 'nothing'}`}
      className={cn(
        'group flex min-h-[44px] flex-col items-center gap-2 rounded-2xl border bg-white/[0.04] px-3 py-3 sm:px-4 transition duration-200 enabled:cursor-pointer enabled:hover:scale-[1.03] enabled:active:scale-95 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        value === 6 && !rolling && 'ludo-six',
      )}
      style={{ borderColor: `${color}88`, boxShadow: canRoll ? `0 0 28px -10px ${color}` : undefined } as CSSProperties}
    >
      <span
        className="relative block"
        style={{ '--size': '56px', '--half': '28px', width: 56, height: 56, perspective: 420 } as CSSProperties}
      >
        <span
          className="ludo-cube absolute inset-0"
          style={{ transform: `rotateX(${rx + spin}deg) rotateY(${ry + spin}deg)` }}
        >
          {FACES.map((face) => (
            <span key={face.value} className="ludo-face" style={{ transform: face.transform }}>
              {Array.from({ length: 9 }, (_, i) => (
                <span
                  key={i}
                  className="h-[72%] w-[72%] rounded-full"
                  style={{
                    background: PIPS[face.value]!.includes(i + 1)
                      ? face.value === 1
                        ? color
                        : '#1d2230'
                      : 'transparent',
                  }}
                />
              ))}
            </span>
          ))}
        </span>
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-soft">{caption}</span>
    </button>
  );
}
