import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, CalendarCheck, Crown, Flame, GraduationCap, Medal, Sparkles, Star, Trophy, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { kidGamesApi, type KidAchievementId, type KidGameRecordDto, type KidProgressDto, type KidResultInput, type KidResultSummaryDto } from '@/lib/api/kidGames';
import { ALL_GAMES, findLearningGame } from './catalog';
import type { PreparedQuestion } from './session';
import type { ClassLevel, LearningGame, Subject } from './types';

/**
 * Kid Games progress, stored on the server per signed-in account (MongoDB, /api/kid-games).
 *
 * The server is the source of truth for everything earned: best scores, stars, XP, streaks and
 * achievements are worked out there from the stored record, and the browser only reports how many
 * answers were right. This module turns the API into one shape for the UI, keeps it in the React
 * Query cache, and updates that cache from each saved result so every page reflects a finished
 * game at once. The one thing kept in the browser is an unfinished game (to resume it on this
 * device), stored under the account's id.
 */

export type GameRecord = KidGameRecordDto;
export type AchievementId = KidAchievementId;
export type GameResult = KidResultSummaryDto;

export interface KidProgress {
  /** False until the server has answered; every figure is zero meanwhile. */
  ready: boolean;
  xp: number;
  games: Record<string, GameRecord>;
  days: Record<string, Record<Subject, number>>;
  achievements: Partial<Record<AchievementId, string>>;
  dailyStreak: { current: number; best: number; lastDay: string | null };
  gameStreak: number;
  lastGameId: string | null;
  settings: { sound: boolean };
}

export const EMPTY_PROGRESS: KidProgress = {
  ready: false,
  xp: 0,
  games: {},
  days: {},
  achievements: {},
  dailyStreak: { current: 0, best: 0, lastDay: null },
  gameStreak: 0,
  lastGameId: null,
  settings: { sound: false },
};

const QUERY_KEY = ['kid-games', 'progress'] as const;

function normalise(dto: KidProgressDto): KidProgress {
  return {
    ready: true,
    xp: dto.profile.totalXp,
    games: Object.fromEntries(dto.games.map((g) => [g.gameId, g])),
    days: dto.profile.days,
    achievements: Object.fromEntries(dto.profile.achievements.map((a) => [a.id, a.unlockedAt])),
    dailyStreak: dto.profile.dailyStreak,
    gameStreak: dto.profile.gameStreak,
    lastGameId: dto.profile.lastGameId,
    settings: dto.profile.settings,
  };
}

/** The signed-in child's progress. Cached, so every Kid Games page shares one request. */
export function useKidProgress(): KidProgress & { isError: boolean; refetch: () => void } {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await kidGamesApi.progress()).data,
    staleTime: 30_000,
  });
  const { refetch } = query;
  const progress = useMemo(() => (query.data ? normalise(query.data) : EMPTY_PROGRESS), [query.data]);
  return useMemo(() => ({ ...progress, isError: query.isError, refetch: () => void refetch() }), [progress, query.isError, refetch]);
}

/** Saves a finished game; the cache is updated from the server's answer, never from a guess. */
export function useSubmitResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: KidResultInput) => (await kidGamesApi.submit(input)).data,
    onSuccess: (data) => {
      queryClient.setQueryData<KidProgressDto>(QUERY_KEY, (old) => ({
        profile: data.profile,
        games: [...(old?.games ?? []).filter((g) => g.gameId !== data.game.gameId), data.game],
      }));
    },
  });
}

/** The sound switch, remembered per account: applied at once, saved in the background. */
export function useSoundSetting(): [boolean, (on: boolean) => void] {
  const queryClient = useQueryClient();
  const { settings } = useKidProgress();
  const { mutate } = useMutation({ mutationFn: (on: boolean) => kidGamesApi.settings(on) });
  const set = useCallback(
    (on: boolean) => {
      queryClient.setQueryData<KidProgressDto>(QUERY_KEY, (old) => (old ? { ...old, profile: { ...old.profile, settings: { sound: on } } } : old));
      mutate(on);
    },
    [queryClient, mutate],
  );
  return [settings.sound, set];
}

