import { api } from './client';

/** Shapes returned by /api/kid-games (backend/src/controllers/kidGameController.ts). */

export type KidSubjectId = 'hindi' | 'english' | 'math';

export interface KidGameRecordDto {
  gameId: string;
  classLevel: number;
  subject: KidSubjectId;
  /** 0–100 */
  bestScore: number;
  latestScore: number;
  attempts: number;
  /** Finished with at least one star. */
  completed: boolean;
  completionCount: number;
  xpEarned: number;
  bestStreak: number;
  /** 0–3 */
  stars: number;
  bestCorrect: number;
  bestTotal: number;
  totalSeconds: number;
  lastPlayed: string;
}

export type KidAchievementId = 'first-game' | 'five-games' | 'ten-games' | 'streak-3' | 'streak-7' | 'xp-500' | 'xp-1000' | 'subject-master' | 'class-champion';

export interface KidProfileDto {
  totalXp: number;
  gameStreak: number;
  dailyStreak: { current: number; best: number; lastDay: string | null };
  days: Record<string, Record<KidSubjectId, number>>;
  achievements: { id: KidAchievementId; unlockedAt: string }[];
  lastGameId: string | null;
  settings: { sound: boolean };
}

export interface KidProgressDto {
  profile: KidProfileDto;
  games: KidGameRecordDto[];
}

export interface KidResultSummaryDto {
  gameId: string;
  score: number;
  correct: number;
  total: number;
  stars: number;
  completed: boolean;
  bestStreak: number;
  seconds: number;
  xpGained: number;
  xpLines: { reason: 'score' | 'perfect' | 'new-best' | 'streak-3' | 'streak-5'; xp: number }[];
  isNewBest: boolean;
  previousBest: number | null;
  gameStreak: number;
  dailyStreak: number;
  totalXp: number;
  unlocked: KidAchievementId[];
}

export interface KidResultInput {
  gameId: string;
  correct: number;
  total: number;
  bestStreak: number;
  seconds: number;
  /** The child's local date, for streaks. */
  day: string;
}

export const kidGamesApi = {
  progress: () => api.get<KidProgressDto>('/api/kid-games/progress'),
  submit: (input: KidResultInput) =>
    api.post<{ result: KidResultSummaryDto; game: KidGameRecordDto; profile: KidProfileDto }>('/api/kid-games/results', input),
  settings: (sound: boolean) => api.put<{ settings: { sound: boolean } }>('/api/kid-games/settings', { sound }),
};
