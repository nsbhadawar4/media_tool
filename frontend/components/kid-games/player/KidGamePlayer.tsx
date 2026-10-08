'use client';

import Link from 'next/link';
import { useContentCatalog } from '@/lib/content/useContentCatalog';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Clock, Flame, Heart, Lightbulb, Puzzle, SearchX, Sparkles, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { SoundToggle, useGameSound, type SoundName } from '@/components/games/useGameSound';
import { formatClock } from '@/components/games/games';
import { useInterval } from '@/hooks/useInterval';
import { useAuth } from '@/lib/auth/AuthContext';
import { ALL_GAMES, classFromSlug, findLearningGame, gameId, isSubject, loadSubjectContent } from '@/lib/kid-games/catalog';
import { buildSession, questionPoints, sessionPoints, type PreparedQuestion } from '@/lib/kid-games/session';
import { clearSession, dayKey, loadSession, saveSession, useKidProgress, useSoundSetting, useSubmitResult, type SavedSession } from '@/lib/kid-games/progress';
import type { KidResultInput } from '@/lib/api/kidGames';
import type { GameContent, LearningGame } from '@/lib/kid-games/types';
import { cn } from '@/utils/cn';
import { EngineView } from '../engines';
import { KidGameLoader } from '../loaders/KidGameLoader';
import { KidProgressBar } from '../shared/KidUi';
import { ENCOURAGE, ENCOURAGE_HI, pick, PRAISE, PRAISE_HI } from '../theme';
import { GameIntro, GameResults, QUIZ_LIVES, ROUND_ENGINES, type SaveState } from './GameScreens';
import { KidGameFrame } from './KidGameFrame';
import { KidLeaveDialog } from './KidLeaveDialog';

/** How long a fully-right answer stays on screen before the next question comes in on its own. */
const AUTO_NEXT_MS = 1400;

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; content: GameContent };

interface Answered {
  points: number;
  max: number;
  reveal?: string;
  explain?: string;
}

interface Finished {
  correct: number;
  total: number;
  bestStreak: number;
  seconds: number;
  outOfLives: boolean;
}

/** Resolves the URL to a game, or says plainly that there is no such game. */
export function KidGamePlayer({ classSlug, subjectSlug, slot }: { classSlug: string; subjectSlug: string; slot: string }) {
  const classLevel = classFromSlug(classSlug);
  const game = classLevel && isSubject(subjectSlug) ? findLearningGame(gameId(classLevel, subjectSlug, slot)) : undefined;
  // An administrator can switch a game (or its class / subject) off. Wait for the catalog before
  // starting, so a switched-off game never briefly opens; the server refuses its results anyway.
  const catalog = useContentCatalog();
  if (game && !catalog.settled) return <FullPageSpinner />;
  if (game && !catalog.isGamePlayable(game.id)) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <EmptyState
          icon={SearchX}
          title="Not available right now"
          description="This game has been switched off for now. Pick another one from Kid Games."
          action={
            <Link href="/kid-games" className="btn-primary inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-accent-foreground">
              Back to Kid Games
            </Link>
          }
        />
      </div>
    );
  }

  if (!game) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <EmptyState
          icon={SearchX}
          title="Game not found"
          description="That game does not exist. Pick one from Kid Games."
          action={
            <Link href="/kid-games" className="btn-primary inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-accent-foreground">
              Back to Kid Games
            </Link>
          }
        />
      </div>
    );
  }
  // Keyed, so moving to the next game starts from a clean slate.
  return <Player key={game.id} game={catalog.applyGame(game)} />;
}

/**
 * The game after this one, in the listed order (next in the subject, then the next subject, then
 * the next class) — skipping anything an administrator has hidden or switched off.
 */
function nextGameAfter(game: LearningGame, listed: LearningGame[]): LearningGame | null {
  const i = listed.findIndex((g) => g.id === game.id);
  if (i >= 0) return listed[i + 1] ?? null;
  // An unlisted (hidden) game: carry on with the first listed game after it in the code order.
  const position = ALL_GAMES.findIndex((g) => g.id === game.id);
  return listed.find((g) => ALL_GAMES.findIndex((x) => x.id === g.id) > position) ?? null;
}