// ---------------------------------------------------------------------------------------------
// Achievements: the server decides when they unlock; these are their names and icons.
// ---------------------------------------------------------------------------------------------

export interface AchievementInfo {
  id: AchievementId;
  icon: LucideIcon;
  title: string;
  description: string;
}

export const ACHIEVEMENTS: readonly AchievementInfo[] = [
  { id: 'first-game', icon: Star, title: 'First Game', description: 'Complete your first game' },
  { id: 'five-games', icon: Award, title: '5 Games Completed', description: 'Complete 5 games' },
  { id: 'ten-games', icon: Trophy, title: '10 Games Completed', description: 'Complete 10 games' },
  { id: 'streak-3', icon: Flame, title: '3 Day Streak', description: 'Play on 3 days in a row' },
  { id: 'streak-7', icon: CalendarCheck, title: '7 Day Streak', description: 'Play on 7 days in a row' },
  { id: 'xp-500', icon: Sparkles, title: '500 XP', description: 'Earn 500 XP' },
  { id: 'xp-1000', icon: Medal, title: '1000 XP', description: 'Earn 1000 XP' },
  { id: 'subject-master', icon: GraduationCap, title: 'Subject Master', description: 'Complete all 10 games of a subject' },
  { id: 'class-champion', icon: Crown, title: 'Class Champion', description: 'Complete all 30 games of a class' },
];

export function achievementInfo(id: AchievementId): AchievementInfo | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

// ---------------------------------------------------------------------------------------------
// Dates (the child's own day)
// ---------------------------------------------------------------------------------------------

export function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** The streak as it stands today: it lasts until the end of the day after the last game. */
export function currentStreak(progress: Pick<KidProgress, 'dailyStreak'>, today = new Date()): number {
  const { current, lastDay } = progress.dailyStreak;
  if (!lastDay) return 0;
  return lastDay === dayKey(today) || lastDay === dayKey(addDays(today, -1)) ? current : 0;
}

/** Mon–Sun of the current week, with whether each day had a game. */
export function weekStrip(progress: Pick<KidProgress, 'days'>, today = new Date()) {
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const todayKey = dayKey(today);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => {
    const key = dayKey(addDays(monday, i));
    return { label, key, done: Boolean(progress.days[key]), isToday: key === todayKey, isFuture: key > todayKey };
  });
}

// ---------------------------------------------------------------------------------------------
// Figures for display (the server's numbers are the ones saved)
// ---------------------------------------------------------------------------------------------

export { levelFor, starsFor, type LevelInfo } from './progress-rules';

export interface ProgressSummary {
  completed: number;
  total: number;
  percent: number;
  stars: number;
  maxStars: number;
  xp: number;
  /** Highest best score (0–100) in the set, or null if nothing has been played. */
  bestScore: number | null;
}

export function summarise(progress: Pick<KidProgress, 'games'>, classLevel?: ClassLevel, subject?: Subject): ProgressSummary {
  const games = ALL_GAMES.filter((g) => (!classLevel || g.classLevel === classLevel) && (!subject || g.subject === subject));
  let completed = 0;
  let stars = 0;
  let xp = 0;
  let bestScore: number | null = null;
  for (const game of games) {
    const record = progress.games[game.id];
    if (!record) continue;
    if (record.completed) completed += 1;
    stars += record.stars;
    xp += record.xpEarned;
    bestScore = Math.max(bestScore ?? 0, record.bestScore);
  }
  return {
    completed,
    total: games.length,
    percent: games.length ? Math.round((completed / games.length) * 100) : 0,
    stars,
    maxStars: games.length * 3,
    xp,
    bestScore,
  };
}

/** The class the child is working in: the one they last played, else Class 1. */
export function activeClass(progress: Pick<KidProgress, 'lastGameId'>): ClassLevel {
  const last = progress.lastGameId ? findLearningGame(progress.lastGameId) : undefined;
  return last?.classLevel ?? 1;
}

