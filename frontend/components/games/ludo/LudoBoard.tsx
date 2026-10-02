import { memo, type CSSProperties, type ReactElement } from 'react';
import {
  ALL_COLORS,
  COLOR_DARK,
  COLOR_HEX,
  COLOR_LIGHT,
  GRID,
  HOME_COLUMN,
  LOOP,
  PROGRESS_FINISHED,
  START_INDEX,
  STAR_INDICES,
  YARD_ORIGIN,
  tokenCell,
} from './ludoLayout';
import { LudoToken } from './LudoToken';
import type { Cell, GameState, PlayerColor } from './ludoTypes';

export interface AnimOverride {
  color: PlayerColor;
  tokenId: number;
  progress: number;
}
export interface BurstFx {
  id: number;
  cell: Cell;
  color: PlayerColor;
}

interface PlacedToken {
  color: PlayerColor;
  id: number;
  cell: Cell;
  dx: number;
  dy: number;
  scale: number;
}

/** Offsets (in cells) that fan out tokens sharing a square so every one stays visible. */
function stackOffset(index: number, count: number): { dx: number; dy: number; scale: number } {
  if (count <= 1) return { dx: 0, dy: 0, scale: 1 };
  const table: Array<[number, number]> =
    count === 2
      ? [[-0.2, 0], [0.2, 0]]
      : count === 3
        ? [[-0.2, -0.17], [0.2, -0.17], [0, 0.2]]
        : [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]];
  const [dx, dy] = table[index % table.length]!;
  return { dx, dy, scale: 0.72 };
}

/** Every token's display position: committed progress, with the animating token overridden. */
export function placeTokens(state: GameState, anim: AnimOverride | null): PlacedToken[] {
  const flat = state.players.flatMap((p) =>
    p.tokens.map((t) => {
      const progress = anim && anim.color === p.color && anim.tokenId === t.id ? anim.progress : t.progress;
      const cell = tokenCell(p.color, progress, t.id);
      const key = progress < 0 ? `y-${p.color}-${t.id}` : progress >= PROGRESS_FINISHED ? `f-${p.color}` : `${cell[0]},${cell[1]}`;
      return { color: p.color, id: t.id, cell, key };
    }),
  );
  const totals = new Map<string, number>();
  for (const t of flat) totals.set(t.key, (totals.get(t.key) ?? 0) + 1);
  const seen = new Map<string, number>();
  return flat.map((t) => {
    const index = seen.get(t.key) ?? 0;
    seen.set(t.key, index + 1);
    return { color: t.color, id: t.id, cell: t.cell, ...stackOffset(index, totals.get(t.key)!) };
  });
}

