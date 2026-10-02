import { Brain, Crosshair, Dices, Droplets, Grid3x3, Worm, Zap, type LucideIcon } from 'lucide-react';

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
    description: 'Fill your tank before the other team does',
    icon: Droplets,
    category: 'Multiplayer',
    difficulty: 'Easy',
    playTime: '1 min',
    colors: ['#38bdf8', '#6366f1'],
    instructions: [
      'Two teams race to fill their tank in 60 seconds. Play the bot or a friend on the same screen.',
      'Dip your bucket in the well to scoop water, carry it across, then pour it into your tank.',
      'Keep a rhythm: quick consecutive deliveries build a combo that adds bonus water.',
      'Player 1 uses W (scoop), A / D (move) and S (pour). Player 2 uses the arrow keys. On a phone each team has its own touch pad.',
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
    description: 'Three ways to test your reflexes',
    icon: Zap,
    category: 'Skill',
    difficulty: 'Medium',
    playTime: '1–2 min',
    colors: ['#f59e0b', '#ef4444'],
    instructions: [
      'Classic: wait for the pad to turn green, then tap as fast as you can.',
      'Five Round Challenge: five reactions, scored by average, fastest, slowest and consistency.',
      'Speed Mode: the green window shrinks every round. Miss it or tap early and the run ends.',
      'Tap the pad, click it, or press Space / Enter. Tapping before green is a false start.',
    ],
  },
  {
    slug: 'target-click',
    name: 'Target Click',
    description: 'Arcade aim challenge with combos',
    icon: Crosshair,
    category: 'Arcade',
    difficulty: 'Medium',
    playTime: '30 sec',
    colors: ['#22c55e', '#06b6d4'],
    instructions: [
      'Classic: 30 seconds, targets of every size. Smaller targets are worth more.',
      'Time Attack: targets get smaller and vanish faster the longer you survive.',
      'Precision: targets stay small and a miss costs you a life.',
      'Chain hits for a combo multiplier. Any miss resets it.',
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
  {
    slug: 'snake',
    name: 'Snake',
    description: 'Eat, grow and outlast the walls',
    icon: Worm,
    category: 'Arcade',
    difficulty: 'Medium',
    playTime: '2–5 min',
    colors: ['#10b981', '#84cc16'],
    instructions: [
      'Steer the snake to the food. Every bite makes it longer and the game faster.',
      'Glowing bonus food is worth 30 points but disappears quickly.',
      'Hitting a wall or your own tail ends the run. Your best score is saved in this browser.',
      'Arrow keys or WASD, swipe on the board, or use the on-screen D-pad. Space pauses.',
    ],
  },
  {
    slug: 'ludo',
    name: 'Ludo',
    description: 'Classic Multiplayer Board Game · 2–4 Players',
    icon: Dices,
    category: 'Multiplayer',
    difficulty: 'Medium',
    playTime: '10–20 min',
    colors: ['#ef4444', '#3b82f6'],
    instructions: [
      'Choose 2–4 players, local multiplayer or against Easy, Medium or Hard bots.',
      'Roll the dice. A 6 brings a token out of base, and a 6 earns another roll.',
      'Tap a glowing token to move it. Landing on a lone opponent sends it back to base, except on star and start squares.',
      'Get all four tokens into the centre with an exact roll to win.',
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