/** Recently played games without full marks yet, newest first. */
export function continueList(progress: Pick<KidProgress, 'games'>, count = 4): LearningGame[] {
  return Object.values(progress.games)
    .filter((r) => r.stars < 3)
    .sort((a, b) => String(b.lastPlayed).localeCompare(String(a.lastPlayed)))
    .map((r) => findLearningGame(r.gameId))
    .filter((g): g is LearningGame => Boolean(g))
    .slice(0, count);
}

/** What to play next: the first unfinished game of each subject in the active class. */
export function recommendations(progress: Pick<KidProgress, 'games' | 'lastGameId'>, count = 3): LearningGame[] {
  const classLevel = activeClass(progress);
  const last = progress.lastGameId ? findLearningGame(progress.lastGameId) : undefined;
  const order: Subject[] = last ? [last.subject, ...(['hindi', 'english', 'math'] as Subject[]).filter((s) => s !== last.subject)] : ['hindi', 'english', 'math'];
  const picks: LearningGame[] = [];
  for (const subject of order) {
    const next = ALL_GAMES.find((g) => g.classLevel === classLevel && g.subject === subject && !progress.games[g.id]?.completed && g.id !== last?.id);
    if (next) picks.push(next);
  }
  if (picks.length < count) {
    const weakest = ALL_GAMES.filter((g) => g.classLevel === classLevel && !picks.includes(g)).sort(
      (a, b) => (progress.games[a.id]?.stars ?? 0) - (progress.games[b.id]?.stars ?? 0),
    );
    picks.push(...weakest.slice(0, count - picks.length));
  }
  return picks.slice(0, count);
}

/** The first unfinished game of a subject in a class: where "Continue" goes. */
export function nextInSubject(progress: Pick<KidProgress, 'games'>, classLevel: ClassLevel, subject: Subject): LearningGame {
  const games = ALL_GAMES.filter((g) => g.classLevel === classLevel && g.subject === subject);
  return games.find((g) => !progress.games[g.id]?.completed) ?? games[0];
}

// ---------------------------------------------------------------------------------------------
// An unfinished game, kept on this device so it can be resumed (one per account)
// ---------------------------------------------------------------------------------------------

export const SESSION_VERSION = 2;

export interface SavedSession {
  version: number;
  gameId: string;
  questions: PreparedQuestion[];
  index: number;
  /** Items right first time so far. */
  correct: number;
  streak: number;
  bestStreak: number;
  lives: number;
  elapsedMs: number;
  savedAt: string;
}

function sessionKey(userId: string) {
  return `media-tool:kid-games:session:${userId}`;
}

const sessionListeners = new Set<() => void>();
function emitSession() {
  for (const listener of sessionListeners) listener();
}

function readRaw(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(sessionKey(userId));
  } catch {
    return null;
  }
}

function parse(raw: string | null): SavedSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedSession;
    if (parsed?.version !== SESSION_VERSION || !findLearningGame(parsed.gameId) || !Array.isArray(parsed.questions)) return null;
    if (parsed.index < 0 || parsed.index >= parsed.questions.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadSession(userId: string | undefined, gameId: string): SavedSession | null {
  const session = parse(readRaw(userId));
  return session && session.gameId === gameId ? session : null;
}

export function saveSession(userId: string | undefined, session: Omit<SavedSession, 'version' | 'savedAt'>) {
  if (!userId) return;
  try {
    localStorage.setItem(sessionKey(userId), JSON.stringify({ ...session, version: SESSION_VERSION, savedAt: new Date().toISOString() }));
  } catch {
    // Resuming is a convenience; without storage the game simply starts again.
  }
  emitSession();
}

export function clearSession(userId: string | undefined, gameId?: string) {
  if (!userId) return;
  try {
    const current = parse(readRaw(userId));
    if (gameId && current && current.gameId !== gameId) return;
    localStorage.removeItem(sessionKey(userId));
  } catch {
    // Nothing to clear.
  }
  emitSession();
}

function subscribeSession(listener: () => void) {
  sessionListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    sessionListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** The unfinished game on this device for the signed-in account, kept live. */
export function useSavedSession(): SavedSession | null {
  const { user } = useAuth();
  const userId = user?.id;
  const raw = useSyncExternalStore(subscribeSession, () => readRaw(userId), () => null);
  return useMemo(() => parse(raw), [raw]);
}