/** A few sparkles bursting from the feedback badge on a right answer (decorative). */
function Burst() {
  return (
    <span aria-hidden className="kg-burst">
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <i
            key={i}
            style={
              {
                '--bx': `${Math.cos(angle) * 30}px`,
                '--by': `${Math.sin(angle) * 30}px`,
                background: ['#fbbf24', '#22c55e', '#60a5fa', '#f472b6'][i % 4],
                animationDelay: `${(i % 2) * 0.05}s`,
              } as CSSProperties
            }
          />
        );
      })}
    </span>
  );
}

function Player({ game }: { game: LearningGame }) {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;
  const progress = useKidProgress();
  const [soundOn, setSound] = useSoundSetting();
  const { play } = useGameSound();
  const submit = useSubmitResult();
  const catalog = useContentCatalog();
  const sfx = useCallback((name: SoundName) => soundOn && play(name), [soundOn, play]);
  const lang = game.subject === 'hindi' ? 'hi' : 'en';
  const subjectHref = `/kid-games/class-${game.classLevel}/${game.subject}`;
  const hasLives = game.engine === 'timed-quiz';

  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [saved, setSaved] = useState<SavedSession | null>(null);
  const [phase, setPhase] = useState<'intro' | 'play' | 'result'>('intro');
  const [questions, setQuestions] = useState<PreparedQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lives, setLives] = useState(QUIZ_LIVES);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [showRetry, setShowRetry] = useState(false);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [save, setSave] = useState<SaveState>({ status: 'saving' });
  const [leaving, setLeaving] = useState(false);
  const [clock, setClock] = useState(0);

  // Mirrors of state that timers read, so a delayed "next" never acts on stale values.
  const live = useRef({ correct: 0, streak: 0, bestStreak: 0, lives: QUIZ_LIVES });
  const elapsedBase = useRef(0);
  const startedAt = useRef(0);
  const autoNext = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmission = useRef<KidResultInput | null>(null);

  const fetchContent = useCallback(() => {
    let alive = true;
    loadSubjectContent(game.classLevel, game.subject)
      .then((all) => {
        const content = all[game.slot];
        if (!content) throw new Error('missing content');
        if (!alive) return;
        // The first session is built here, so the intro can say how many questions it has.
        setQuestions(buildSession(game.engine, content));
        setSaved(loadSession(userId, game.id));
        setLoad({ status: 'ready', content });
      })
      .catch(() => alive && setLoad({ status: 'error' }));
    return () => {
      alive = false;
    };
  }, [game, userId]);

  useEffect(() => fetchContent(), [fetchContent]);

  useEffect(
    () => () => {
      if (autoNext.current) clearTimeout(autoNext.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  const elapsedMs = () => elapsedBase.current + (startedAt.current ? Date.now() - startedAt.current : 0);

  useInterval(() => setClock(Math.floor(elapsedMs() / 1000)), phase === 'play' ? 1000 : null);

  const syncLive = (next: Partial<typeof live.current>) => {
    live.current = { ...live.current, ...next };
    setCorrect(live.current.correct);
    setStreak(live.current.streak);
    setLives(live.current.lives);
  };

  const begin = (qs: PreparedQuestion[], at: number, state: { correct: number; streak: number; bestStreak: number; lives: number }, elapsed: number) => {
    setQuestions(qs);
    setIndex(at);
    syncLive(state);
    setAnswered(null);
    setShowRetry(false);
    setFinished(null);
    elapsedBase.current = elapsed;
    startedAt.current = Date.now();
    setClock(Math.floor(elapsed / 1000));
    setPhase('play');
    sfx('go');
  };

  const startFresh = (reuseBuilt: boolean) => {
    if (load.status !== 'ready') return;
    clearSession(userId, game.id);
    setSaved(null);
    begin(reuseBuilt ? questions : buildSession(game.engine, load.content), 0, { correct: 0, streak: 0, bestStreak: 0, lives: QUIZ_LIVES }, 0);
  };

  const resume = () => {
    if (!saved) return;
    begin(saved.questions, saved.index, { correct: saved.correct, streak: saved.streak, bestStreak: saved.bestStreak, lives: saved.lives }, saved.elapsedMs);
    setSaved(null);
  };

  const send = (input: KidResultInput) => {
    lastSubmission.current = input;
    setSave({ status: 'saving' });
    submit.mutate(input, {
      onSuccess: (data) => {
        setSave({ status: 'saved', result: data.result });
        if (data.result.unlocked.length > 0 || data.result.isNewBest) sfx('level');
      },
      onError: () => setSave({ status: 'error' }),
    });
  };

  const finish = (outOfLives = false) => {
    const total = sessionPoints(questions);
    const seconds = Math.round(elapsedMs() / 1000);
    startedAt.current = 0;
    clearSession(userId, game.id);
    const result: Finished = { correct: live.current.correct, total, bestStreak: live.current.bestStreak, seconds, outOfLives };
    setFinished(result);
    setPhase('result');
    sfx(result.correct / total >= 0.5 ? 'win' : 'level');
    send({ gameId: game.id, correct: result.correct, total, bestStreak: result.bestStreak, seconds, day: dayKey() });
  };

  const next = () => {
    if (autoNext.current) clearTimeout(autoNext.current);
    autoNext.current = null;
    if (hasLives && live.current.lives <= 0) {
      finish(true);
    } else if (index + 1 < questions.length) {
      setIndex(index + 1);
      setAnswered(null);
      setShowRetry(false);
    } else {
      finish();
    }
  };
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  });

  const question = questions[index];

  const onResult = (points: number, reveal?: string, explain?: string) => {
    if (!question || answered) return;
    const max = questionPoints(question);
    const full = points === max;
    const nextStreak = full ? live.current.streak + 1 : 0;
    syncLive({
      correct: live.current.correct + points,
      streak: nextStreak,
      bestStreak: Math.max(live.current.bestStreak, nextStreak),
      lives: hasLives && !full ? Math.max(0, live.current.lives - 1) : live.current.lives,
    });
    setAnswered({ points, max, reveal, explain });
    setShowRetry(false);
    sfx(full ? 'success' : 'flip');
    // Saved after every answer, so leaving (or closing the tab) never loses what is done.
    const outOfLives = hasLives && live.current.lives <= 0;
    if (index + 1 < questions.length && !outOfLives) {
      saveSession(userId, { gameId: game.id, questions, index: index + 1, ...live.current, elapsedMs: elapsedMs() });
    }
    if (full) autoNext.current = setTimeout(() => nextRef.current(), AUTO_NEXT_MS);
  };

  const onRetry = () => {
    sfx('tap');
    setRetryTick((n) => n + 1);
    setShowRetry(true);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => setShowRetry(false), 2200);
  };

  const onStep = () => sfx('match');

  const total = sessionPoints(questions);
  const scoreNow = total > 0 ? Math.round((correct * 100) / total) : 0;
  const xpNow = total > 0 ? Math.round((game.xp * correct) / total) : 0;
  const pointsThisAnswer = total > 0 && answered ? Math.round((answered.points * 100) / total) : 0;
  const record = progress.games[game.id];

  // ---------------------------------------------------------------- header

  const header = (
    <div className="px-3 sm:px-5">
      <div className="flex h-16 items-center gap-2">
        {phase === 'play' ? (
          <button
            type="button"
            onClick={() => setLeaving(true)}
            aria-label="Exit game"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-border-strong bg-surface-elevated/80 px-3 text-sm font-semibold text-foreground transition active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="max-sm:sr-only">Exit</span>
          </button>
        ) : (
          <Link
            href={subjectHref}
            aria-label="Back"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-border-strong bg-surface-elevated/80 px-3 text-sm font-semibold text-foreground transition active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="max-sm:sr-only">Back</span>
          </Link>
        )}

        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-bold text-foreground sm:text-base" lang={lang}>
            {game.title}
          </p>
          <p className="truncate text-xs font-medium tabular-nums text-muted">
            {phase === 'play'
              ? `${ROUND_ENGINES.includes(game.engine) ? 'Round' : 'Question'} ${Math.min(index + 1, questions.length)} / ${questions.length}`
              : `Class ${game.classLevel} • ${game.difficulty[0].toUpperCase()}${game.difficulty.slice(1)}`}
          </p>
        </div>

        <SoundToggle muted={!soundOn} onToggle={() => setSound(!soundOn)} />
      </div>

      {phase === 'play' && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 pb-2.5 text-xs font-bold tabular-nums" aria-label="Game stats">
          <span className="flex items-center gap-1 rounded-full bg-violet-500/12 px-2.5 py-1 text-violet-400" aria-label={`Score ${scoreNow}`}>
            Score <span key={`s${correct}`} className="kg-score-pop">{scoreNow}</span>
          </span>
          <span className="relative flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-amber-500" aria-label={`${xpNow} XP so far`}>
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            <span key={`x${correct}`} className="kg-score-pop">{xpNow}</span> XP
            {answered && pointsThisAnswer > 0 && (
              <span key={index} aria-hidden className="kg-xp-float absolute -top-4 right-1 text-xs font-bold text-amber-500">
                +{Math.round((game.xp * answered.points) / total)}
              </span>
            )}
          </span>
          <span
            className={cn('flex items-center gap-1 rounded-full px-2.5 py-1', streak >= 2 ? 'bg-orange-500/15 text-orange-500' : 'bg-surface-hover text-muted')}
            aria-label={`${streak} correct in a row`}
          >
            <Flame aria-hidden className="h-3.5 w-3.5" />
            <span key={`k${streak}`} className={streak > 0 ? 'kg-score-pop' : undefined}>
              {streak}
            </span>
          </span>
          {hasLives && (
            <span className="flex items-center gap-0.5 rounded-full bg-rose-500/10 px-2 py-1 text-rose-500" aria-label={`${lives} of ${QUIZ_LIVES} hearts left`}>
              {Array.from({ length: QUIZ_LIVES }, (_, i) => (
                <Heart key={i} aria-hidden className={cn('h-3.5 w-3.5', i < lives ? 'fill-current' : 'kg-heart-lost opacity-35')} />
              ))}
            </span>
          )}
          {hasLives && (
            <span className="flex items-center gap-1 rounded-full bg-surface-hover px-2.5 py-1 text-muted" aria-label={`Time ${formatClock(clock)}`}>
              <Clock aria-hidden className="h-3.5 w-3.5" />
              {formatClock(clock)}
            </span>
          )}
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------- body

  if (load.status === 'loading') {
    return <KidGameLoader variant={game.subject} title={game.title} layout="screen" />;
  }

  if (load.status === 'error') {
    return (
      <KidGameFrame subject={game.subject} classLevel={game.classLevel} header={header}>
        <div role="alert" className="flex flex-col items-center text-center">
          <span className="kg-tint kg-text mb-3 flex h-16 w-16 items-center justify-center rounded-2xl">
            <Puzzle aria-hidden className="h-8 w-8" />
          </span>
          <h1 className="text-xl font-bold text-foreground">Something went wrong.</h1>
          <p className="mt-1 text-sm text-muted">This game could not open just now.</p>
          <button
            type="button"
            onClick={() => {
              setLoad({ status: 'loading' });
              fetchContent();
            }}
            className="kg-btn mt-5 inline-flex min-h-12 items-center justify-center rounded-2xl px-6 text-sm font-bold tracking-wider"
          >
            Try Again
          </button>
        </div>
      </KidGameFrame>
    );
  }

  if (phase === 'intro') {
    return (
      <KidGameFrame subject={game.subject} classLevel={game.classLevel} header={header}>
        <GameIntro
          game={game}
          learn={load.content.learn}
          questionCount={saved ? saved.questions.length : questions.length}
          record={record}
          saved={saved}
          onStart={() => startFresh(!saved)}
          onResume={resume}
        />
      </KidGameFrame>
    );
  }

  if (phase === 'result' && finished) {
    return (
      <KidGameFrame subject={game.subject} classLevel={game.classLevel} header={header}>
        <GameResults
          game={game}
          local={finished}
          save={save}
          nextGame={nextGameAfter(game, catalog.listedGames())}
          backHref={subjectHref}
          onPlayAgain={() => startFresh(false)}
          onRetrySave={() => lastSubmission.current && send(lastSubmission.current)}
        />
      </KidGameFrame>
    );
  }

  if (!question) return null;

  const full = answered && answered.points === answered.max;
  const outOfLives = hasLives && lives <= 0;
  const praise = lang === 'hi' ? pick(PRAISE_HI, index) : pick(PRAISE, index);
  const encourage = lang === 'hi' ? pick(ENCOURAGE_HI, retryTick) : pick(ENCOURAGE, retryTick);
  const progressValue = ((index + (answered ? 1 : 0)) / questions.length) * 100;

  const footer = (
    <div className="mx-auto w-full max-w-2xl space-y-3">
      <div aria-live="polite" aria-atomic="true">
        {answered ? (
          <div
            key={`a${index}`}
            className={cn(
              'kg-feedback flex items-center gap-3 rounded-2xl border px-4 py-3',
              full
                ? 'border-(--kid-correct) bg-[color-mix(in_srgb,var(--kid-correct)_12%,transparent)]'
                : 'border-(--kid-retry) bg-[color-mix(in_srgb,var(--kid-retry)_10%,transparent)]',
            )}
          >
            <span aria-hidden className={cn('relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white', full ? 'bg-(--kid-correct)' : 'bg-(--kid-retry)')}>
              {full ? <Check className="h-5 w-5" strokeWidth={3} /> : <Lightbulb className="h-5 w-5" />}
              {full && <Burst />}
            </span>
            <div className="min-w-0 flex-1 text-left">
              <p className="font-bold text-foreground" lang={lang}>
                {full ? praise : answered.points > 0 ? 'Well played! Some were tricky.' : lang === 'hi' ? 'अच्छी कोशिश!' : 'Good try!'}
                {full && streak >= 3 && (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-sm text-orange-500">
                    <Flame aria-hidden className="h-4 w-4" />
                    {streak} in a row!
                  </span>
                )}
              </p>
              {answered.reveal && (
                <p className="text-sm text-foreground-soft" lang={lang}>
                  {lang === 'hi' ? 'सही उत्तर: ' : 'The answer is: '}
                  <strong>{answered.reveal}</strong>
                </p>
              )}
              {answered.explain && (
                <p className="text-xs text-muted" lang={lang}>
                  {answered.explain}
                </p>
              )}
              {outOfLives && <p className="text-xs font-semibold text-rose-500">That was your last heart. Let&apos;s see your score!</p>}
            </div>
            <button type="button" onClick={next} autoFocus={!full} className="kg-btn inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-2xl px-4 text-sm font-bold tracking-wider">
              {index + 1 < questions.length && !outOfLives ? 'NEXT' : 'RESULTS'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : showRetry ? (
          <div
            key={`r${retryTick}`}
            className="kg-feedback flex items-center gap-3 rounded-2xl border border-(--kid-retry) bg-[color-mix(in_srgb,var(--kid-retry)_10%,transparent)] px-4 py-3"
          >
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--kid-retry) text-white">
              <X className="h-5 w-5" strokeWidth={3} />
            </span>
            <p className="font-semibold text-foreground" lang={lang}>
              {encourage}
            </p>
          </div>
        ) : null}
      </div>
      <KidProgressBar value={progressValue} label={`Question ${index + 1} of ${questions.length}`} size="sm" />
    </div>
  );

  return (
    <>
      <KidGameFrame subject={game.subject} classLevel={game.classLevel} header={header} footer={footer}>
        <div className="game-surface">
          <div key={question.key} className="kg-q-enter">
            <EngineView
              engine={game.engine}
              question={question}
              classLevel={game.classLevel}
              subject={game.subject}
              onResult={onResult}
              onRetry={onRetry}
              onStep={onStep}
              done={answered !== null}
            />
          </div>
        </div>
      </KidGameFrame>
      {leaving && (
        <KidLeaveDialog
          subject={game.subject}
          onContinue={() => setLeaving(false)}
          onExit={() => {
            setLeaving(false);
            router.push(subjectHref);
          }}
        />
      )}
    </>
  );
}
