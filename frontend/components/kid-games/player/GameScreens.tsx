'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowRight, CloudOff, Flame, Heart, Loader2, Play, RefreshCw, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { SUBJECT_INFO } from '@/lib/kid-games/catalog';
import { gameHref } from '@/lib/kid-games/catalog';
import { formatClock } from '@/components/games/games';
import { achievementInfo, starsFor, type GameRecord, type GameResult, type SavedSession } from '@/lib/kid-games/progress';
import type { EngineType, LearningGame } from '@/lib/kid-games/types';
import { cn } from '@/utils/cn';
import { DIFFICULTY_DOT, DIFFICULTY_LABEL } from '../theme';
import { KidStars } from '../shared/KidUi';

/** One plain sentence on how each mechanic is played, shown before the first question. */
const HOW_TO_PLAY: Record<EngineType, string> = {
  'multiple-choice': 'Read the question and tap the right answer.',
  'image-choice': 'Look at the picture and tap the right answer.',
  'fill-blank': 'Tap the word that fills the gap.',
  'timed-quiz': 'Answer every question. You have 3 hearts, and the clock shows your time.',
  matching: 'Tap one card on the left, then its partner on the right.',
  memory: 'Flip two cards at a time and find all the pairs.',
  ordering: 'Tap the tiles in the right order.',
  'word-builder': 'Tap the tiles in order to build the answer.',
  'drag-drop': 'Drag each word into the right box (or tap a word, then a box).',
  'number-pad': 'Type your answer on the number keys and press CHECK.',
};

export const ROUND_ENGINES: readonly EngineType[] = ['matching', 'memory', 'drag-drop'];
/** The quiz is the one mode with lives: three hearts, and the game ends kindly when they run out. */
export const QUIZ_LIVES = 3;

