import {
  Apple,
  ArrowDownAZ,
  Blocks,
  BookA,
  BookOpen,
  Calculator,
  CircleCheck,
  CircleHelp,
  Divide,
  Footprints,
  Image,
  Languages,
  Layers,
  LibraryBig,
  Link,
  ListOrdered,
  Map as MapIcon,
  Medal,
  MessageSquare,
  Minus,
  PartyPopper,
  Pencil,
  Plus,
  Puzzle,
  Rocket,
  Scale,
  Shapes,
  Sparkles,
  SpellCheck,
  Trophy,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ClassLevel, ClassTitles, Difficulty, GameTemplate, LearningGame, Subject, SubjectContent } from './types';
import hindiTitles from '../../data/kid-games/titles/hindi';
import englishTitles from '../../data/kid-games/titles/english';
import mathTitles from '../../data/kid-games/titles/math';

/**
 * The catalogue: 5 classes × 3 subjects × 10 game types = 150 games, built from templates.
 * It holds no questions, so the hub can search all 150 without loading any content; a game's
 * questions are fetched only when it is opened (see loadSubjectContent).
 */

export const CLASS_LEVELS: readonly ClassLevel[] = [1, 2, 3, 4, 5];
export const SUBJECTS: readonly Subject[] = ['hindi', 'english', 'math'];

export interface SubjectInfo {
  id: Subject;
  name: string;
  /** The subject in its own script, for the card. */
  native: string;
  /** Large glyphs on the subject card. */
  glyph: string;
  icon: LucideIcon;
}

export const SUBJECT_INFO: Record<Subject, SubjectInfo> = {
  hindi: { id: 'hindi', name: 'Hindi', native: 'हिंदी', glyph: 'अ आ', icon: Languages },
  english: { id: 'english', name: 'English', native: 'English', glyph: 'A B C', icon: BookA },
  math: { id: 'math', name: 'Mathematics', native: 'Maths', glyph: '1 2 3', icon: Calculator },
};

export interface ClassInfo {
  level: ClassLevel;
  slug: string;
  icon: LucideIcon;
  tagline: string;
  /** What each subject covers in this class, shown on the class page. */
  focus: Record<Subject, string>;
}

export const CLASS_INFO: Record<ClassLevel, ClassInfo> = {
  1: {
    level: 1,
    slug: 'class-1',
    icon: Sparkles,
    tagline: 'Learn the basics',
    focus: {
      hindi: 'स्वर, व्यंजन, सरल मात्राएँ और छोटे शब्द',
      english: 'A–Z, phonics, colours, animals and first words',
      math: 'Counting, numbers, adding and taking away',
    },
  },
  2: {
    level: 2,
    slug: 'class-2',
    icon: PartyPopper,
    tagline: 'Play and learn',
    focus: {
      hindi: 'मात्राएँ, सरल शब्द और छोटे वाक्य',
      english: 'Simple sentences, spelling, nouns and verbs',
      math: 'Two-digit sums, tables, place value, time and money',
    },
  },
  3: {
    level: 3,
    slug: 'class-3',
    icon: Rocket,
    tagline: 'Ready for a challenge',
    focus: {
      hindi: 'विलोम, पर्यायवाची, संज्ञा और सर्वनाम',
      english: 'Grammar basics, adjectives and short passages',
      math: 'Multiplication, division, fractions and measurement',
    },
  },
  4: {
    level: 4,
    slug: 'class-4',
    icon: Puzzle,
    tagline: 'Solve problems',
    focus: {
      hindi: 'विशेषण, क्रिया, वाक्य सुधार और पठन',
      english: 'Tenses, parts of speech and comprehension',
      math: 'Large numbers, fractions, decimals and word problems',
    },
  },
  5: {
    level: 5,
    slug: 'class-5',
    icon: Trophy,
    tagline: 'Master the challenge',
    focus: {
      hindi: 'काल, वाक्य संरचना, मुहावरे और शुद्ध वाक्य',
      english: 'Tenses, agreement and reading comprehension',
      math: 'Fractions, decimals, percentages and reasoning',
    },
  },
};

export function classFromSlug(slug: string): ClassLevel | null {
  const match = /^class-([1-5])$/.exec(slug);
  return match ? (Number(match[1]) as ClassLevel) : null;
}

export function isSubject(value: string): value is Subject {
  return (SUBJECTS as readonly string[]).includes(value);
}

