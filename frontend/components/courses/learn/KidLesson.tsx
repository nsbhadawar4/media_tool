'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BookOpen, CircleCheck, Gamepad2, Globe, Info, Lightbulb, Hand, Loader2, PartyPopper, PenLine, RotateCcw, Sparkles, Star, Target, Timer, Trophy, type LucideIcon } from 'lucide-react';
import type { CurriculumQuestion } from '@/lib/api/adminClasses';
import { progressApi, type ClassProgress } from '@/lib/api/courses';
import { ApiError } from '@/lib/api/client';
import { LOGIN_PATH } from '@/lib/auth/routes';
import { buildSteps, parseExplanation, previewEmoji, rating, STARS_PER_LESSON, type LessonSection, type Step } from '@/lib/learn/lessonFlow';
import { formatMinutes } from '@/lib/content/learnPaths';
import { cn } from '@/utils/cn';
import { ActivityCard, SpeakButton, type Settled } from './ActivityCard';

export interface KidLessonData {
  number: number;
  title: string;
  explanation: string;
  examples: string[];
  keyPoints: string[];
  questions: CurriculumQuestion[];
  practice: CurriculumQuestion[];
  estimatedMinutes: number | null;
}

interface KidLessonProps {
  lesson: KidLessonData;
  total: number;
  chapterTitle: string;
  where: { class: string; subject: string; chapter: string };
  signedIn: boolean;
  /** Classes 1–3 get the "little learner" voice; the layout is the same for every class. */
  young: boolean;
  prevHref: string | null;
  /** The next lesson, or null on the last one. */
  nextHref: string | null;
  nextTitle: string | null;
  /** Where the last lesson leads: the chapter's quiz when it has one, otherwise the chapter. */
  afterHref: string;
  hasQuiz: boolean;
}

const progressKey = (classSlug: string) => ['progress', 'class', classSlug] as const;
const TONE: Record<string, number> = { goal: 0, learn: 1, activity: 2, real: 3, note: 1, intro: 1 };
/** A real icon for each kind of lesson part, by what the part is for (never the emoji in the text). */
const SECTION_ICON: Record<string, LucideIcon> = { goal: Target, learn: Lightbulb, activity: Gamepad2, real: Globe, note: Info, intro: BookOpen };
const BTN_PRIMARY = 'btn-primary inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-8 text-lg font-extrabold text-accent-foreground transition active:scale-95 disabled:opacity-50';
const BTN_GHOST = 'inline-flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-border bg-surface px-6 text-base font-bold text-foreground transition active:scale-95 hover:border-(--kg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)';

function SectionCard({ s, index }: { s: LessonSection; index: number }) {
  const tone = TONE[s.kind] ?? 1;
  const Icon = SECTION_ICON[s.kind] ?? Lightbulb;
  const aloud = [s.heading, ...s.lines].filter(Boolean).join('. ');
  return (
    <article className={cn('kl-tone-' + tone, 'kl-tint kl-pop rounded-[2rem] border-2 p-5 sm:p-7')} style={{ '--i': index } as CSSProperties}>
      <div className="flex items-center gap-3">
        {s.kind !== 'intro' && (
          <span aria-hidden className="kl-badge kl-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white ring-1 ring-white/30 sm:h-14 sm:w-14">
            <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.25} />
          </span>
        )}
        {s.heading && <h2 className="min-w-0 flex-1 text-xl font-extrabold leading-tight text-foreground sm:text-2xl">{s.heading}</h2>}
        <SpeakButton text={aloud} label={s.heading ? `Listen to ${s.heading}` : 'Listen'} />
      </div>
      <div className="mt-3 space-y-2">
        {s.lines.map((line, i) => (
          <p key={i} className="text-xl leading-relaxed text-foreground [overflow-wrap:anywhere] sm:text-2xl sm:leading-relaxed">
            {line}
          </p>
        ))}
      </div>
    </article>
  );
}

