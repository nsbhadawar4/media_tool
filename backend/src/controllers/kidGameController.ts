import type { Request, Response } from 'express';
import { KidGameProfile, KidGameRecord, type IKidGameProfile, type IKidGameRecord } from '../models/KidGameProgress';
import { applyResult, emptyProfile, parseGameId, resolveDay, type GameRecordState, type ProfileState } from '../kidGames/rules';
import type { KidGameResultInput } from '../validators/kidGameValidators';
import { AppError } from '../utils/AppError';
import { isKidGamePlayable } from '../services/contentService';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';

/**
 * Kid Games progress for the signed-in user. Every read and write is keyed by req.user.id (set by
 * requireAuth from the verified session), so one account can never see or change another's.
 */

function toRecordState(doc: IKidGameRecord): GameRecordState {
  return {
    gameId: doc.gameId,
    classLevel: doc.classLevel,
    subject: doc.subject,
    bestScore: doc.bestScore,
    latestScore: doc.latestScore,
    attempts: doc.attempts,
    completed: doc.completed,
    completionCount: doc.completionCount,
    xpEarned: doc.xpEarned,
    bestScoreXp: doc.bestScoreXp,
    bestStreak: doc.bestStreak,
    stars: doc.stars,
    bestCorrect: doc.bestCorrect,
    bestTotal: doc.bestTotal,
    totalSeconds: doc.totalSeconds,
    perfectBonusAwarded: doc.perfectBonusAwarded,
    newBestBonusDay: doc.newBestBonusDay,
    lastPlayed: doc.lastPlayed,
  };
}

function toProfileState(doc: IKidGameProfile | null): ProfileState {
  if (!doc) return emptyProfile();
  return {
    totalXp: doc.totalXp,
    gameStreak: doc.gameStreak,
    dailyStreak: { current: doc.dailyStreak?.current ?? 0, best: doc.dailyStreak?.best ?? 0, lastDay: doc.dailyStreak?.lastDay ?? null },
    days: Object.fromEntries(
      [...(doc.days ?? new Map()).entries()].map(([day, t]) => [day, { hindi: t.hindi ?? 0, english: t.english ?? 0, math: t.math ?? 0 }]),
    ),
    achievements: (doc.achievements ?? []).map((a) => ({ id: a.id, unlockedAt: a.unlockedAt })),
    lastGameId: doc.lastGameId ?? null,
    sound: Boolean(doc.sound),
  };
}

/** What the browser sees: no internal bookkeeping fields, no ids. */
function publicRecord(record: GameRecordState) {
  return {
    gameId: record.gameId,
    classLevel: record.classLevel,
    subject: record.subject,
    bestScore: record.bestScore,
    latestScore: record.latestScore,
    attempts: record.attempts,
    completed: record.completed,
    completionCount: record.completionCount,
    xpEarned: record.xpEarned,
    bestStreak: record.bestStreak,
    stars: record.stars,
    bestCorrect: record.bestCorrect,
    bestTotal: record.bestTotal,
    totalSeconds: record.totalSeconds,
    lastPlayed: record.lastPlayed,
  };
}

function publicProfile(profile: ProfileState) {
  return {
    totalXp: profile.totalXp,
    gameStreak: profile.gameStreak,
    dailyStreak: profile.dailyStreak,
    days: profile.days,
    achievements: profile.achievements,
    lastGameId: profile.lastGameId,
    settings: { sound: profile.sound },
  };
}

async function loadAll(userId: string) {
  const [profileDoc, recordDocs] = await Promise.all([KidGameProfile.findOne({ userId }), KidGameRecord.find({ userId })]);
  const records = new Map(recordDocs.map((doc) => [doc.gameId, toRecordState(doc)]));
  return { profile: toProfileState(profileDoc), records };
}

export const getProgress = asyncHandler(async (req: Request, res: Response) => {
  const { profile, records } = await loadAll(req.user!.id);
  sendSuccess(res, { profile: publicProfile(profile), games: [...records.values()].map(publicRecord) });
});

export const postResult = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const input = req.body as KidGameResultInput;
  const game = parseGameId(input.gameId);
  if (!game) throw AppError.badRequest('Unknown game');
  // An administrator can switch a game (or its whole class or subject) off; results stop counting.
  if (!(await isKidGamePlayable(game.gameId, game.classLevel, game.subject))) {
    throw new AppError('This game isn’t available right now', 403, undefined, 'GAME_UNAVAILABLE');
  }

  const { profile, records } = await loadAll(userId);
  const outcome = applyResult(game, records, profile, input, resolveDay(input.day));

  await Promise.all([
    KidGameRecord.findOneAndUpdate({ userId, gameId: game.gameId }, { $set: { ...outcome.record, userId } }, { upsert: true, new: true, runValidators: true }),
    KidGameProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          totalXp: outcome.profile.totalXp,
          gameStreak: outcome.profile.gameStreak,
          dailyStreak: outcome.profile.dailyStreak,
          days: outcome.profile.days,
          achievements: outcome.profile.achievements,
          lastGameId: outcome.profile.lastGameId,
        },
      },
      { upsert: true, new: true, runValidators: true },
    ),
  ]);

  sendSuccess(res, { result: outcome.summary, game: publicRecord(outcome.record), profile: publicProfile(outcome.profile) }, 201);
});

export const putSettings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { sound } = req.body as { sound: boolean };
  const doc = await KidGameProfile.findOneAndUpdate({ userId }, { $set: { userId, sound } }, { upsert: true, new: true });
  sendSuccess(res, { settings: { sound: Boolean(doc?.sound) } });
});
