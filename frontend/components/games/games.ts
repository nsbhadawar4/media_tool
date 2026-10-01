import { Brain, Crosshair, Droplets, Grid3x3, Zap, type LucideIcon } from 'lucide-react';

export type GameCategory = 'Multiplayer' | 'Puzzle' | 'Skill' | 'Arcade';
export type GameDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface GameMeta {
  slug: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: GameCategory;
  difficulty: GameDifficulty;
  /** Rough length of one round, shown on the card. */
  playTime: string;
  /** Two colours for the card artwork. */
  colors: [string, string];
  instructions: string[];
}

/** The catalogue. Everything here runs in the browser; nothing is stored or sent anywhere. */
export const GAMES: readonly GameMeta[] = [
  {
    slug: 'water-race',
    name: 'Water Race',
    description: 'Team water collection challenge',
    icon: Droplets,
    category: 'Multiplayer',
    difficulty: 'Easy',
    playTime: '1–2 min',
    colors: ['#38bdf8', '#6366f1'],
    instructions: [
      'Two teams race to fill their tank within 60 seconds.',
      'Tap “Collect water” to fill your bucket with four scoops.',
      'When the bucket is full, tap “Pour” to empty it into your tank.',
      'Play against the bot, or share the screen with a friend. First tank to 100% wins, otherwise the fuller tank wins at time-up.',
    ],
  },
  {
    slug: 'memory-match',
    name: 'Memory Match',
    description: 'Flip cards and find every pair',
    icon: Brain,
    category: 'Puzzle',
    difficulty: 'Medium',
    playTime: '2–3 min',
    colors: ['#a855f7', '#ec4899'],
    instructions: [
      'All cards start face down. Tap a card to flip it.',
      'Flip two cards: if they match, they stay open.',
      'If they differ, they flip back — remember where they were.',
      'Find all 8 pairs in as few moves as you can.',
    ],
  },
  {
    slug: 'reaction-test',
    name: 'Reaction Test',
    description: 'How fast can you react?',
    icon: Zap,
    category: 'Skill',
    difficulty: 'Easy',
    playTime: '1 min',
    colors: ['#f59e0b', '#ef4444'],
    instructions: [
      'Press Start, then wait for the pad to turn green.',
      'The moment it says CLICK!, tap it as fast as you can.',
      'Tapping too early counts as a false start.',
      'Your best time is kept for this session.',
    ],
  },
  {
    slug: 'target-click',
    name: 'Target Click',
    description: 'Hit the targets before time runs out',
    icon: Crosshair,
    category: 'Arcade',
    difficulty: 'Medium',
    playTime: '30 sec',
    colors: ['#22c55e', '#06b6d4'],
    instructions: [
      'You have 30 seconds.',
      'Tap or click each target as soon as it appears.',
      'Targets move on their own if you are too slow and shrink as time runs down.',
      'Missed taps lower your accuracy.',
    ],
  },
  {
    slug: 'number-puzzle',
    name: 'Number Puzzle',
    description: 'Slide the tiles into order',
    icon: Grid3x3,
    category: 'Puzzle',
    difficulty: 'Hard',
    playTime: '3–5 min',
    colors: ['#7c5cff', '#22d3ee'],
    instructions: [
      'Tap a tile next to the empty square to slide it across.',
      'On a keyboard, use the arrow keys.',
      'Put the numbers in order, 1 to 8, with the empty square last.',
      'Reset restarts this puzzle; New game shuffles a fresh one.',
    ],
  },
];

export const GAME_CATEGORIES: readonly ('All' | GameCategory)[] = ['All', 'Arcade', 'Puzzle', 'Skill', 'Multiplayer'];

export function findGame(slug: string): GameMeta | undefined {
  return GAMES.find((game) => game.slug === slug);
}

/** m:ss for a number of seconds. */
export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
