'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useInterval } from '@/hooks/useInterval';
import { cn } from '@/utils/cn';
import { GameControls } from './GameControls';
import { GameLayout } from './GameLayout';
import { GameResult } from './GameResult';
import { findGame, formatClock } from './games';

const SIZE = 3;
/** Tile numbers by square, row by row; 0 is the empty square. */
const SOLVED = [1, 2, 3, 4, 5, 6, 7, 8, 0];

const isSolved = (board: number[]) => board.every((tile, i) => tile === SOLVED[i]);

/** Squares that share an edge with `index`. */
function neighbours(index: number): number[] {
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  const out: number[] = [];
  if (row > 0) out.push(index - SIZE);
  if (row < SIZE - 1) out.push(index + SIZE);
  if (col > 0) out.push(index - 1);
  if (col < SIZE - 1) out.push(index + 1);
  return out;
}

/**
 * A shuffled board, made by playing random legal moves backwards from the solved one. That
 * is what guarantees it is solvable — shuffling the numbers directly would produce an
 * unsolvable puzzle half of the time.
 */
function shuffledBoard(): number[] {
  let board = [...SOLVED];
  let blank = board.indexOf(0);
  let previous = -1;
  for (let i = 0; i < 160; i++) {
    const options = neighbours(blank).filter((n) => n !== previous);
    const pick = options[Math.floor(Math.random() * options.length)]!;
    board = board.map((tile, idx) => (idx === blank ? board[pick]! : idx === pick ? 0 : tile));
    previous = blank;
    blank = pick;
  }
  return isSolved(board) ? shuffledBoard() : board;
}

export default function NumberPuzzle() {
  const game = findGame('number-puzzle')!;
  const [board, setBoard] = useState<number[]>(SOLVED);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const initial = useRef<number[]>(SOLVED);

  const won = hasStarted && isSolved(board);
  useInterval(() => setSeconds((s) => s + 1), hasStarted && !won ? 1000 : null);

  const load = useCallback((next: number[]) => {
    setBoard(next);
    setMoves(0);
    setSeconds(0);
    setHasStarted(false);
  }, []);

  const newGame = useCallback(() => {
    const next = shuffledBoard();
    initial.current = next;
    load(next);
  }, [load]);

  // Shuffled once on mount rather than during render, so the first paint matches the server.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    newGame();
  }, [newGame]);

  const move = useCallback(
    (index: number) => {
      if (won) return;
      const blank = board.indexOf(0);
      if (!neighbours(blank).includes(index)) return;
      const next = [...board];
      next[blank] = board[index]!;
      next[index] = 0;
      setBoard(next);
      setMoves((m) => m + 1);
      setHasStarted(true);
    },
    [board, won],
  );

  // Arrow keys slide the tile that is on the opposite side of the empty square.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const blank = board.indexOf(0);
      const row = Math.floor(blank / SIZE);
      const col = blank % SIZE;
      const target =
        event.key === 'ArrowUp' && row < SIZE - 1
          ? blank + SIZE
          : event.key === 'ArrowDown' && row > 0
            ? blank - SIZE
            : event.key === 'ArrowLeft' && col < SIZE - 1
              ? blank + 1
              : event.key === 'ArrowRight' && col > 0
                ? blank - 1
                : -1;
      if (target >= 0) {
        event.preventDefault();
        move(target);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [board, move]);

  const inPlace = board.filter((tile, i) => tile !== 0 && tile === SOLVED[i]).length;
  const cell = 100 / SIZE;

  return (
    <GameLayout
      game={game}
      stats={[
        { label: 'Moves', value: moves },
        { label: 'Time', value: formatClock(seconds) },
        { label: 'In place', value: `${inPlace} / 8`, tone: 'accent' },
        { label: 'Status', value: won ? 'Solved' : hasStarted ? 'Playing' : 'Ready', tone: won ? 'success' : 'default' },
      ]}
      controls={
        <GameControls>
          <Button variant="secondary" onClick={() => load(initial.current)}>
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button onClick={newGame}>
            <Shuffle className="h-4 w-4" />
            New game
          </Button>
        </GameControls>
      }
    >
      <div className="relative mx-auto aspect-square w-full max-w-sm touch-manipulation rounded-2xl border border-border-strong bg-background/60 p-1.5">
        <div className="relative h-full w-full">
          {/* Tiles are rendered by number, not by square, so each one glides to its new place. */}
          {SOLVED.filter((n) => n !== 0).map((tile) => {
            const index = board.indexOf(tile);
            const canMove = neighbours(board.indexOf(0)).includes(index);
            const inPlaceNow = SOLVED[index] === tile;
            return (
              <button
                key={tile}
                type="button"
                onClick={() => move(index)}
                aria-label={`Tile ${tile}${canMove ? ', can move' : ''}`}
                className="puzzle-tile absolute p-1 focus-visible:outline-2 focus-visible:outline-accent"
                style={{
                  left: `${(index % SIZE) * cell}%`,
                  top: `${Math.floor(index / SIZE) * cell}%`,
                  width: `${cell}%`,
                  height: `${cell}%`,
                }}
              >
                <span
                  className={cn(
                    'flex h-full w-full items-center justify-center rounded-xl border text-3xl font-semibold tabular-nums shadow-card sm:text-4xl',
                    inPlaceNow
                      ? 'border-accent/50 bg-linear-to-br from-accent to-accent-2 text-accent-foreground'
                      : 'border-border-strong bg-surface-elevated text-foreground',
                    canMove && !inPlaceNow && 'hover:border-accent/60 hover:bg-surface-hover',
                  )}
                >
                  {tile}
                </span>
              </button>
            );
          })}
        </div>

        {won && (
          <GameResult
            title="Solved!"
            subtitle="Every tile is in place."
            stats={[
              { label: 'Moves', value: moves },
              { label: 'Time', value: formatClock(seconds) },
            ]}
            onPlayAgain={newGame}
            playAgainLabel="New game"
          />
        )}
      </div>
    </GameLayout>
  );
}
