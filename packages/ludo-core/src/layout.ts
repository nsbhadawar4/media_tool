import type { Cell, PlayerColor, PlayerCount } from './types';

export const GRID = 15;
export const LOOP_LENGTH = 52;
export const PROGRESS_YARD = -1;
export const LAST_LOOP_PROGRESS = 50;
export const HOME_COLUMN_START = 51;
export const PROGRESS_FINISHED = 57;
export const TOKENS_PER_PLAYER = 4;

/** Seats clockwise from the top-left: yellow, green, red, blue. Turn order follows this. */
export const ALL_COLORS: readonly PlayerColor[] = ['yellow', 'green', 'red', 'blue'];

/** Seats used for each player count: fewer players sit opposite each other. Turn order is clockwise. */
export const SEATS: Record<PlayerCount, readonly PlayerColor[]> = {
  2: ['yellow', 'red'],
  3: ['yellow', 'green', 'red'],
  4: ['yellow', 'green', 'red', 'blue'],
};

export const COLOR_HEX: Record<PlayerColor, string> = {
  red: '#E53935',
  blue: '#3D8FE8',
  green: '#3FAE49',
  yellow: '#F4C430',
};

/** Darker shade of each colour: borders, token bodies, shadows. */
export const COLOR_DARK: Record<PlayerColor, string> = {
  red: '#9f1f1c',
  blue: '#1f5fae',
  green: '#2a7a32',
  yellow: '#b8890a',
};

/** Lighter tint: highlights and the soft panel behind a yard. */
export const COLOR_LIGHT: Record<PlayerColor, string> = {
  red: '#ff8a80',
  blue: '#9cc9ff',
  green: '#9be3a2',
  yellow: '#ffe486',
};

export const COLOR_NAME: Record<PlayerColor, string> = {
  red: 'Red',
  blue: 'Blue',
  green: 'Green',
  yellow: 'Yellow',
};

/** The 52-cell clockwise main loop as [col,row], starting at Yellow's start cell (1,6). */
function buildLoop(): Cell[] {
  const out: Cell[] = [];
  const run = (c: number, r: number, dc: number, dr: number, n: number) => {
    for (let i = 0; i < n; i++) out.push([c + dc * i, r + dr * i]);
  };
  run(1, 6, 1, 0, 5); // yellow start -> (5,6)
  run(6, 5, 0, -1, 6); // up the top arm, left column
  run(7, 0, 1, 0, 2); // across the top
  run(8, 1, 0, 1, 5); // down the top arm, right column (green start at (8,1))
  run(9, 6, 1, 0, 6); // right arm, top row
  run(14, 7, 0, 1, 2); // right edge
  run(13, 8, -1, 0, 5); // right arm, bottom row (red start at (13,8))
  run(8, 9, 0, 1, 6); // bottom arm, right column
  run(7, 14, -1, 0, 2); // bottom edge
  run(6, 13, 0, -1, 5); // bottom arm, left column (blue start at (6,13))
  run(5, 8, -1, 0, 6); // left arm, bottom row
  run(0, 7, 0, -1, 2); // left edge back to (0,6)
  return out;
}

export const LOOP: readonly Cell[] = buildLoop();

/** Loop index of each colour's start cell. */
export const START_INDEX: Record<PlayerColor, number> = { yellow: 0, green: 13, red: 26, blue: 39 };

/** Safe loop indices: the four start squares and the four star squares (start + 8). */
export const STAR_INDICES: readonly number[] = [8, 21, 34, 47];
export const SAFE_INDICES: ReadonlySet<number> = new Set([0, 13, 26, 39, ...STAR_INDICES]);

/** The 6 home-column cells per colour, in walking order (progress 51..56). */
export const HOME_COLUMN: Record<PlayerColor, readonly Cell[]> = {
  yellow: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  red: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
};

/** Where a finished token rests: inside its own triangle of the central pinwheel. */
export const FINISH_CELL: Record<PlayerColor, Cell> = {
  yellow: [6, 7],
  green: [7, 6],
  red: [8, 7],
  blue: [7, 8],
};

/** Top-left cell of each 6x6 yard. */
export const YARD_ORIGIN: Record<PlayerColor, Cell> = {
  yellow: [0, 0],
  green: [9, 0],
  red: [9, 9],
  blue: [0, 9],
};

const SLOT_OFFSETS: readonly Cell[] = [
  [1.5, 1.5],
  [3.5, 1.5],
  [1.5, 3.5],
  [3.5, 3.5],
];

/** Yard slot for each of the 4 tokens. Like all cell coords, the visual centre is coord + 0.5. */
export function yardSlot(color: PlayerColor, tokenId: number): Cell {
  const [ox, oy] = YARD_ORIGIN[color];
  const [dx, dy] = SLOT_OFFSETS[tokenId % 4]!;
  return [ox + dx, oy + dy];
}

/** Absolute loop index of a token with progress 0..50. */
export function loopIndex(color: PlayerColor, progress: number): number {
  return (START_INDEX[color] + progress) % LOOP_LENGTH;
}

/** Grid cell for a token. Cell coords are top-left; the visual centre is +0.5 on both axes. */
export function tokenCell(color: PlayerColor, progress: number, tokenId = 0): Cell {
  if (progress < 0) return yardSlot(color, tokenId);
  if (progress <= LAST_LOOP_PROGRESS) return LOOP[loopIndex(color, progress)]!;
  if (progress < PROGRESS_FINISHED) return HOME_COLUMN[color][progress - HOME_COLUMN_START]!;
  return FINISH_CELL[color];
}

/** Progress values visited when moving from `from` to `to` (a yard exit is a single step to 0). */
export function progressSteps(from: number, to: number): number[] {
  if (from < 0) return [0];
  const out: number[] = [];
  for (let p = from + 1; p <= to; p++) out.push(p);
  return out;
}

/** Grid cells for each step of a move, excluding the origin. */
export function tokenPath(color: PlayerColor, from: number, to: number): Cell[] {
  return progressSteps(from, to).map((p) => tokenCell(color, p));
}

export function isSafeIndex(index: number): boolean {
  return SAFE_INDICES.has(index);
}