export function GameIntro({
  game,
  learn,
  questionCount,
  record,
  saved,
  onStart,
  onResume,
}: {
  game: LearningGame;
  learn: string;
  questionCount: number;
  record?: GameRecord;
  saved: SavedSession | null;
  onStart: () => void;
  onResume: () => void;
}) {
  const lang = game.subject === 'hindi' ? 'hi' : 'en';
  const rows: { label: string; value: string; wide?: boolean }[] = [
    { label: 'You will learn', value: learn, wide: true },
    { label: ROUND_ENGINES.includes(game.engine) ? 'Rounds' : 'Questions', value: String(questionCount) },
    { label: 'Reward', value: `+${game.xp} XP` },
  ];

  return (
    <div className="kg-start flex flex-col items-center text-center">
      <span aria-hidden className="kg-gradient kg-pop relative mb-4 flex h-24 w-24 items-center justify-center rounded-[1.75rem] shadow-lift">
        <game.icon className="h-12 w-12 text-white" strokeWidth={1.75} />
        <Sparkles className="kg-bob absolute -right-2 -top-2 h-7 w-7 text-amber-400" />
      </span>
      <p className="kg-text flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em]">
        Class {game.classLevel} • {SUBJECT_INFO[game.subject].name}
        <span className="flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-[10px] tracking-wider text-foreground-soft">
          <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', DIFFICULTY_DOT[game.difficulty])} />
          {DIFFICULTY_LABEL[game.difficulty]}
        </span>
      </p>
      <h1 className="mt-1 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl" lang={lang}>
        {game.title}
      </h1>
      <p className="mt-2 max-w-md text-balance text-sm text-muted sm:text-base" lang={lang}>
        {game.description}
      </p>

      <dl className="mt-6 grid w-full max-w-md grid-cols-2 gap-2.5 text-left">
        {rows.map((row) => (
          <div key={row.label} className={cn('rounded-2xl border border-border bg-surface-elevated/80 px-4 py-3', row.wide && 'col-span-2')}>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{row.label}</dt>
            <dd className={cn('mt-0.5 text-base font-bold', row.label === 'Reward' ? 'text-amber-500' : 'text-foreground')} lang={row.wide ? lang : undefined}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {record && (
        <p className="mt-3 flex items-center gap-2 rounded-full bg-amber-400/12 px-3 py-1.5 text-sm font-semibold text-foreground">
          <Trophy aria-hidden className="h-4 w-4 text-amber-500" />
          Your best: {record.bestScore} points
          <KidStars value={record.stars} />
        </p>
      )}

      <p className="mt-4 flex max-w-md items-center gap-2 text-sm text-muted">
        {game.engine === 'timed-quiz' && (
          <span className="flex shrink-0 text-rose-500" aria-hidden>
            {Array.from({ length: QUIZ_LIVES }, (_, i) => (
              <Heart key={i} className="h-4 w-4 fill-current" />
            ))}
          </span>
        )}
        {HOW_TO_PLAY[game.engine]}
      </p>

      {saved ? (
        <div className="mt-6 w-full max-w-md space-y-3">
          <p className="kg-tint rounded-2xl px-4 py-3 text-sm font-medium text-foreground">
            You stopped at question {saved.index + 1} of {saved.questions.length}. Carry on from there?
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onResume} className="kg-btn inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl text-base font-bold tracking-wider">
              <Play className="h-5 w-5 fill-current" />
              CONTINUE
            </button>
            <button
              type="button"
              onClick={onStart}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-border-strong bg-surface-elevated text-sm font-bold tracking-wider text-foreground transition hover:bg-surface-hover active:scale-[0.97]"
            >
              <RotateCcw className="h-4 w-4" />
              START OVER
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={onStart} autoFocus className="kg-btn mt-6 inline-flex min-h-14 w-full max-w-md items-center justify-center gap-2 rounded-2xl text-lg font-bold tracking-wider">
          <Play className="h-5 w-5 fill-current" />
          START GAME
        </button>
      )}
    </div>
  );
}

/** A handful of soft confetti pieces; decorative and skipped entirely with reduced motion. */
function Confetti({ pieces = 18 }: { pieces?: number }) {
  const styles = Array.from({ length: pieces }, (_, i) => {
    const angle = (i / pieces) * Math.PI * 2;
    const distance = 90 + (i % 3) * 45;
    return {
      '--dx': `${Math.cos(angle) * distance}px`,
      '--dy': `${Math.sin(angle) * distance - 50}px`,
      left: '50%',
      top: '24%',
      background: ['#f59e0b', '#22c55e', '#3b82f6', '#ec4899', '#a855f7', '#f97316'][i % 6],
      borderRadius: i % 2 ? '9999px' : '2px',
      animationDelay: `${(i % 4) * 0.06}s`,
    } as CSSProperties;
  });
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
      {styles.map((style, i) => (
        <span key={i} className="kg-confetti" style={style} />
      ))}
    </div>
  );
}

function headline(score: number): string {
  if (score >= 90) return 'Amazing!';
  if (score >= 70) return 'Great Job!';
  if (score >= 50) return 'Well Done!';
  return 'Good Try!';
}

const XP_REASON: Record<GameResult['xpLines'][number]['reason'], string> = {
  score: 'Score',
  perfect: 'Perfect score bonus',
  'new-best': 'New personal best',
  'streak-3': '3 games in a row',
  'streak-5': '5 games in a row',
};

export type SaveState = { status: 'saving' } | { status: 'saved'; result: GameResult } | { status: 'error' };

/** What the child sees at the end: their own numbers straight away, and what was earned once saved. */
export function GameResults({
  game,
  local,
  save,
  nextGame,
  backHref,
  onPlayAgain,
  onRetrySave,
}: {
  game: LearningGame;
  /** Known before the server answers. */
  local: { correct: number; total: number; bestStreak: number; seconds: number; outOfLives: boolean };
  save: SaveState;
  nextGame: LearningGame | null;
  backHref: string;
  onPlayAgain: () => void;
  onRetrySave: () => void;
}) {
  const result = save.status === 'saved' ? save.result : null;
  const score = result?.score ?? Math.round((local.correct / Math.max(1, local.total)) * 100);
  const stars = result?.stars ?? starsFor(score);
  const tiles: { label: string; value: string; tone?: string }[] = [
    { label: 'Score', value: `${score} / 100` },
    { label: 'Correct', value: `${local.correct} / ${local.total}` },
    { label: 'XP', value: result ? `+${result.xpGained} XP` : '…', tone: 'text-amber-500' },
    { label: 'Time', value: formatClock(local.seconds) },
  ];

  return (
    <div className="kg-start relative flex flex-col items-center text-center">
      {score >= 50 && <Confetti />}
      <span className="kg-gradient kg-pop mb-3 flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lift">
        <Trophy aria-hidden className="h-8 w-8" />
      </span>
      <h1 className="kg-pop text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{headline(score)}</h1>
      <p className="mt-1 text-sm text-muted">
        {local.outOfLives ? 'You used all your hearts — practice makes perfect!' : score >= 50 ? 'You finished' : 'You finished — practice makes perfect!'}{' '}
        <span lang={game.subject === 'hindi' ? 'hi' : 'en'}>{local.outOfLives ? '' : game.title}</span>
      </p>

      <div className="mt-4">
        <KidStars value={stars} size="lg" animate />
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {result?.isNewBest && (
          <p className="kg-feedback flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-sm font-bold text-amber-500">
            <Trophy aria-hidden className="h-4 w-4" />
            New Best Score!{result.previousBest !== null && ` (was ${result.previousBest})`}
          </p>
        )}
        {local.bestStreak >= 2 && (
          <p className="kg-feedback flex items-center gap-1.5 rounded-full bg-orange-500/12 px-3 py-1 text-sm font-bold text-orange-500">
            <Flame aria-hidden className="h-4 w-4" />
            {local.bestStreak} Correct in a Row
          </p>
        )}
      </div>

      <dl className="mt-5 grid w-full max-w-md grid-cols-2 gap-2.5">
        {tiles.map((tile, i) => (
          <div key={tile.label} className="kg-enter rounded-2xl border border-border bg-surface-elevated/80 px-4 py-3" style={{ '--i': i + 2 } as CSSProperties}>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{tile.label}</dt>
            <dd className={cn('mt-0.5 text-xl font-bold tabular-nums', tile.tone ?? 'text-foreground')}>{tile.value}</dd>
          </div>
        ))}
      </dl>

      {/* Saving state: honest about where the result is. */}
      <div className="mt-3 w-full max-w-md" aria-live="polite">
        {save.status === 'saving' && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            Saving your score…
          </p>
        )}
        {save.status === 'error' && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm sm:flex-row">
            <CloudOff aria-hidden className="h-4 w-4 shrink-0 text-amber-500" />
            <span className="flex-1 text-foreground">We couldn&apos;t save this score yet.</span>
            <button
              type="button"
              onClick={onRetrySave}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border-strong bg-surface-elevated px-3 font-semibold text-foreground"
            >
              <RefreshCw aria-hidden className="h-4 w-4" />
              Try again
            </button>
          </div>
        )}
        {result && result.xpLines.length > 0 && (
          <ul className="kg-feedback space-y-1 rounded-2xl border border-amber-400/30 bg-amber-400/8 p-3 text-left text-sm">
            {result.xpLines.map((line) => (
              <li key={line.reason} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-foreground-soft">
                  <Sparkles aria-hidden className="h-3.5 w-3.5 text-amber-500" />
                  {XP_REASON[line.reason]}
                </span>
                <span className="font-bold tabular-nums text-amber-500">+{line.xp} XP</span>
              </li>
            ))}
          </ul>
        )}
        {result && result.xpLines.length === 0 && (
          <p className="text-xs text-muted">You already earned the XP for this score. Beat your best to earn more!</p>
        )}
      </div>

      {result && result.unlocked.length > 0 && (
        <div className="mt-4 w-full max-w-md space-y-2">
          {result.unlocked.map((id) => {
            const achievement = achievementInfo(id);
            if (!achievement) return null;
            return (
              <p key={id} className="kg-feedback flex items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-left text-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/20 text-amber-500">
                  <achievement.icon aria-hidden className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-bold text-foreground">Achievement unlocked: {achievement.title}</span>
                  <span className="text-muted">{achievement.description}</span>
                </span>
              </p>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid w-full max-w-md gap-2.5">
        <button type="button" onClick={onPlayAgain} className="kg-btn inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl text-base font-bold tracking-wider">
          <RotateCcw className="h-5 w-5" />
          PLAY AGAIN
        </button>
        {nextGame && (
          <Link
            href={gameHref(nextGame)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border-strong bg-surface-elevated text-sm font-bold tracking-wider text-foreground transition hover:bg-surface-hover active:scale-[0.97]"
          >
            NEXT GAME
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        <Link href={backHref} className="inline-flex min-h-11 items-center justify-center rounded-2xl text-sm font-semibold text-muted transition hover:text-foreground">
          BACK TO {SUBJECT_INFO[game.subject].name.toUpperCase()}
        </Link>
      </div>
    </div>
  );
}
