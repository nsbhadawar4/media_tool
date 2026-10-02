import type { Direction, Food, Point, SnakeEvent, SnakeState } from './snakeTypes';

export const COLS = 20;
export const ROWS = 20;
export const NORMAL_POINTS = 10;
export const BONUS_POINTS = 30;
/** Bonus food lives this many ticks. */
export const BONUS_TTL = 42;
/** A bonus appears after every this-many foods. */
const BONUS_EVERY = 4;
const FOODS_PER_LEVEL = 5;
const MAX_QUEUE = 2;

export const DIRS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** Milliseconds per move; the game speeds up with each level down to a floor. */
export function tickInterval(level: number): number {
  return Math.max(62, 150 - (level - 1) * 11);
}

export function levelFor(eaten: number): number {
  return 1 + Math.floor(eaten / FOODS_PER_LEVEL);
}

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** A random empty cell, or null when the snake fills the board. */
function freeCell(occupied: Point[], rng: () => number): Point | null {
  const taken = new Set(occupied.map((p) => p.y * COLS + p.x));
  const free: number[] = [];
  for (let i = 0; i < COLS * ROWS; i++) if (!taken.has(i)) free.push(i);
  if (free.length === 0) return null;
  const pick = free[Math.floor(rng() * free.length)]!;
  return { x: pick % COLS, y: Math.floor(pick / COLS) };
}

export function createSnake(rng: () => number = Math.random): SnakeState {
  const cy = Math.floor(ROWS / 2);
  const snake = [
    { x: 5, y: cy },
    { x: 4, y: cy },
    { x: 3, y: cy },
  ];
  const cell = freeCell(snake, rng)!;
  return {
    snake,
    prev: snake.map((p) => ({ ...p })),
    dir: 'right',
    queue: [],
    food: { ...cell, kind: 'normal', ttl: Infinity },
    bonus: null,
    score: 0,
    eaten: 0,
    level: 1,
    status: 'ready',
  };
}

/** Queues a turn. Reversing straight into the neck is ignored, as is repeating the current heading. */
export function queueDirection(state: SnakeState, dir: Direction): void {
  const last = state.queue.length > 0 ? state.queue[state.queue.length - 1]! : state.dir;
  if (dir === last || dir === OPPOSITE[last] || state.queue.length >= MAX_QUEUE) return;
  state.queue.push(dir);
}

/** Advances the game by one cell. Mutates `state` and reports what happened. */
export function stepSnake(state: SnakeState, rng: () => number = Math.random): SnakeEvent[] {
  const events: SnakeEvent[] = [];
  const next = state.queue.shift();
  if (next) state.dir = next;

  const head = state.snake[0]!;
  const vec = DIRS[state.dir];
  const target = { x: head.x + vec.x, y: head.y + vec.y };

  if (target.x < 0 || target.y < 0 || target.x >= COLS || target.y >= ROWS) {
    state.status = 'over';
    return [{ type: 'dead', reason: 'wall' }];
  }

  const ateNormal = same(target, state.food);
  const ateBonus = state.bonus !== null && same(target, state.bonus);
  const grows = ateNormal || ateBonus;

  // The tail cell is vacated this tick unless the snake is growing, so stepping onto it is safe.
  const body = grows ? state.snake : state.snake.slice(0, -1);
  if (body.some((p) => same(p, target))) {
    state.status = 'over';
    return [{ type: 'dead', reason: 'self' }];
  }

  const before = state.snake;
  state.snake = [target, ...(grows ? before : before.slice(0, -1))];
  // The new tail segment starts where the old tail was, so growth slides out instead of popping in.
  state.prev = grows ? [...before, before[before.length - 1]!] : before;

  if (state.bonus) {
    state.bonus.ttl -= 1;
    if (state.bonus.ttl <= 0 && !ateBonus) {
      state.bonus = null;
      events.push({ type: 'bonus-expire' });
    }
  }

  if (grows) {
    const kind = ateBonus ? 'bonus' : 'normal';
    const points = ateBonus ? BONUS_POINTS : NORMAL_POINTS;
    state.score += points;
    state.eaten += 1;
    events.push({ type: 'eat', kind, points, at: target });

    if (ateBonus) state.bonus = null;
    if (ateNormal) {
      const cell = freeCell([...state.snake, ...(state.bonus ? [state.bonus] : [])], rng);
      if (!cell) {
        state.status = 'over';
        events.push({ type: 'dead', reason: 'full' });
        return events;
      }
      state.food = { ...cell, kind: 'normal', ttl: Infinity };
    }

    const level = levelFor(state.eaten);
    if (level > state.level) {
      state.level = level;
      events.push({ type: 'level', level });
    }

    if (ateNormal && !state.bonus && state.eaten % BONUS_EVERY === 0) {
      const cell = freeCell([...state.snake, state.food], rng);
      if (cell) {
        const bonus: Food = { ...cell, kind: 'bonus', ttl: BONUS_TTL };
        state.bonus = bonus;
        events.push({ type: 'bonus-spawn' });
      }
    }
  }

  return events;
}