/** The ten game types per subject. Every class plays all ten, each with its own content. */
export const TEMPLATES: Record<Subject, readonly GameTemplate[]> = {
  hindi: [
    { slot: 'varn-pehchan', title: 'वर्ण पहचान', gloss: 'Letter sort', engine: 'drag-drop', icon: Type, description: 'वर्णों और शब्दों को सही समूह में रखो।' },
    { slot: 'matra-milao', title: 'मात्रा मिलाओ', gloss: 'Match the matra', engine: 'matching', icon: Link, description: 'हर शब्द को उसकी सही जोड़ी से मिलाओ।' },
    { slot: 'shabd-banao', title: 'शब्द बनाओ', gloss: 'Build a word', engine: 'word-builder', icon: Blocks, description: 'अक्षर जोड़कर सही शब्द बनाओ।' },
    { slot: 'chitra-shabd', title: 'चित्र देखकर शब्द चुनो', gloss: 'Picture word', engine: 'image-choice', icon: Image, description: 'चित्र देखो और उसका सही नाम चुनो।' },
    { slot: 'sahi-shabd', title: 'सही शब्द चुनो', gloss: 'Choose the right word', engine: 'multiple-choice', icon: CircleCheck, description: 'सही वर्तनी और सही अर्थ वाला शब्द चुनो।', reading: true },
    { slot: 'akshar-kram', title: 'अक्षर क्रम लगाओ', gloss: 'Put in order', engine: 'ordering', icon: ListOrdered, description: 'अक्षरों और शब्दों को सही क्रम में लगाओ।' },
    { slot: 'shabd-milan', title: 'शब्द मिलान', gloss: 'Word memory', engine: 'memory', icon: Layers, description: 'पत्ते पलटो और सही जोड़ियाँ ढूँढो।' },
    { slot: 'rikt-sthan', title: 'रिक्त स्थान भरो', gloss: 'Fill in the blank', engine: 'fill-blank', icon: Pencil, description: 'खाली जगह में सही शब्द भरो।', reading: true },
    { slot: 'vakya-poora', title: 'वाक्य पूरा करो', gloss: 'Complete the sentence', engine: 'multiple-choice', icon: MessageSquare, description: 'पढ़ो, समझो और वाक्य पूरा करो।', reading: true },
    { slot: 'hindi-quiz', title: 'हिंदी क्विज़', gloss: 'Hindi quiz', engine: 'timed-quiz', icon: Medal, description: 'जो सीखा, उसका मज़ेदार क्विज़।', reading: true },
  ],
  english: [
    { slot: 'alphabet-adventure', title: 'Alphabet Adventure', engine: 'ordering', icon: ArrowDownAZ, description: 'Put letters and words in ABC order.' },
    { slot: 'word-match', title: 'Word Match', engine: 'matching', icon: Link, description: 'Connect each word with its partner.' },
    { slot: 'picture-word-match', title: 'Picture Word Match', engine: 'memory', icon: Layers, description: 'Flip the cards and match pictures with words.' },
    { slot: 'spell-it', title: 'Spell It', engine: 'image-choice', icon: SpellCheck, description: 'Look at the picture and pick the right spelling.' },
    { slot: 'missing-letter', title: 'Missing Letter', engine: 'fill-blank', icon: Puzzle, description: 'Find the letter or word that fills the gap.' },
    { slot: 'sentence-builder', title: 'Sentence Builder', engine: 'word-builder', icon: Blocks, description: 'Put the words together to make a sentence.', reading: true },
    { slot: 'grammar-quest', title: 'Grammar Quest', engine: 'drag-drop', icon: MapIcon, description: 'Sort words into the right groups.' },
    { slot: 'vocabulary-challenge', title: 'Vocabulary Challenge', engine: 'multiple-choice', icon: BookOpen, description: 'Meanings, opposites and words that go together.' },
    { slot: 'reading-challenge', title: 'Reading Challenge', engine: 'multiple-choice', icon: LibraryBig, description: 'Read a short passage and answer the question.', reading: true },
    { slot: 'english-quiz', title: 'English Quiz', engine: 'timed-quiz', icon: Medal, description: 'A fun mixed quiz on everything you learnt.', reading: true },
  ],
  math: [
    { slot: 'number-runner', title: 'Number Runner', engine: 'ordering', icon: Footprints, description: 'Line the numbers up from smallest to biggest.' },
    { slot: 'counting-challenge', title: 'Counting Challenge', engine: 'number-pad', icon: Apple, description: 'Count, skip-count and type the answer.' },
    { slot: 'addition-adventure', title: 'Addition Adventure', engine: 'multiple-choice', icon: Plus, description: 'Practise addition through a fun challenge.' },
    { slot: 'subtraction-challenge', title: 'Subtraction Challenge', engine: 'number-pad', icon: Minus, description: 'Take away and type how many are left.' },
    { slot: 'multiplication-quest', title: 'Multiplication Quest', engine: 'multiple-choice', icon: X, description: 'Groups, tables and times facts.' },
    { slot: 'division-challenge', title: 'Division Challenge', engine: 'matching', icon: Divide, description: 'Share equally and match each sum to its answer.' },
    { slot: 'number-comparison', title: 'Number Comparison', engine: 'drag-drop', icon: Scale, description: 'Sort numbers into bigger and smaller groups.' },
    { slot: 'missing-number', title: 'Missing Number', engine: 'number-pad', icon: CircleHelp, description: 'Find the number that makes it true.' },
    { slot: 'pattern-puzzle', title: 'Pattern Puzzle', engine: 'multiple-choice', icon: Shapes, description: 'Spot the rule and find what comes next.' },
    { slot: 'math-quiz', title: 'Math Quiz', engine: 'timed-quiz', icon: Medal, description: 'Mixed problems, shapes, time, money and more.' },
  ],
};

