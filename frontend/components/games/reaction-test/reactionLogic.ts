export type ReactionMode = 'classic' | 'five' | 'speed';

export interface Rating {
  label: 'Excellent' | 'Great' | 'Good' | 'Try Again';
  color: string;
}

/** A plain game-performance label for one reaction time. */
export function rate(ms: number): Rating {
  if (ms < 220) return { label: 'Excellent', color: '#34d399' };
  if (ms < 290) return { label: 'Great', color: '#38bdf8' };
  if (ms < 380) return { label: 'Good', color: '#fbbf24' };
  return { label: 'Try Again', color: '#fb7185' };
}

/** Time the "get ready" lights take to count up before the random hold starts. */
export const LIGHTS_MS = 1200;

/** How long the lights stay on, unpredictably, before the screen goes green. */
export function holdDelay(mode: ReactionMode, round: number, rng: () => number = Math.random): number {
  const [lo, hi] = mode === 'speed' ? [500, Math.max(1200, 2600 - round * 120)] : [800, 3200];
  return lo + rng() * (hi - lo);
}

export const FIVE_ROUNDS = 5;

/** Speed mode: how long the green stays up before the round is lost. Shrinks every round. */
export function speedWindow(round: number): number {
  return Math.max(280, 1000 - (round - 1) * 80);
}

export function speedPoints(round: number, ms: number): number {
  return 100 + Math.max(0, Math.round((speedWindow(round) - ms) / 5));
}

export interface ReactionStats {
  average: number;
  fastest: number;
  slowest: number;
  /** 0–100; how tightly the times cluster. 100 means identical. */
  consistency: number;
}

export function summarize(times: number[]): ReactionStats | null {
  if (times.length === 0) return null;
  const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
  const variance = times.reduce((sum, t) => sum + (t - mean) ** 2, 0) / times.length;
  const deviation = Math.sqrt(variance);
  return {
    average: Math.round(mean),
    fastest: Math.min(...times),
    slowest: Math.max(...times),
    consistency: Math.max(0, Math.min(100, Math.round(100 - (deviation / mean) * 250))),
  };
}
