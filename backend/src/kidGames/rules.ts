/**
 * Kid Games scoring rules — the server's copy, and the one that counts.
 *
 * The browser shows a game and reports what happened (how many answers were right); everything
 * that is *earned* — XP, stars, streaks, achievements, best scores — is worked out here, from
 * the stored record, so a replay can never lower a best score and the same result can never be
 * farmed for XP twice. Pure functions only: the controller loads and saves, these decide.
 *
 * The game list mirrors frontend/lib/kid-games/catalog.ts (slot order and difficulty);
 * frontend/tests/kidGamesRules.test.ts fails if the two ever disagree.
 */

export const KID_SUBJECTS = ['hindi', 'english', 'math'] as const;
export type KidSubject = (typeof KID_SUBJECTS)[number];
export type KidDifficulty = 'easy' | 'medium' | 'hard';

export const KID_SLOTS: Record<KidSubject, readonly string[]> = {
  hindi: ['varn-pehchan', 'matra-milao', 'shabd-banao', 'chitra-shabd', 'sahi-shabd', 'akshar-kram', 'shabd-milan', 'rikt-sthan', 'vakya-poora', 'hindi-quiz'],
  english: ['alphabet-adventure', 'word-match', 'picture-word-match', 'spell-it', 'missing-letter', 'sentence-builder', 'grammar-quest', 'vocabulary-challenge', 'reading-challenge', 'english-quiz'],
  math: ['number-runner', 'counting-challenge', 'addition-adventure', 'subtraction-challenge', 'multiplication-quest', 'division-challenge', 'number-comparison', 'missing-number', 'pattern-puzzle', 'math-quiz'],
};

