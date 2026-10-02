import { formatClock } from '../games';
import { GameResult } from '../GameResult';
import { COLOR_HEX, COLOR_NAME } from './ludoLayout';
import type { PlayerColor } from './ludoTypes';

interface LudoWinnerProps {
  winner: PlayerColor;
  moves: number;
  captures: number;
  seconds: number;
  onPlayAgain: () => void;
  /** Online: the winner's display name (shown instead of the colour). */
  name?: string;
  playAgainLabel?: string;
}

/** The win modal: the shared result card, themed with the winner's colour. */
export function LudoWinner({ winner, moves, captures, seconds, onPlayAgain, name, playAgainLabel = 'Play Again' }: LudoWinnerProps) {
  return (
    <GameResult
      variant="win"
      accent={COLOR_HEX[winner]}
      title={name ? `🎉 ${name.toUpperCase()} WINS!` : `🎉 ${COLOR_NAME[winner].toUpperCase()} PLAYER WINS!`}
      subtitle="All 4 tokens reached home."
      stats={[
        { label: 'Moves', value: moves },
        { label: 'Captures', value: captures },
        { label: 'Time', value: formatClock(seconds) },
      ]}
      onPlayAgain={onPlayAgain}
      playAgainLabel={playAgainLabel}
    />
  );
}
