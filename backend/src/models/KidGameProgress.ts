import { Schema, model, Types, type Document } from 'mongoose';
import { ACHIEVEMENT_IDS, KID_SUBJECTS, type AchievementId, type DayTally, type KidSubject } from '../kidGames/rules';

/**
 * Kid Games progress, stored per signed-in user.
 *
 * One record per user per game (best score, attempts, stars, XP that game has paid out) and one
 * profile per user (total XP, streaks, achievements, sound preference). Every query is filtered
 * by userId taken from the session — there is no route that accepts a user id from the client.
 */

export interface IKidGameRecord extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  gameId: string;
  classLevel: number;
  subject: KidSubject;
  bestScore: number;
  latestScore: number;
  attempts: number;
  completed: boolean;
  completionCount: number;
  xpEarned: number;
  bestScoreXp: number;
  bestStreak: number;
  stars: number;
  bestCorrect: number;
  bestTotal: number;
  totalSeconds: number;
  perfectBonusAwarded: boolean;
  newBestBonusDay: string | null;
  lastPlayed: Date;
}

const recordSchema = new Schema<IKidGameRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    gameId: { type: String, required: true },
    classLevel: { type: Number, required: true, min: 1, max: 5 },
    subject: { type: String, enum: KID_SUBJECTS, required: true },
    bestScore: { type: Number, default: 0, min: 0, max: 100 },
    latestScore: { type: Number, default: 0, min: 0, max: 100 },
    attempts: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    completionCount: { type: Number, default: 0 },
    xpEarned: { type: Number, default: 0 },
    bestScoreXp: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
    stars: { type: Number, default: 0, min: 0, max: 3 },
    bestCorrect: { type: Number, default: 0 },
    bestTotal: { type: Number, default: 0 },
    totalSeconds: { type: Number, default: 0 },
    perfectBonusAwarded: { type: Boolean, default: false },
    newBestBonusDay: { type: String, default: null },
    lastPlayed: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

recordSchema.index({ userId: 1, gameId: 1 }, { unique: true });

export const KidGameRecord = model<IKidGameRecord>('KidGameRecord', recordSchema);

export interface IKidGameProfile extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  totalXp: number;
  gameStreak: number;
  dailyStreak: { current: number; best: number; lastDay: string | null };
  days: Map<string, DayTally>;
  achievements: { id: AchievementId; unlockedAt: Date }[];
  lastGameId: string | null;
  sound: boolean;
}

const profileSchema = new Schema<IKidGameProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    totalXp: { type: Number, default: 0, min: 0 },
    gameStreak: { type: Number, default: 0 },
    dailyStreak: {
      current: { type: Number, default: 0 },
      best: { type: Number, default: 0 },
      lastDay: { type: String, default: null },
    },
    days: {
      type: Map,
      of: new Schema<DayTally>({ hindi: Number, english: Number, math: Number }, { _id: false }),
      default: {},
    },
    achievements: [
      new Schema({ id: { type: String, enum: ACHIEVEMENT_IDS, required: true }, unlockedAt: { type: Date, required: true } }, { _id: false }),
    ],
    lastGameId: { type: String, default: null },
    sound: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const KidGameProfile = model<IKidGameProfile>('KidGameProfile', profileSchema);
