export type TargetMode = 'classic' | 'attack' | 'precision';

export interface Target {
  id: number;
  /** Centre, as a percentage of the arena. */
  x: number;
  y: number;
  /** Visual diameter in px. */
  size: number;
  /** Game-clock times, in ms. */
  bornAt: number;
  ttl: number;
  /** Set once the target has timed out; it plays its exit animation until this time. */
  leaveAt: number | null;
  points: number;
}

export interface ModeConfig {
  seconds: number;
  /** Most targets on screen at once. */
  maxLive: (hits: number) => number;
  /** Pause range before the next target appears, ms. */
  gap: (hits: number) => [number, number];
}

export const MODE_CONFIG: Record<TargetMode, ModeConfig> = {
  classic: { seconds: 30, maxLive: () => 2, gap: () => [220, 560] },
  attack: {
    seconds: 40,
    maxLive: (hits) => Math.min(3, 1 + Math.floor(hits / 12)),
    gap: (hits) => [Math.max(60, 380 - hits * 8), Math.max(140, 700 - hits * 14)],
  },
  precision: { seconds: 30, maxLive: () => 1, gap: () => [200, 420] },
};

/** Minimum on-screen hit area for touch, regardless of how small the visible target is. */
export const MIN_HIT_PX = 44;
/** In precision mode, a hit inside this fraction of the radius is a "perfect" and scores double. */
export const PERFECT_RADIUS = 0.38;

const CLASSIC_TIERS = [
  { size: 88, points: 5, weight: 3 },
  { size: 62, points: 10, weight: 4 },
  { size: 40, points: 20, weight: 3 },
];

function pick<T extends { weight: number }>(items: T[], rng: () => number): T {
  let roll = rng() * items.reduce((sum, item) => sum + item.weight, 0);
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1]!;
}

/** Size, lifetime and value of the next target, given how far the player has got. */
export function nextTargetSpec(
  mode: TargetMode,
  hits: number,
  elapsedMs: number,
  rng: () => number = Math.random,
): { size: number; ttl: number; points: number } {
  if (mode === 'classic') {
    const tier = pick(CLASSIC_TIERS, rng);
    return { size: tier.size, ttl: 1800, points: tier.points };
  }
  if (mode === 'attack') {
    const size = Math.max(30, Math.round(80 - hits * 2.2));
    return { size, ttl: Math.max(640, Math.round(1700 * Math.pow(0.955, hits))), points: Math.round(1000 / size) };
  }
  const t = Math.min(1, elapsedMs / (MODE_CONFIG.precision.seconds * 1000));
  const size = Math.round(58 - 34 * t);
  return { size, ttl: 2200, points: Math.round(1000 / size) };
}

/** Streak multiplier: ×1, then +1 for every five hits in a row, up to ×4. */
export function comboMultiplier(combo: number): number {
  return 1 + Math.min(3, Math.floor(combo / 5));
}

/**
 * Where to put a new target: random, kept inside the arena and clear of the ones already up.
 * Falls back to the last try rather than looping forever on a crowded arena.
 */
export function placeTarget(
  width: number,
  height: number,
  size: number,
  others: Target[],
  rng: () => number = Math.random,
): { x: number; y: number } {
  const half = Math.max(size, MIN_HIT_PX) / 2 + 6;
  let spot = { x: 50, y: 50 };
  for (let attempt = 0; attempt < 10; attempt++) {
    const px = half + rng() * Math.max(1, width - half * 2);
    const py = half + rng() * Math.max(1, height - half * 2);
    spot = { x: (px / width) * 100, y: (py / height) * 100 };
    const clear = others.every((o) => {
      const dx = ((o.x - spot.x) / 100) * width;
      const dy = ((o.y - spot.y) / 100) * height;
      return Math.hypot(dx, dy) > (o.size + size) / 2 + 12;
    });
    if (clear) break;
  }
  return spot;
}

export function accuracyOf(hits: number, misses: number): number {
  const total = hits + misses;
  return total === 0 ? 100 : Math.round((hits / total) * 100);
}
