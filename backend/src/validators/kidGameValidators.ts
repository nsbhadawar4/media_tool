import { z } from 'zod';

/**
 * What a finished game reports. The browser says how many answers were right; the score, XP,
 * stars and streaks are all worked out on the server. There is deliberately no userId here —
 * whose progress it is comes from the session alone.
 */
export const kidGameResultSchema = z
  .object({
    gameId: z.string().trim().regex(/^c[1-5]-(hindi|english|math)-[a-z-]{2,40}$/, 'Unknown game'),
    correct: z.number().int().min(0).max(100),
    total: z.number().int().min(1).max(100),
    bestStreak: z.number().int().min(0).max(100).optional().default(0),
    seconds: z.number().int().min(0).max(6 * 60 * 60).optional().default(0),
    /** The child's local date (YYYY-MM-DD), used for streaks if it is within a day of the server's. */
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((r) => r.correct <= r.total, { message: 'correct cannot exceed total', path: ['correct'] })
  .refine((r) => r.bestStreak <= r.total, { message: 'bestStreak cannot exceed total', path: ['bestStreak'] });

export type KidGameResultInput = z.infer<typeof kidGameResultSchema>;

export const kidGameSettingsSchema = z.object({ sound: z.boolean() }).strict();