function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + Math.cos(a) * rad).toFixed(3)},${(cy + Math.sin(a) * rad).toFixed(3)}`);
  }
  return pts.join(' ');
}

const PINWHEEL: Record<PlayerColor, string> = {
  yellow: '6,6 6,9 7.5,7.5',
  green: '6,6 9,6 7.5,7.5',
  red: '9,6 9,9 7.5,7.5',
  blue: '6,9 9,9 7.5,7.5',
};

const pct = (v: number) => (v / GRID) * 100;
const TOKEN_SIZE = 0.78;

/**
 * The static board art. It depends only on which colours are seated, so it is drawn once and
 * never again when the turn changes or tokens move. Anything that animates lives in separate
 * HTML layers above it; animating inside the SVG is what used to force the whole board to be
 * re-rasterised (and look pixelated) every time the active player changed.
 */
function BoardSvgView({ seated }: { seated: readonly PlayerColor[] }) {
  const cells: ReactElement[] = [];
  LOOP.forEach(([c, r], i) => {
    const startOf = ALL_COLORS.find((col) => START_INDEX[col] === i);
    cells.push(
      <rect
        key={`l${i}`}
        x={c + 0.03}
        y={r + 0.03}
        width={0.94}
        height={0.94}
        rx={0.1}
        fill={startOf ? COLOR_HEX[startOf] : '#ffffff'}
        stroke={startOf ? COLOR_DARK[startOf] : '#c3c9d6'}
        strokeWidth={0.05}
      />,
    );
  });
  return (
    <svg viewBox={`0 0 ${GRID} ${GRID}`} className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        {ALL_COLORS.map((color) => (
          <linearGradient key={color} id={`yard-${color}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={COLOR_LIGHT[color]} stopOpacity={0.35} />
            <stop offset="0.25" stopColor={COLOR_HEX[color]} />
            <stop offset="1" stopColor={COLOR_DARK[color]} />
          </linearGradient>
        ))}
        <linearGradient id="ludo-paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e9ecf3" />
        </linearGradient>
      </defs>
      <rect width={GRID} height={GRID} fill="url(#ludo-paper)" />

      {ALL_COLORS.map((color) => {
        const [ox, oy] = YARD_ORIGIN[color];
        const dim = seated.includes(color) ? 1 : 0.35;
        return (
          <g key={`y${color}`} opacity={dim}>
            <rect x={ox} y={oy} width={6} height={6} fill={`url(#yard-${color})`} />
            <rect x={ox + 0.95} y={oy + 0.95} width={4.1} height={4.1} rx={0.55} fill="#ffffff" stroke={COLOR_DARK[color]} strokeWidth={0.08} />
            {[
              [2, 2],
              [4, 2],
              [2, 4],
              [4, 4],
            ].map(([sx, sy]) => (
              <g key={`${sx}${sy}`}>
                <circle cx={ox + sx!} cy={oy + sy!} r={0.62} fill={COLOR_LIGHT[color]} stroke={COLOR_DARK[color]} strokeWidth={0.07} />
                <circle cx={ox + sx!} cy={oy + sy!} r={0.4} fill={COLOR_HEX[color]} opacity={0.55} />
              </g>
            ))}
          </g>
        );
      })}

      {cells}

      {ALL_COLORS.map((color) =>
        HOME_COLUMN[color].map(([c, r], i) => (
          <rect
            key={`h${color}${i}`}
            x={c + 0.03}
            y={r + 0.03}
            width={0.94}
            height={0.94}
            rx={0.1}
            fill={COLOR_HEX[color]}
            stroke={COLOR_DARK[color]}
            strokeWidth={0.05}
          />
        )),
      )}

      {/* Centre: four triangles meeting in the middle. */}
      {ALL_COLORS.map((color) => (
        <polygon key={`p${color}`} points={PINWHEEL[color]} fill={COLOR_HEX[color]} stroke="#ffffff" strokeWidth={0.07} strokeLinejoin="round" />
      ))}

      {/* Safe squares: a star on each start and on the four squares eight steps after them. */}
      {[...STAR_INDICES, ...ALL_COLORS.map((c) => START_INDEX[c])].map((idx) => {
        const [c, r] = LOOP[idx]!;
        const isStart = ALL_COLORS.some((col) => START_INDEX[col] === idx);
        return (
          <polygon
            key={`s${idx}`}
            points={starPoints(c + 0.5, r + 0.5, 0.34)}
            fill={isStart ? '#ffffff' : '#8f98ab'}
            fillOpacity={isStart ? 0.95 : 0.85}
          />
        );
      })}
    </svg>
  );
}

const BoardSvg = memo(BoardSvgView, (a, b) => a.seated.join() === b.seated.join());

const CELL = 100 / GRID;
const LANE_RECT: Record<PlayerColor, { x: number; y: number; w: number; h: number }> = {
  yellow: { x: 1, y: 7, w: 6, h: 1 },
  green: { x: 7, y: 1, w: 1, h: 6 },
  red: { x: 8, y: 7, w: 6, h: 1 },
  blue: { x: 7, y: 8, w: 1, h: 6 },
};

/** Highlights the active player's base and home lane with an opacity-only pulse in its own layer. */
function ActiveGlow({ color }: { color: PlayerColor }) {
  const [ox, oy] = YARD_ORIGIN[color];
  const lane = LANE_RECT[color];
  const box = (x: number, y: number, w: number, h: number): CSSProperties => ({
    left: `${x * CELL}%`,
    top: `${y * CELL}%`,
    width: `${w * CELL}%`,
    height: `${h * CELL}%`,
  });
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div
        key={color}
        className="ludo-pulse-opacity absolute rounded-[2px] border-[3px] border-white/90"
        style={{ ...box(ox, oy, 6, 6), boxShadow: 'inset 0 0 0 2px rgba(0,0,0,.18)' }}
      />
      <div key={`${color}-lane`} className="ludo-pulse-opacity absolute bg-white/45" style={box(lane.x, lane.y, lane.w, lane.h)} />
    </div>
  );
}