/**
 * Every class and subject has the same shape: four easy games, four medium, two hard. Difficulty
 * is relative to the class (a Class 5 "easy" game is still Class 5 work), so each tab on a
 * subject page always has games in it. The order of TEMPLATES puts the gentler mechanics first.
 * The backend keeps the same table (backend/src/kidGames/rules.ts); a test keeps them equal.
 */
export const DIFFICULTY_BY_INDEX: readonly Difficulty[] = ['easy', 'easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'medium', 'hard', 'hard'];

/** Per-class names: the same mechanic is "Addition Fun" in Class 1 and "Big Number Sums" in Class 4. */
const TITLES: Record<Subject, ClassTitles> = { hindi: hindiTitles, english: englishTitles, math: mathTitles };

export const XP_BY_DIFFICULTY: Record<Difficulty, number> = { easy: 50, medium: 75, hard: 100 };
export const PERFECT_BONUS_XP = 25;

export function gameId(classLevel: ClassLevel, subject: Subject, slot: string): string {
  return `c${classLevel}-${subject}-${slot}`;
}

export const ALL_GAMES: readonly LearningGame[] = CLASS_LEVELS.flatMap((classLevel) =>
  SUBJECTS.flatMap((subject) =>
    TEMPLATES[subject].map((template, index): LearningGame => {
      const difficulty = DIFFICULTY_BY_INDEX[index];
      return {
        ...template,
        ...TITLES[subject][classLevel][template.slot],
        id: gameId(classLevel, subject, template.slot),
        subject,
        classLevel,
        difficulty,
        xp: XP_BY_DIFFICULTY[difficulty],
        index,
      };
    }),
  ),
);

const BY_ID = new Map(ALL_GAMES.map((game) => [game.id, game]));

export function findLearningGame(id: string): LearningGame | undefined {
  return BY_ID.get(id);
}

export function gamesFor(classLevel: ClassLevel, subject?: Subject): LearningGame[] {
  return ALL_GAMES.filter((game) => game.classLevel === classLevel && (!subject || game.subject === subject));
}

export function gameHref(game: Pick<LearningGame, 'classLevel' | 'subject' | 'slot'>): string {
  return `/kid-games/class-${game.classLevel}/${game.subject}/${game.slot}`;
}

/**
 * One chunk per class × subject. A game page loads exactly one content file, and the hub loads
 * none, so the 150 question pools never travel together.
 */
const CONTENT_LOADERS: Record<`${ClassLevel}-${Subject}`, () => Promise<{ default: SubjectContent }>> = {
  '1-hindi': () => import('../../data/kid-games/class1/hindi'),
  '1-english': () => import('../../data/kid-games/class1/english'),
  '1-math': () => import('../../data/kid-games/class1/math'),
  '2-hindi': () => import('../../data/kid-games/class2/hindi'),
  '2-english': () => import('../../data/kid-games/class2/english'),
  '2-math': () => import('../../data/kid-games/class2/math'),
  '3-hindi': () => import('../../data/kid-games/class3/hindi'),
  '3-english': () => import('../../data/kid-games/class3/english'),
  '3-math': () => import('../../data/kid-games/class3/math'),
  '4-hindi': () => import('../../data/kid-games/class4/hindi'),
  '4-english': () => import('../../data/kid-games/class4/english'),
  '4-math': () => import('../../data/kid-games/class4/math'),
  '5-hindi': () => import('../../data/kid-games/class5/hindi'),
  '5-english': () => import('../../data/kid-games/class5/english'),
  '5-math': () => import('../../data/kid-games/class5/math'),
};

export async function loadSubjectContent(classLevel: ClassLevel, subject: Subject): Promise<SubjectContent> {
  const mod = await CONTENT_LOADERS[`${classLevel}-${subject}`]();
  return mod.default;
}