/** Four easy, four medium, two hard in every class and subject. */
export const DIFFICULTY_BY_INDEX: readonly KidDifficulty[] = ['easy', 'easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'medium', 'hard', 'hard'];
export const XP_BY_DIFFICULTY: Record<KidDifficulty, number> = { easy: 50, medium: 75, hard: 100 };
export const BONUS_XP = { perfect: 25, newBest: 25, streak3: 25, streak5: 50 } as const;

export const GAMES_PER_SUBJECT = 10;
export const CLASS_LEVELS = [1, 2, 3, 4, 5] as const;

export interface GameInfo {
  gameId: string;
  classLevel: number;
  subject: KidSubject;
  slot: string;
  difficulty: KidDifficulty;
  baseXp: number;
}

/** "c3-math-addition-adventure" → its class, subject and worth; anything else is null. */
export function parseGameId(gameId: string): GameInfo | null {
  const match = /^c([1-5])-(hindi|english|math)-([a-z-]+)$/.exec(gameId);
  if (!match) return null;
  const subject = match[2] as KidSubject;
  const index = KID_SLOTS[subject].indexOf(match[3]);
  if (index < 0) return null;
  const difficulty = DIFFICULTY_BY_INDEX[index];
  return { gameId, classLevel: Number(match[1]), subject, slot: match[3], difficulty, baseXp: XP_BY_DIFFICULTY[difficulty] };
}

/** 90%+ three stars, 70%+ two, 50%+ one. A game counts as completed from one star. */
export function starsFor(score: number): number {
  if (score >= 90) return 3;
  if (score >= 70) return 2;
  if (score >= 50) return 1;
  return 0;
}

export const ACHIEVEMENT_IDS = ['first-game', 'five-games', 'ten-games', 'streak-3', 'streak-7', 'xp-500', 'xp-1000', 'subject-master', 'class-champion'] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export interface GameRecordState {
  gameId: string;
  classLevel: number;
  subject: KidSubject;
  /** 0–100 */
  bestScore: number;
  latestScore: number;
  attempts: number;
  completed: boolean;
  completionCount: number;
  /** Everything this game has ever paid out. */
  xpEarned: number;
  /** The score-based part of the best attempt's XP; later attempts only pay the difference. */
  bestScoreXp: number;
  bestStreak: number;
  stars: number;
  bestCorrect: number;
  bestTotal: number;
  totalSeconds: number;
  perfectBonusAwarded: boolean;
  /** Day the "new best" bonus was last paid for this game (at most once a day). */
  newBestBonusDay: string | null;
  lastPlayed: Date;
}

export interface DayTally {
  hindi: number;
  english: number;
  math: number;
}

export interface ProfileState {
  totalXp: number;
  /** Games in a row finished with at least one star. */
  gameStreak: number;
  dailyStreak: { current: number; best: number; lastDay: string | null };
  /** Finished games per day, last 60 days. */
  days: Record<string, DayTally>;
  achievements: { id: AchievementId; unlockedAt: Date }[];
  lastGameId: string | null;
  sound: boolean;
}

export function emptyProfile(): ProfileState {
  return { totalXp: 0, gameStreak: 0, dailyStreak: { current: 0, best: 0, lastDay: null }, days: {}, achievements: [], lastGameId: null, sound: false };
}

export interface ResultInput {
  correct: number;
  total: number;
  /** Longest run of right answers in this attempt. */
  bestStreak: number;
  seconds: number;
}

export interface XpLine {
  reason: 'score' | 'perfect' | 'new-best' | 'streak-3' | 'streak-5';
  xp: number;
}

export interface ResultSummary {
  gameId: string;
  score: number;
  correct: number;
  total: number;
  stars: number;
  completed: boolean;
  bestStreak: number;
  seconds: number;
  xpGained: number;
  xpLines: XpLine[];
  isNewBest: boolean;
  previousBest: number | null;
  gameStreak: number;
  dailyStreak: number;
  totalXp: number;
  unlocked: AchievementId[];
}

/** YYYY-MM-DD, one day earlier. Pure string arithmetic in UTC so it never drifts with the server's zone. */
export function previousDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * The child's own calendar day, if the browser's claim is believable (within a day of the
 * server's UTC date — every time zone is), else the server's. Only streaks and the daily goal
 * use it, and only for this user.
 */
export function resolveDay(claimed: string | undefined, now = new Date()): string {
  const server = now.toISOString().slice(0, 10);
  if (!claimed || !/^\d{4}-\d{2}-\d{2}$/.test(claimed)) return server;
  const diff = Math.abs(new Date(`${claimed}T00:00:00Z`).getTime() - new Date(`${server}T00:00:00Z`).getTime());
  return diff <= 24 * 60 * 60 * 1000 ? claimed : server;
}

function unlockedAchievements(records: Map<string, GameRecordState>, profile: ProfileState): AchievementId[] {
  const completed = [...records.values()].filter((r) => r.completed);
  const bySubject = new Map<string, number>();
  const byClass = new Map<number, number>();
  for (const record of completed) {
    const key = `${record.classLevel}-${record.subject}`;
    bySubject.set(key, (bySubject.get(key) ?? 0) + 1);
    byClass.set(record.classLevel, (byClass.get(record.classLevel) ?? 0) + 1);
  }
  const conditions: Record<AchievementId, boolean> = {
    'first-game': completed.length >= 1,
    'five-games': completed.length >= 5,
    'ten-games': completed.length >= 10,
    'streak-3': profile.dailyStreak.current >= 3,
    'streak-7': profile.dailyStreak.current >= 7,
    'xp-500': profile.totalXp >= 500,
    'xp-1000': profile.totalXp >= 1000,
    'subject-master': [...bySubject.values()].some((n) => n >= GAMES_PER_SUBJECT),
    'class-champion': [...byClass.values()].some((n) => n >= GAMES_PER_SUBJECT * KID_SUBJECTS.length),
  };
  const have = new Set(profile.achievements.map((a) => a.id));
  return ACHIEVEMENT_IDS.filter((id) => conditions[id] && !have.has(id));
}

/**
 * Applies one finished game to a user's progress. `records` is every game record the user has
 * (it is only read, for achievements); the updated record and profile are returned for saving.
 */
export function applyResult(
  game: GameInfo,
  records: Map<string, GameRecordState>,
  profileIn: ProfileState,
  input: ResultInput,
  day: string,
  now = new Date(),
): { record: GameRecordState; profile: ProfileState; summary: ResultSummary } {
  const previous = records.get(game.gameId);
  const score = Math.round((input.correct / input.total) * 100);
  const stars = starsFor(score);
  const completed = stars >= 1;

  // --- XP: only what is new is paid, so replaying the same result earns nothing extra.
  const xpLines: XpLine[] = [];
  const scoreXp = Math.round((game.baseXp * score) / 100);
  const scoreGain = Math.max(0, scoreXp - (previous?.bestScoreXp ?? 0));
  if (scoreGain > 0) xpLines.push({ reason: 'score', xp: scoreGain });
  const perfect = score === 100 && !previous?.perfectBonusAwarded;
  if (perfect) xpLines.push({ reason: 'perfect', xp: BONUS_XP.perfect });
  const isNewBest = Boolean(previous) && score > (previous?.bestScore ?? 0);
  if (isNewBest && previous?.newBestBonusDay !== day) xpLines.push({ reason: 'new-best', xp: BONUS_XP.newBest });

  // A run of passed games that each earned something new. A game below one star ends the run; a
  // replay that earns nothing new leaves it where it is. So a run (and its bonus at 3 and 5)
  // cannot be manufactured from repeats of an old result.
  const earnedSomethingNew = scoreGain > 0 || perfect;
  const gameStreak = !completed ? 0 : earnedSomethingNew ? profileIn.gameStreak + 1 : profileIn.gameStreak;
  if (earnedSomethingNew && gameStreak === 3) xpLines.push({ reason: 'streak-3', xp: BONUS_XP.streak3 });
  if (earnedSomethingNew && gameStreak === 5) xpLines.push({ reason: 'streak-5', xp: BONUS_XP.streak5 });
  const xpGained = xpLines.reduce((sum, line) => sum + line.xp, 0);

  const record: GameRecordState = {
    gameId: game.gameId,
    classLevel: game.classLevel,
    subject: game.subject,
    bestScore: Math.max(score, previous?.bestScore ?? 0),
    latestScore: score,
    attempts: (previous?.attempts ?? 0) + 1,
    completed: completed || Boolean(previous?.completed),
    completionCount: (previous?.completionCount ?? 0) + (completed ? 1 : 0),
    xpEarned: (previous?.xpEarned ?? 0) + xpGained,
    bestScoreXp: Math.max(scoreXp, previous?.bestScoreXp ?? 0),
    bestStreak: Math.max(input.bestStreak, previous?.bestStreak ?? 0),
    stars: Math.max(stars, previous?.stars ?? 0),
    bestCorrect: !previous || score > previous.bestScore ? input.correct : previous.bestCorrect,
    bestTotal: !previous || score > previous.bestScore ? input.total : previous.bestTotal,
    totalSeconds: (previous?.totalSeconds ?? 0) + input.seconds,
    perfectBonusAwarded: Boolean(previous?.perfectBonusAwarded) || perfect,
    newBestBonusDay: xpLines.some((l) => l.reason === 'new-best') ? day : (previous?.newBestBonusDay ?? null),
    lastPlayed: now,
  };

  // --- Daily streak: any finished game counts, once per day.
  const daily = { ...profileIn.dailyStreak };
  if (daily.lastDay !== day) {
    daily.current = daily.lastDay === previousDay(day) ? daily.current + 1 : 1;
    daily.best = Math.max(daily.best, daily.current);
    daily.lastDay = day;
  }
  const tally = profileIn.days[day] ?? { hindi: 0, english: 0, math: 0 };
  const days: Record<string, DayTally> = { ...profileIn.days, [day]: { ...tally, [game.subject]: tally[game.subject] + 1 } };
  const cutoff = (() => {
    let d = day;
    for (let i = 0; i < 60; i++) d = previousDay(d);
    return d;
  })();
  for (const key of Object.keys(days)) if (key < cutoff) delete days[key];

  const profile: ProfileState = {
    ...profileIn,
    totalXp: profileIn.totalXp + xpGained,
    gameStreak,
    dailyStreak: daily,
    days,
    lastGameId: game.gameId,
    achievements: [...profileIn.achievements],
  };

  const after = new Map(records);
  after.set(game.gameId, record);
  const unlocked = unlockedAchievements(after, profile);
  for (const id of unlocked) profile.achievements.push({ id, unlockedAt: now });

  return {
    record,
    profile,
    summary: {
      gameId: game.gameId,
      score,
      correct: input.correct,
      total: input.total,
      stars,
      completed,
      bestStreak: input.bestStreak,
      seconds: input.seconds,
      xpGained,
      xpLines,
      isNewBest,
      previousBest: previous ? previous.bestScore : null,
      gameStreak,
      dailyStreak: daily.current,
      totalXp: profile.totalXp,
      unlocked,
    },
  };
}