interface LudoBoardProps {
  state: GameState;
  anim: AnimOverride | null;
  active: PlayerColor | null;
  /** Token ids (of the active colour) that can move now. */
  validIds: readonly number[];
  /** Whether a human may pick a token right now. */
  selectable: boolean;
  burst: BurstFx | null;
  returning: ReadonlySet<string>;
  hopKey: number;
  /** Stable callback: tokens are memoised and call it with their own id. */
  onSelect: (tokenId: number) => void;
  /** Where the active colour's valid tokens would land. */
  hints: ReadonlyArray<{ color: PlayerColor; cell: Cell }>;
}

export function LudoBoard({ state, anim, active, validIds, selectable, burst, returning, hopKey, onSelect, hints }: LudoBoardProps) {
  const placed = placeTokens(state, anim);
  const seated = state.players.map((p) => p.color);
  return (
    <div
      className="ludo-appear relative aspect-square w-full rounded-[26px] p-[1.6%]"
      style={{
        background: 'linear-gradient(145deg, #2b3170, #12142c)',
        boxShadow: '0 30px 60px -24px rgba(0,0,0,.85), 0 0 60px -26px #7c5cff, inset 0 1px 0 rgba(255,255,255,.12)',
      }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[16px] ring-2 ring-amber-400/70">
        <BoardSvg seated={seated} />
        {active && <ActiveGlow color={active} />}
        <div aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_28px_rgba(0,0,0,0.28)]" />

        {hints.map((h, i) => (
          <span
            key={i}
            aria-hidden
            className="ludo-dot pointer-events-none absolute rounded-full border-2 border-dashed bg-white/35"
            style={{
              left: `${(h.cell[0] + 0.5) * CELL}%`,
              top: `${(h.cell[1] + 0.5) * CELL}%`,
              width: `${CELL * 0.86}%`,
              aspectRatio: '1',
              transform: 'translate(-50%, -50%)',
              borderColor: COLOR_DARK[h.color],
            }}
          />
        ))}

        {placed.map((t) => {
          const isActive = active === t.color;
          const valid = selectable && isActive && validIds.includes(t.id);
          const dimmed = isActive && selectable && !validIds.includes(t.id);
          const moving = anim !== null && anim.color === t.color && anim.tokenId === t.id;
          return (
            <LudoToken
              key={`${t.color}-${t.id}`}
              color={t.color}
              id={t.id}
              left={pct(t.cell[0] + 0.5 + t.dx)}
              top={pct(t.cell[1] + 0.5 + t.dy)}
              size={pct(TOKEN_SIZE)}
              scale={t.scale}
              valid={valid}
              dimmed={dimmed}
              moving={moving}
              returning={returning.has(`${t.color}-${t.id}`)}
              hopKey={moving ? hopKey : 0}
              onSelect={onSelect}
            />
          );
        })}

        {burst && (
          <div
            key={burst.id}
            aria-hidden
            className="pointer-events-none absolute z-40"
            style={{ left: `${pct(burst.cell[0] + 0.5)}%`, top: `${pct(burst.cell[1] + 0.5)}%` }}
          >
            <span className="ludo-impact" style={{ borderColor: COLOR_HEX[burst.color] }} />
            {Array.from({ length: 10 }, (_, i) => {
              const a = (i / 10) * Math.PI * 2;
              const d = 26 + (i % 3) * 8;
              return (
                <span
                  key={i}
                  className="ludo-spark"
                  style={
                    {
                      background: i % 2 ? COLOR_HEX[burst.color] : '#ffffff',
                      '--dx': `${Math.round(Math.cos(a) * d)}px`,
                      '--dy': `${Math.round(Math.sin(a) * d)}px`,
                    } as CSSProperties
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
