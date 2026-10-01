'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Cloud, Flame, Gem, Heart, Moon, RotateCcw, Rocket, Star, Sun, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useInterval } from '@/hooks/useInterval';
import { cn } from '@/utils/cn';
import { GameControls } from './GameControls';
import { GameLayout } from './GameLayout';
import { GameResult } from './GameResult';
import { findGame, formatClock } from './games';

interface Face {
  Icon: LucideIcon;
  color: string;
}

const FACES: Face[] = [
  { Icon: Rocket, color: '#38bdf8' },
  { Icon: Heart, color: '#f43f5e' },
  { Icon: Star, color: '#fbbf24' },
  { Icon: Moon, color: '#a78bfa' },
  { Icon: Sun, color: '#fb923c' },
  { Icon: Cloud, color: '#60a5fa' },
  { Icon: Flame, color: '#ef4444' },
  { Icon: Gem, color: '#34d399' },
];

interface CardState {
  /** Index into FACES. */
  face: number;
  isFlipped: boolean;
  isMatched: boolean;
}

/** The deck in a fixed order; shuffled after mount so server and client markup agree. */
const ORDERED_DECK: CardState[] = [...FACES, ...FACES].map((_, i) => ({
  face: i % FACES.length,
  isFlipped: false,
  isMatched: false,
}));

function shuffled(): CardState[] {
  const deck = ORDERED_DECK.map((card) => ({ ...card }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

export default function MemoryMatch() {
  const game = findGame('memory-match')!;
  const [cards, setCards] = useState<CardState[]>(ORDERED_DECK);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  // Blocks input while a mismatched pair is showing.
  const [isLocked, setIsLocked] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const pairsFound = cards.filter((c) => c.isMatched).length / 2;
  const isWon = pairsFound === FACES.length;

  useInterval(() => setSeconds((s) => s + 1), hasStarted && !isWon ? 1000 : null);

  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setCards(shuffled());
    setMoves(0);
    setSeconds(0);
    setHasStarted(false);
    setIsLocked(false);
  }, []);

  // Shuffled once on mount (not during render, which would not match the server markup).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reset();
    const pending = timers;
    return () => pending.current.forEach(clearTimeout);
  }, [reset]);

  const flip = (index: number) => {
    const card = cards[index]!;
    if (isLocked || card.isFlipped || card.isMatched || isWon) return;
    if (!hasStarted) setHasStarted(true);

    const open = cards.map((c, i) => (c.isFlipped && !c.isMatched ? i : -1)).filter((i) => i >= 0);
    const next = cards.map((c, i) => (i === index ? { ...c, isFlipped: true } : c));
    setCards(next);

    if (open.length === 1) {
      setMoves((m) => m + 1);
      const first = open[0]!;
      if (next[first]!.face === card.face) {
        // A match: mark both after a beat so the flip finishes first.
        timers.current.push(
          setTimeout(() => {
            setCards((prev) => prev.map((c, i) => (i === first || i === index ? { ...c, isMatched: true } : c)));
          }, 350),
        );
      } else {
        setIsLocked(true);
        timers.current.push(
          setTimeout(() => {
            setCards((prev) => prev.map((c, i) => (i === first || i === index ? { ...c, isFlipped: false } : c)));
            setIsLocked(false);
          }, 850),
        );
      }
    }
  };

  return (
    <GameLayout
      game={game}
      stats={[
        { label: 'Moves', value: moves },
        { label: 'Pairs found', value: `${pairsFound} / ${FACES.length}`, tone: 'accent' },
        { label: 'Time', value: formatClock(seconds) },
        { label: 'Status', value: isWon ? 'Done' : hasStarted ? 'Playing' : 'Ready', tone: isWon ? 'success' : 'default' },
      ]}
      controls={
        <GameControls>
          <Button variant="secondary" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            {hasStarted ? 'Restart' : 'Shuffle'}
          </Button>
        </GameControls>
      }
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2.5 sm:gap-3">
        {cards.map((card, index) => {
          const { Icon, color } = FACES[card.face]!;
          const isOpen = card.isFlipped || card.isMatched;
          return (
            <button
              key={index}
              type="button"
              onClick={() => flip(index)}
              aria-label={isOpen ? `Card ${index + 1}, shown` : `Card ${index + 1}, face down`}
              aria-pressed={isOpen}
              className="flip-scene block aspect-square w-full rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="flip-inner" data-flipped={isOpen}>
                {/* Back: the pattern a face-down card shows. */}
                <span className="flip-face flex items-center justify-center rounded-2xl border border-border-strong bg-linear-to-br from-accent/30 to-accent/5 shadow-card transition-colors hover:from-accent/45">
                  <span className="h-1/3 w-1/3 rounded-lg border border-accent/40 bg-accent/10" />
                </span>
                {/* Front: the picture. */}
                <span
                  className={cn(
                    'flip-face flip-front flex items-center justify-center rounded-2xl border bg-surface-elevated',
                    card.isMatched ? 'anim-match border-success/50' : 'border-border-strong',
                  )}
                  style={card.isMatched ? { boxShadow: '0 0 24px -8px #22c55e' } : undefined}
                >
                  <Icon className="h-1/2 w-1/2" style={{ color }} strokeWidth={1.8} />
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {isWon && (
        <GameResult
          title="You Won!"
          subtitle="Every pair found."
          stats={[
            { label: 'Moves', value: moves },
            { label: 'Time', value: formatClock(seconds) },
          ]}
          onPlayAgain={reset}
        />
      )}
    </GameLayout>
  );
}