export function KidLesson({ lesson, total, chapterTitle, where, signedIn, young, prevHref, nextHref, nextTitle, afterHref, hasQuiz }: KidLessonProps) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const steps = useMemo<Step[]>(() => buildSteps(lesson), [lesson]);
  const sections = useMemo(() => parseExplanation(lesson.explanation), [lesson.explanation]);
  const questionCount = steps.filter((s) => s.kind === 'question').length;
  const preview = useMemo(() => previewEmoji([lesson.title, ...lesson.examples, lesson.explanation], 1)[0] ?? '📚', [lesson]);

  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<number, Settled>>({});
  const step = steps[index]!;
  const settled = results[index];
  const stars = Object.values(results).reduce((n, r) => n + r.stars, 0);
  const firstTry = Object.values(results).filter((r) => r.firstTry).length;

  // Progress is the app's existing one: started when opened, completed when the child reaches the end.
  const progress = useQuery({ queryKey: progressKey(where.class), queryFn: async () => (await progressApi.class(where.class)).data, enabled: signedIn, retry: false });
  const alreadyDone = Boolean(progress.data?.chapters.find((c) => c.chapter === where.chapter)?.completedLessons.includes(lesson.number));
  const start = useMutation({ mutationFn: () => progressApi.lesson(where, lesson.number, 'start') });
  // Finished in one sitting → the score counts; a lesson resumed part-way has no full record of its questions, so none is sent.
  const resumedFrom = useRef(0);
  const score = questionCount > 0 ? Math.round((firstTry / questionCount) * 100) : 100;
  const complete = useMutation({
    mutationFn: () => progressApi.lesson(where, lesson.number, 'complete', resumedFrom.current === 0 ? { score } : {}),
    // Everything that counts lessons (this class, continue, the dashboard) is read again.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['progress'] }),
  });
  useEffect(() => {
    if (signedIn) start.mutate();
    // Once per lesson opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, where.class, where.subject, where.chapter, lesson.number]);
  const atFinish = step.kind === 'finish';
  const asked = useRef(false);
  useEffect(() => {
    if (atFinish && signedIn && !alreadyDone && !asked.current && progress.isFetched) {
      asked.current = true;
      complete.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atFinish, signedIn, alreadyDone, progress.isFetched]);
  const unauthorised = progress.error instanceof ApiError && progress.error.status === 401;

  // Resume: the step the learner left this lesson at is in the database; once it is known and nothing
  // has been done yet, pick up there (and say so, with a way to start over). Never for a finished lesson.
  const savedStep = progress.data?.chapters.find((c) => c.chapter === where.chapter)?.positions[String(lesson.number)] ?? 0;
  const [resumed, setResumed] = useState(false);
  const moved = useRef(false);
  useEffect(() => {
    if (!signedIn || moved.current || alreadyDone || savedStep <= 0 || savedStep >= steps.length - 1) return;
    moved.current = true;
    resumedFrom.current = savedStep;
    setIndex(savedStep);
    setResumed(true);
    // Once, when the saved step first arrives.
  }, [signedIn, savedStep, alreadyDone, steps.length]);

  // Save the step as the learner moves (immediately — it is one small write), so closing the tab loses nothing.
  const lastSaved = useRef(0);
  useEffect(() => {
    if (!signedIn || step.kind === 'finish' || index === lastSaved.current) return;
    lastSaved.current = index;
    void progressApi
      .lesson(where, lesson.number, 'position', { position: index })
      .then(() =>
        queryClient.setQueryData<ClassProgress>(progressKey(where.class), (old) =>
          old ? { ...old, chapters: old.chapters.map((c) => (c.chapter === where.chapter ? { ...c, positions: { ...c.positions, [String(lesson.number)]: index } } : c)) } : old,
        ),
      )
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);
  const saved = alreadyDone || complete.isSuccess;

  // Each new step starts at the top of the lesson; a settled question puts focus on "Next".
  const top = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (index > 0) top.current?.scrollIntoView({ block: 'start' });
  }, [index]);
  useEffect(() => {
    if (settled && step.kind === 'question') nextBtn.current?.focus({ preventScroll: true });
  }, [settled, step.kind]);

  const go = (to: number) => {
    moved.current = true;
    setIndex(Math.max(0, Math.min(steps.length - 1, to)));
  };
  const restart = () => {
    resumedFrom.current = 0;
    setResumed(false);
    setResults({});
    asked.current = false;
    go(0);
  };
  const nextIsFinish = steps[index + 1]?.kind === 'finish';
  const percent = Math.round((index / Math.max(1, steps.length - 1)) * 100);
  const earned = rating(firstTry, questionCount);
  const lastLesson = nextHref === null;

  return (
    <div className="flex flex-col gap-5">
      <header ref={top} className="kl-tone-0 kl-tint anim-rise scroll-mt-20 rounded-[2rem] border-2 p-5 shadow-card sm:p-7">
        <div className="flex items-start gap-4">
          <span aria-hidden className="kl-badge kl-float flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl text-4xl shadow-card sm:h-20 sm:w-20 sm:text-5xl">
            {preview}
          </span>
          <div className="min-w-0 flex-1">
            <p className="kl-text text-xs font-extrabold uppercase tracking-[0.16em]">
              Lesson {lesson.number} of {total} · {chapterTitle}
            </p>
            <h1 className="mt-1 text-balance text-2xl font-extrabold leading-tight tracking-normal text-foreground sm:text-4xl">{lesson.title}</h1>
            {lesson.estimatedMinutes ? <p className="mt-1 text-sm font-medium text-muted"><span className="inline-flex items-center gap-1.5"><Timer aria-hidden className="h-4 w-4" />About {formatMinutes(lesson.estimatedMinutes)}</span></p> : null}
          </div>
          <span key={stars} aria-label={`${stars} stars`} className={cn('inline-flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-base font-extrabold tabular-nums text-foreground shadow-card', stars > 0 && 'kl-pop')}>
            <Star aria-hidden className="h-5 w-5 fill-amber-400 text-amber-500" />
            {stars}
          </span>
        </div>
        <div className="mt-4">
          <div className="h-3 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`Lesson steps: ${index + 1} of ${steps.length}`}>
            <div className="h-full rounded-full bg-linear-to-r from-(--kg) to-(--kg-2) transition-[width] duration-500" style={{ width: `${Math.max(percent, 6)}%` }} />
          </div>
        </div>
      </header>

      {resumed && index > 0 && step.kind !== 'finish' && (
        <div role="status" className="kl-tone-1 kl-tint flex flex-col gap-3 rounded-2xl border-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2 text-base font-bold text-foreground">
            <RotateCcw aria-hidden className="h-5 w-5 kl-text" />
            Welcome back! We saved your place in this lesson.
          </span>
          <button type="button" onClick={restart} className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-border bg-surface px-4 text-sm font-bold text-foreground transition hover:border-(--kg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)">
            Start from the beginning
          </button>
        </div>
      )}

      {step.kind === 'learn' && (
        <div className="flex flex-col gap-4">
          <p className="kl-pop px-1 text-2xl font-extrabold text-foreground">
            <Hand aria-hidden className="mr-2 inline h-7 w-7 align-text-bottom text-amber-500" />
            {young ? 'Hello little learner!' : 'Hi there, learner!'}
          </p>
          {sections.length > 0 ? sections.map((s, i) => <SectionCard key={i} s={s} index={i + 1} />) : <p className="rounded-3xl border-2 border-border bg-surface p-5 text-lg text-muted">This lesson&apos;s explanation is on its way.</p>}
        </div>
      )}

      {step.kind === 'examples' && (
        <div className="flex flex-col gap-4">
          {lesson.examples.length > 0 && (
            <section aria-labelledby="kl-examples" className="kl-tone-1 kl-tint rounded-[2rem] border-2 p-5 sm:p-7">
              <h2 id="kl-examples" className="text-xl font-extrabold text-foreground sm:text-2xl">
                <span className="inline-flex items-center gap-2"><Sparkles aria-hidden className="h-6 w-6 text-(--t1)" />Look at these</span>
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {lesson.examples.map((x, i) => (
                  <li key={`${x}-${i}`} className="kl-pop flex items-center gap-3 rounded-2xl border-2 border-border bg-surface px-4 py-3 text-xl font-semibold text-foreground [overflow-wrap:anywhere]" style={{ '--i': i } as CSSProperties}>
                    <span className="min-w-0 flex-1">{x}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {lesson.keyPoints.length > 0 && (
            <section aria-labelledby="kl-remember" className="kl-tone-2 kl-tint rounded-[2rem] border-2 p-5 sm:p-7">
              <h2 id="kl-remember" className="flex items-center gap-2 text-xl font-extrabold text-foreground sm:text-2xl">
                <Star aria-hidden className="h-6 w-6 fill-amber-400 text-amber-500" />Remember
              </h2>
              <ul className="mt-3 space-y-2">
                {lesson.keyPoints.map((x, i) => (
                  <li key={`${x}-${i}`} className="flex items-start gap-3 text-xl leading-snug text-foreground [overflow-wrap:anywhere]">
                    <CircleCheck aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-(--kid-correct)" />
                    {x}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {step.kind === 'question' && (
        <ActivityCard
          key={index}
          q={step.q}
          seed={index}
          label={`${step.group === 'questions' ? 'Your turn' : 'Practice time'} · ${step.position} of ${step.of}`}
          icon={step.group === 'questions' ? Target : PenLine}
          onSettled={(r) => setResults((all) => ({ ...all, [index]: r }))}
        />
      )}

      {step.kind === 'finish' && (
        <section aria-labelledby="kl-done" className="kl-tone-0 kl-tint kl-pop relative overflow-hidden rounded-[2rem] border-2 p-6 text-center shadow-card sm:p-10">
          <div aria-hidden className="kl-burst">
            {['-120px,-60px', '120px,-60px', '-150px,10px', '150px,10px', '-80px,80px', '80px,80px'].map((v, i) => (
              <span key={v} style={{ '--x': v.split(',')[0], '--y': v.split(',')[1], '--i': i } as CSSProperties}>
                <Sparkles className="h-6 w-6 text-amber-500" />
              </span>
            ))}
          </div>
          <p aria-hidden className="kl-float flex justify-center">
            <span className="kl-badge kl-icon flex h-24 w-24 items-center justify-center rounded-[2rem] text-white">
              {lastLesson ? <Trophy className="h-12 w-12" /> : <PartyPopper className="h-12 w-12" />}
            </span>
          </p>
          <h2 id="kl-done" className="mt-2 text-3xl font-extrabold text-foreground sm:text-4xl">
            {young ? 'You did it!' : 'Lesson complete!'}
          </h2>
          <p className="mt-1 text-lg text-foreground-soft">{lastLesson ? (hasQuiz ? 'That was the last lesson. The chapter quiz is next!' : 'You finished every lesson in this chapter!') : 'Great learning today.'}</p>
          <div role="img" aria-label={`${earned} out of 3 stars`} className="mt-4 flex justify-center gap-2">
            {[1, 2, 3].map((n) => (
              <span key={n} aria-hidden className={cn(n <= earned ? 'kl-pop' : 'opacity-25 grayscale')} style={{ '--i': n } as CSSProperties}>
                <Star className="h-12 w-12 fill-amber-400 text-amber-500" />
              </span>
            ))}
          </div>
          {questionCount > 0 && (
            <p className="mt-2 text-base font-semibold text-foreground-soft">
              {firstTry} of {questionCount} right the first time · {stars} stars collected
            </p>
          )}
          <div role="status" aria-live="polite" className="mt-3 text-base font-semibold">
            {signedIn && !unauthorised ? (
              complete.isPending ? (
                <span className="inline-flex items-center gap-2 text-muted">
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Saving your stars…
                </span>
              ) : complete.isError ? (
                <button type="button" onClick={() => complete.mutate()} className="text-danger underline">
                  Couldn&apos;t save — tap to try again
                </button>
              ) : saved ? (
                <span className="inline-flex items-center gap-2 text-success">
                  <CircleCheck aria-hidden className="h-5 w-5" /> Saved! +{STARS_PER_LESSON} stars for this lesson
                </span>
              ) : null
            ) : (
              <span className="text-muted">
                <Link href={`${LOGIN_PATH}?from=${encodeURIComponent(pathname ?? '/')}`} className="font-bold text-accent underline">
                  Sign in
                </Link>{' '}
                to keep your stars and progress.
              </span>
            )}
          </div>
          <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
            {nextHref ? (
              <Link href={nextHref} className={BTN_PRIMARY}>
                Next lesson{nextTitle ? `: ${nextTitle}` : ''}
                <ArrowRight aria-hidden className="h-5 w-5 shrink-0" />
              </Link>
            ) : (
              <Link href={afterHref} className={BTN_PRIMARY}>
                {hasQuiz ? 'Take the chapter quiz' : 'Back to the chapter'}
                <ArrowRight aria-hidden className="h-5 w-5 shrink-0" />
              </Link>
            )}
            <button type="button" onClick={restart} className={BTN_GHOST}>
              <RotateCcw aria-hidden className="h-5 w-5" />
              Play again
            </button>
          </div>
        </section>
      )}

      {/* Moving on: big, easy to tap. */}
      {step.kind !== 'finish' && (
        <div className="flex items-center gap-3">
          {index > 0 ? (
            <button type="button" onClick={() => go(index - 1)} aria-label="Back" className={cn(BTN_GHOST, 'w-14 shrink-0 px-0 sm:w-auto sm:px-6')}>
              <ArrowLeft aria-hidden className="h-5 w-5" />
              <span className="hidden sm:inline">Back</span>
            </button>
          ) : prevHref ? (
            <Link href={prevHref} aria-label="Previous lesson" className={cn(BTN_GHOST, 'w-14 shrink-0 px-0 sm:w-auto sm:px-6')}>
              <ArrowLeft aria-hidden className="h-5 w-5" />
              <span className="hidden sm:inline">Previous lesson</span>
            </Link>
          ) : null}
          {(step.kind !== 'question' || settled) && (
            <button ref={nextBtn} type="button" onClick={() => go(index + 1)} className={cn(BTN_PRIMARY, 'flex-1 sm:flex-none sm:min-w-64')}>
              {step.kind === 'learn' ? "Let's go!" : step.kind === 'examples' ? 'Try it!' : nextIsFinish ? 'See my stars' : 'Next activity'}
              {nextIsFinish && step.kind === 'question' ? <Sparkles aria-hidden className="h-5 w-5" /> : <ArrowRight aria-hidden className="h-5 w-5" />}
            </button>
          )}
        </div>
      )}
      {step.kind === 'finish' && index > 0 && (
        <button type="button" onClick={() => go(index - 1)} className="self-center text-sm font-semibold text-muted underline-offset-2 hover:underline">
          ← Back to the last activity
        </button>
      )}
    </div>
  );
}
