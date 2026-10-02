export interface Point {
  x: number;
  y: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';
export type SnakeStatus = 'ready' | 'playing' | 'paused' | 'over';
export type FoodKind = 'normal' | 'bonus';

export interface Food extends Point {
  kind: FoodKind;
  /** Ticks left before a bonus food disappears; unused (Infinity) for normal food. */
  ttl: number;
}

export interface SnakeState {
  /** Head first. */
  snake: Point[];
  /** Where each segment was one tick ago — the renderer glides between this and `snake`. */
  prev: Point[];
  dir: Direction;
  /** Turns waiting to be applied, so two quick key presses inside one tick both count. */
  queue: Direction[];
  food: Food;
  bonus: Food | null;
  score: number;
  /** Foods eaten (normal and bonus). */
  eaten: number;
  level: number;
  status: SnakeStatus;
}

export type SnakeEvent =
  | { type: 'eat'; kind: FoodKind; points: number; at: Point }
  | { type: 'level'; level: number }
  | { type: 'bonus-spawn' }
  | { type: 'bonus-expire' }
  | { type: 'dead'; reason: 'wall' | 'self' | 'full' };
