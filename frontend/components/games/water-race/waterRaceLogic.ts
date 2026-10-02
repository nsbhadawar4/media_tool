export type TeamId = 'a' | 'b';
export type WaterMode = 'bot' | 'versus';
export type BotLevel = 'easy' | 'normal' | 'hard';
export type Location = 'well' | 'tank' | 'to-tank' | 'to-well';

export const GAME_MS = 60_000;
/** Scoops a bucket holds. */
export const CAPACITY = 5;
/** Tank percentage one scoop adds when poured. */
export const PERCENT_PER_UNIT = 1.1;
export const POINTS_PER_UNIT = 10;
const COMBO_STEP = 0.1;
const MAX_MULTIPLIER = 1.5;
const BASE_TRAVEL_MS = 650;
const LOAD_TRAVEL_MS = 110;

export interface Team {
  id: TeamId;
  /** Scoops in the bucket. */
  load: number;
  location: Location;
  /** Game-clock time the current trip ends. */
  arriveAt: number;
  /** Length of the current trip, which the bucket's CSS transition mirrors. */
  travelMs: number;
  /** Tank fill, 0–100. */
  water: number;
  /** Scoops poured over the whole round. */
  delivered: number;
  score: number;
  /** Consecutive full buckets poured. */
  combo: number;
  bestCombo: number;
  /** Button presses that did something versus all of them. */
  useful: number;
  presses: number;
  /** Bumped by each scoop and pour, so the view can restart its splash animations. */
  scoopTick: number;
  pourTick: number;
  /** Points / percent from the last pour, for the floating score. */
  lastPoints: number;
  lastGain: number;
}

export type ActionResult =
  | { kind: 'scoop' }
  | { kind: 'pour'; points: number; gain: number; combo: number }
  | { kind: 'carry' }
  | { kind: 'return' }
  | { kind: 'wasted' }
  | { kind: 'ignored' };

export function createTeam(id: TeamId): Team {
  return {
    id,
    load: 0,
    location: 'well',
    arriveAt: 0,
    travelMs: 0,
    water: 0,
    delivered: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    useful: 0,
    presses: 0,
    scoopTick: 0,
    pourTick: 0,
    lastPoints: 0,
    lastGain: 0,
  };
}

const isTravelling = (team: Team) => team.location === 'to-tank' || team.location === 'to-well';

/** Lands a bucket whose trip has finished. Returns true on the call that arrives. */
export function settle(team: Team, now: number): boolean {
  if (!isTravelling(team) || now < team.arriveAt) return false;
  team.location = team.location === 'to-tank' ? 'tank' : 'well';
  return true;
}

function waste(team: Team): ActionResult {
  team.presses += 1;
  return { kind: 'wasted' };
}

/** The action button: scoop at the well, pour at the tank. */
export function act(team: Team): ActionResult {
  if (team.location === 'well') {
    if (team.load >= CAPACITY) return waste(team);
    team.load += 1;
    team.presses += 1;
    team.useful += 1;
    team.scoopTick += 1;
    return { kind: 'scoop' };
  }
  if (team.location === 'tank') {
    if (team.load === 0) return waste(team);
    const units = team.load;
    // Only a full bucket extends the combo; pouring a part-bucket breaks it.
    team.combo = units >= CAPACITY ? team.combo + 1 : 0;
    team.bestCombo = Math.max(team.bestCombo, team.combo);
    const multiplier = Math.min(MAX_MULTIPLIER, 1 + Math.max(0, team.combo - 1) * COMBO_STEP);
    const gain = units * PERCENT_PER_UNIT * multiplier;
    const points = Math.round(units * POINTS_PER_UNIT * multiplier);
    team.water = Math.min(100, team.water + gain);
    team.delivered += units;
    team.score += points;
    team.load = 0;
    team.presses += 1;
    team.useful += 1;
    team.pourTick += 1;
    team.lastPoints = points;
    team.lastGain = gain;
    return { kind: 'pour', points, gain, combo: team.combo };
  }
  return { kind: 'ignored' };
}

/** The move button: carry to the tank from the well, or head back to the well from the tank. */
export function go(team: Team, now: number): ActionResult {
  if (isTravelling(team)) return { kind: 'ignored' };
  if (team.location === 'well') {
    if (team.load === 0) return waste(team);
    team.location = 'to-tank';
    team.travelMs = BASE_TRAVEL_MS + team.load * LOAD_TRAVEL_MS;
    team.arriveAt = now + team.travelMs;
    team.presses += 1;
    team.useful += 1;
    return { kind: 'carry' };
  }
  team.location = 'to-well';
  team.travelMs = BASE_TRAVEL_MS;
  team.arriveAt = now + team.travelMs;
  team.presses += 1;
  // Heading back with water still in the bucket is a wasted trip.
  if (team.load === 0) team.useful += 1;
  return { kind: 'return' };
}

export function accuracy(team: Team): number {
  return team.presses === 0 ? 100 : Math.round((team.useful / team.presses) * 100);
}

export interface BotConfig {
  /** Range of milliseconds between presses. */
  interval: [number, number];
  /** Chance a press is a clumsy one (wrong button for the moment). */
  mistake: number;
  /** Scoops it is happy to carry with. Below CAPACITY it will break its own combo. */
  carryAt: number;
}

export const BOTS: Record<BotLevel, BotConfig> = {
  easy: { interval: [560, 820], mistake: 0.18, carryAt: 4 },
  normal: { interval: [340, 500], mistake: 0.07, carryAt: 5 },
  hard: { interval: [250, 370], mistake: 0.02, carryAt: 5 },
};

export type BotMove = 'act' | 'go';

/**
 * What the bot presses next. It plays the same loop a person does — scoop until the bucket
 * is full, carry it over, pour, come back — through the same buttons, so it is subject to the
 * same trip times. Mistakes make it press the wrong thing, which costs it time and accuracy.
 */
export function botMove(team: Team, config: BotConfig, rng: () => number = Math.random): BotMove | null {
  if (isTravelling(team)) return null;
  if (rng() < config.mistake) {
    // A clumsy press: the other button for this moment.
    return team.location === 'well' && team.load < CAPACITY ? 'go' : 'act';
  }
  if (team.location === 'well') return team.load >= config.carryAt ? 'go' : 'act';
  return team.load > 0 ? 'act' : 'go';
}

export function nextBotDelay(config: BotConfig, rng: () => number = Math.random): number {
  const [lo, hi] = config.interval;
  return lo + rng() * (hi - lo);
}

export function winnerOf(a: Team, b: Team): TeamId | null {
  if (Math.round(a.water * 10) !== Math.round(b.water * 10)) return a.water > b.water ? 'a' : 'b';
  if (a.score !== b.score) return a.score > b.score ? 'a' : 'b';
  return null;
}
