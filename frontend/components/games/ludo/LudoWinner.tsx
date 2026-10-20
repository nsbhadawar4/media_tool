import { formatClock } from '../games';
import { GameResult } from '../GameResult';
import { COLOR_HEX, COLOR_NAME, PROGRESS_FINISHED } from './ludoLayout';
import type { GameState, PlayerColor } from './ludoTypes';

interface LudoWinnerProps {
  /** The finished game: its winner and finishing order are read from it. */
  state: GameState;
  /** How each player is named here: "You", "Red Bot", "Yellow Player", or an online name. */
  labelOf: (color: PlayerColor) => string;
  /** The winner is the person on this device ("Congratulations, you've won!"). */
  youWon: boolean;
  moves: number;
  captures: number;
  seconds: number;
  onPlayAgain: () => void;
  playAgainLabel?: string;
}

const PLACE = ['1st', '2nd', '3rd', '4th'];

/**
 * The end-of-game card: who won, and — with 3 or 4 players — everyone's finishing place. Shown once
 * per game (it is driven by the finished state itself), with Play Again and Exit Game.
 */
export function LudoWinner({ state, labelOf, youWon, moves, captures, seconds, onPlayAgain, playAgainLabel = 'Play Again' }: LudoWinnerProps) {
  const winner = state.winner!;
  const name = labelOf(winner);
  const hex = COLOR_HEX[winner];
  const homeOf = (c: PlayerColor) => state.players.find((p) => p.color === c)?.tokens.filter((t) => t.progress === PROGRESS_FINISHED).length ?? 0;
  const order = state.ranking.length ? state.ranking : [winner];

  return (
    <GameResult
      variant="win"
      accent={hex}
      title={youWon ? '🎉 Congratulations!' : 'Game Over'}
      subtitle={youWon ? (name === 'You' ? "You've won!" : `${name} has won!`) : `${name} has won the game!`}
      stats={[
        { label: 'Winner', value: name },
        { label: 'Result', value: '🏆 Winner' },
        { label: 'Tokens', value: '4 / 4 Home' },
        { label: 'Game', value: 'Ludo' },
      ]}
      onPlayAgain={onPlayAgain}
      playAgainLabel={playAgainLabel}
      exitLabel="Exit Game"
    >
      {order.length <= 2 && (
        <div className="mt-4 flex items-center justify-center gap-2.5" aria-hidden>
          <span className="h-9 w-9 rounded-full border-2 border-white/80" style={{ background: hex, boxShadow: `0 0 18px ${hex}` }} />
          <span className="text-sm font-semibold" style={{ color: hex }}>
            {COLOR_NAME[winner]}
          </span>
        </div>
      )}

      {order.length > 2 && (
        <ol aria-label="Finishing order" className="mt-4 space-y-1.5 text-left">
          {order.map((c, i) => (
            <li key={c} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              <span className="w-8 shrink-0 text-xs font-bold text-muted">{PLACE[i]}</span>
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLOR_HEX[c] }} />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {labelOf(c)}
                {i === 0 && ' 🏆'}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted">{homeOf(c)} / 4 Home</span>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-3 text-xs text-muted">
        {moves} moves · {captures} captures · {formatClock(seconds)}
      </p>
    </GameResult>
  );
}
