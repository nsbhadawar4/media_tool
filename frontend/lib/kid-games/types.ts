/**
 * The data model behind Kid Games (Learn & Play).
 *
 * 150 games are not 150 components: a game is a catalogue entry (who it is for and which engine
 * plays it) plus a pool of questions in a content file. The same ten engines render every class;
 * only the content changes. Nothing here imports React at runtime, so it is shared by the UI, the content
 * files and the tests.
 */

import type { LucideIcon } from 'lucide-react';

export type Subject = 'hindi' | 'english' | 'math';
export type ClassLevel = 1 | 2 | 3 | 4 | 5;
export type Difficulty = 'easy' | 'medium' | 'hard';

/** The ten reusable game mechanics. */
export type EngineType =
  | 'multiple-choice'
  | 'image-choice'
  | 'fill-blank'
  | 'matching'
  | 'ordering'
  | 'memory'
  | 'word-builder'
  | 'drag-drop'
  | 'number-pad'
  | 'timed-quiz';

/**
 * One question with a single right option. Played by multiple-choice, image-choice, fill-blank
 * and timed-quiz.
 */
export interface ChoiceQuestion {
  kind: 'choice';
  /** The instruction or question, e.g. "Which word starts with अ?". */
  prompt: string;
  /** Shown large above the options: an emoji picture, a letter, or an expression like "8 + 7". */
  visual?: string;
  /** A short reading passage for comprehension questions. */
  passage?: string;
  /** For fill-blank: the sentence with `___` where the answer goes. */
  sentence?: string;
  /** 2–4 options, one of which is exactly `answer`. Shuffled at play time. */
  options: string[];
  answer: string;
  /** One short, kind line shown after a miss (why the answer is right). */
  explain?: string;
}

/** Pairs to connect (matching) or to find face down (memory). 3–5 pairs; every side unique. */
export interface MatchQuestion {
  kind: 'match';
  prompt: string;
  pairs: [string, string][];
}

/** Items to put in order. `items` is the correct order; the engine shuffles it. 3–6 items. */
export interface OrderQuestion {
  kind: 'order';
  prompt: string;
  visual?: string;
  items: string[];
}

/**
 * Build a word from letters/syllables, or a sentence from words. `tiles` is the correct
 * sequence; `extra` are distractor tiles that are not used.
 */
export interface BuildQuestion {
  kind: 'build';
  prompt: string;
  visual?: string;
  tiles: string[];
  extra?: string[];
  /** '' joins letters into a word (default), ' ' joins words into a sentence. */
  joiner?: '' | ' ';
}

/** Drag (or tap) each item into its group. 2–3 buckets, 4–6 items. */
export interface SortQuestion {
  kind: 'sort';
  prompt: string;
  buckets: string[];
  items: { text: string; bucket: string }[];
}

/**
 * A typed numeric answer on the on-screen keypad. `answer` is a string so decimals ("2.5") and
 * fractions ("3/4") work; it is compared after trimming.
 */
export interface NumberQuestion {
  kind: 'number';
  prompt: string;
  visual?: string;
  answer: string;
  /** Shown after the input, e.g. "cm" or "₹". */
  unit?: string;
  explain?: string;
}

export type Question = ChoiceQuestion | MatchQuestion | OrderQuestion | BuildQuestion | SortQuestion | NumberQuestion;
export type QuestionKind = Question['kind'];

/** Which question kinds each engine can play. Checked by tests/kidGamesContent.test.ts. */
export const ENGINE_KINDS: Record<EngineType, readonly QuestionKind[]> = {
  'multiple-choice': ['choice'],
  'image-choice': ['choice'],
  'fill-blank': ['choice'],
  'timed-quiz': ['choice', 'number'],
  matching: ['match'],
  memory: ['match'],
  ordering: ['order'],
  'word-builder': ['build'],
  'drag-drop': ['sort'],
  'number-pad': ['number'],
};

/**
 * Safe arithmetic generators for maths games. Every answer is computed, never typed, so a
 * generated question cannot be wrong. Used alongside (or instead of) a static pool.
 */
export type MathGenerator =
  | { op: 'add' | 'sub'; min: number; max: number; /** Show apples instead of digits (class 1). */ visual?: boolean }
  | { op: 'mul'; tables: number[]; maxFactor: number; visual?: boolean }
  | { op: 'div'; divisors: number[]; maxQuotient: number }
  | { op: 'missing-add'; min: number; max: number }
  | { op: 'compare'; min: number; max: number }
  | { op: 'count'; min: number; max: number }
  | { op: 'skip-count'; steps: number[]; max: number }
  | { op: 'order'; min: number; max: number; count: number; descending?: boolean };

/** Everything a content file holds for one game. */
export interface GameContent {
  /** What this class practises in this game, shown on the intro screen ("स्वर और व्यंजन"). */
  learn: string;
  questions: Question[];
  /** Maths only: extra questions computed at play time. */
  generator?: MathGenerator;
}

/** A content file: one class × one subject, keyed by the game's slot. */
export type SubjectContent = Record<string, GameContent>;

/** One of the ten game types every class has for a subject. */
export interface GameTemplate {
  slot: string;
  title: string;
  /** English gloss for Hindi titles, used by search. */
  gloss?: string;
  engine: EngineType;
  /** Icon shown on the card. */
  icon: LucideIcon;
  description: string;
  /** Counts towards the Book Worm achievement. */
  reading?: boolean;
}

/** What a game is called in one class, and what it teaches there. */
export interface GameTitle {
  title: string;
  /** English gloss for Hindi titles, used by search. */
  gloss?: string;
  /** One short line: what the child practises. */
  description: string;
}

/** Per-class names for one subject's ten games, keyed by class then slot. */
export type ClassTitles = Record<ClassLevel, Record<string, GameTitle>>;

/** A playable game: template × class. */
export interface LearningGame extends GameTemplate {
  id: string;
  subject: Subject;
  classLevel: ClassLevel;
  difficulty: Difficulty;
  xp: number;
  /** Position within its subject, 0–9. */
  index: number;
}
