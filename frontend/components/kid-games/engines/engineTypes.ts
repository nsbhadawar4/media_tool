import type { ClassLevel, Question, Subject } from '@/lib/kid-games/types';

/**
 * The contract every engine follows. An engine owns the interaction for one question and reports
 * back; the player owns scoring, feedback banners, XP and moving on. That split is what lets ten
 * engines serve 150 games.
 */
export interface EngineProps<Q extends Question = Question> {
  question: Q;
  classLevel: ClassLevel;
  subject: Subject;
  /**
   * The question is finished. `points` (out of the question's worth) counts what was right first
   * time. `reveal` is the right answer, shown kindly when it was not reached.
   */
  onResult: (points: number, reveal?: string, explain?: string) => void;
  /** A wrong attempt the child can still put right ("Almost! Try once more."). */
  onRetry: () => void;
  /** One correct part of a bigger question: a pair matched, a word sorted. */
  onStep: () => void;
  /** Once the result is in, the board stays on screen but stops taking input. */
  done: boolean;
}

/** Two tries per answer: the first miss is a hint, the second shows the answer. */
export const MAX_TRIES = 2;
