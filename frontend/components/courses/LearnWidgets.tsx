'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Eye, Lightbulb, Loader2, RotateCcw, Trophy } from 'lucide-react';
import type { CurriculumQuestion } from '@/lib/api/adminClasses';
import { progressApi, type QuizResult } from '@/lib/api/courses';
import { ApiError } from '@/lib/api/client';
import { LOGIN_PATH } from '@/lib/auth/routes';
import { cn } from '@/utils/cn';

/**
 * The interactive parts of the course pages (/classes/…): studying a lesson's questions, taking a
 * chapter quiz, and a signed-in learner's progress. The pages are rendered on the server; these
 * small client pieces run inside them. Visitors can study everything; progress and quiz scores are
 * kept only for signed-in learners (the page tells these pieces which the viewer is).
 */

type Where = { class: string; subject: string; chapter: string };
const progressKey = (classSlug: string) => ['progress', 'class', classSlug] as const;

const TYPE_LABEL: Record<string, string> = {
  mcq: 'Choose one',
  'true-false': 'True or false',
  'fill-blank': 'Fill in the blank',
  'short-answer': 'Short answer',
  match: 'Match',
  'word-problem': 'Word problem',
};

/** A lesson's questions or practice: think first, then show the answer (and why). */
export function StudyQuestions({ items, label }: { items: CurriculumQuestion[]; label: string }) {
  const [shown, setShown] = useState<Set<number>>(new Set());
  if (!items.length) return null;
  const toggle = (i: number) => setShown((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set([...s, i])));
  return (
    <ol className="space-y-3" aria-label={label}>
      {items.map((q, i) => {
        const open = shown.has(i);
        return (
          <li key={`${q.prompt}-${i}`} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {i + 1} · {TYPE_LABEL[q.type] ?? 'Question'}
            </p>
            <p className="mt-1 whitespace-pre-line font-medium text-foreground">{q.prompt}</p>
            {q.options.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {q.options.map((o) => (
                  <li key={o} className={cn('rounded-xl border px-3 py-1.5 text-sm', open && o === q.answer ? 'border-success bg-success/10 font-semibold text-foreground' : 'border-border text-foreground-soft')}>
                    {o}
                  </li>
                ))}
              </ul>
            )}
            {q.answer && (
              <div className="mt-3">
                <button type="button" onClick={() => toggle(i)} aria-expanded={open} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg text-sm font-semibold text-accent hover:underline">
                  <Eye aria-hidden className="h-4 w-4" />
                  {open ? 'Hide answer' : 'Show answer'}
                </button>
                {open && (
                  <p className="mt-1 rounded-xl bg-success/10 px-3 py-2 text-sm text-foreground">
                    <strong>Answer:</strong> {q.answer}
                    {q.explanation && <span className="block text-foreground-soft">{q.explanation}</span>}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SignInHint({ what }: { what: string }) {
  const path = usePathname();
  return (
    <p className="text-sm text-muted">
      <Link href={`${LOGIN_PATH}?from=${encodeURIComponent(path ?? '/')}`} className="font-semibold text-accent hover:underline">
        Sign in
      </Link>{' '}
      {what}
    </p>
  );
}

/** A lesson's progress: started when opened, completed with a button (signed-in learners only). */
export function LessonProgress({ where, lesson, signedIn, nextHref }: { where: Where; lesson: number; signedIn: boolean; nextHref: string | null }) {
  const queryClient = useQueryClient();
  const progress = useQuery({ queryKey: progressKey(where.class), queryFn: async () => (await progressApi.class(where.class)).data, enabled: signedIn, retry: false });
  const done = Boolean(progress.data?.chapters.find((c) => c.chapter === where.chapter)?.completedLessons.includes(lesson));
  const start = useMutation({ mutationFn: () => progressApi.lesson(where, lesson, 'start') });
  const complete = useMutation({
    mutationFn: () => progressApi.lesson(where, lesson, 'complete'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: progressKey(where.class) }),
  });
  useEffect(() => {
    if (signedIn) start.mutate();
    // Once per lesson opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, where.class, where.subject, where.chapter, lesson]);

  if (!signedIn || (progress.error instanceof ApiError && progress.error.status === 401)) return <SignInHint what="to save your progress and quiz scores." />;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {done || complete.isSuccess ? (
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-success">
          <CheckCircle2 aria-hidden className="h-5 w-5" />
          Lesson completed
        </p>
      ) : (
        <button
          type="button"
          onClick={() => complete.mutate()}
          disabled={complete.isPending}
          className="btn-primary inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
        >
          {complete.isPending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <CheckCircle2 aria-hidden className="h-4 w-4" />}
          Mark as complete
        </button>
      )}
      {(done || complete.isSuccess) && nextHref && (
        <Link href={nextHref} className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-foreground hover:bg-surface-hover">
          Continue
        </Link>
      )}
      {complete.isError && <p className="text-sm text-danger">Couldn&apos;t save — please try again.</p>}
    </div>
  );
}

/** A tick (or "2 / 4") next to a lesson or chapter in a list, for signed-in learners. */
export function ProgressMark({ classSlug, chapter, lesson, lessonCount, signedIn }: { classSlug: string; chapter: string; lesson?: number; lessonCount?: number; signedIn: boolean }) {
  const progress = useQuery({ queryKey: progressKey(classSlug), queryFn: async () => (await progressApi.class(classSlug)).data, enabled: signedIn, retry: false, staleTime: 15_000 });
  const row = progress.data?.chapters.find((c) => c.chapter === chapter);
  if (!signedIn || !progress.data) return null;
  if (lesson !== undefined) {
    const done = row?.completedLessons.includes(lesson);
    return done ? <CheckCircle2 aria-label="Completed" className="h-5 w-5 shrink-0 text-success" /> : <Circle aria-label="Not completed yet" className="h-5 w-5 shrink-0 text-subtle" />;
  }
  const n = row?.completedLessons.length ?? 0;
  const total = lessonCount ?? row?.lessonCount ?? 0;
  if (!total) return null;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', n === total ? 'bg-success/15 text-success' : 'bg-surface-hover text-muted')}>
      {n === total ? <CheckCircle2 aria-hidden className="h-3.5 w-3.5" /> : null}
      {n === total ? 'Done' : `${n} / ${total}`}
    </span>
  );
}

/** The learner's progress through a whole class (signed in only). */
export function ClassProgressBar({ classSlug, signedIn }: { classSlug: string; signedIn: boolean }) {
  const progress = useQuery({ queryKey: progressKey(classSlug), queryFn: async () => (await progressApi.class(classSlug)).data, enabled: signedIn, retry: false, staleTime: 15_000 });
  if (!signedIn || !progress.data || !progress.data.lessons) return null;
  const p = progress.data;
  return (
    <div className="mt-6 max-w-md">
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-semibold text-foreground">Your progress</span>
        <span className="tabular-nums text-muted">
          {p.completed} / {p.lessons} lessons · {p.percent}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent} aria-label="Class progress">
        <div className="h-full rounded-full bg-linear-to-r from-(--kg) to-(--kg-2)" style={{ width: `${p.percent}%` }} />
      </div>
    </div>
  );
}

/** A chapter's quiz: answered here, marked on the server (which alone holds the answers). */
export function ChapterQuiz({ where, questions, signedIn }: { where: Where; questions: CurriculumQuestion[]; signedIn: boolean }) {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));
  const [result, setResult] = useState<QuizResult | null>(null);
  const submit = useMutation({
    mutationFn: async () => (await progressApi.quiz(where, answers)).data,
    onSuccess: (r) => {
      setResult(r);
      void queryClient.invalidateQueries({ queryKey: progressKey(where.class) });
    },
  });
  if (!questions.length) return null;
  if (!signedIn) return <SignInHint what={`to take the ${questions.length}-question quiz and save your score.`} />;
  const unanswered = answers.filter((a) => !a.trim()).length;

  return (
    <div className="space-y-3">
      {result && (
        <div role="status" className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <Trophy aria-hidden className="h-5 w-5 text-accent" />
            You scored {result.correct} / {result.total} ({result.score}%) ⭐{result.attempts > 1 ? ` · best ${result.best}%` : ''}
          </p>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setAnswers(questions.map(() => ''));
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:bg-surface-hover"
          >
            <RotateCcw aria-hidden className="h-4 w-4" />
            Try again
          </button>
        </div>
      )}
      <ol className="space-y-3">
        {questions.map((q, i) => {
          const r = result?.results[i];
          const id = `quiz-${where.chapter}-${i}`;
          return (
            <li key={`${q.prompt}-${i}`} className={cn('rounded-2xl border bg-surface p-4', r ? (r.correct ? 'border-success/50' : 'border-(--kid-retry)/50') : 'border-border')}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {i + 1} · {TYPE_LABEL[q.type] ?? 'Question'}
              </p>
              <p id={`${id}-p`} className="mt-1 whitespace-pre-line font-medium text-foreground">
                {q.prompt}
              </p>
              {q.options.length > 0 ? (
                <div role="radiogroup" aria-labelledby={`${id}-p`} className="mt-2 flex flex-wrap gap-2">
                  {q.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      role="radio"
                      aria-checked={answers[i] === o}
                      disabled={Boolean(result)}
                      onClick={() => setAnswers((a) => a.map((x, j) => (j === i ? o : x)))}
                      className={cn('min-h-12 rounded-2xl border-2 px-4 text-base font-semibold transition active:scale-95', answers[i] === o ? 'border-accent bg-accent/10 text-foreground' : 'border-border text-foreground-soft hover:border-accent hover:bg-surface-hover')}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  aria-labelledby={`${id}-p`}
                  disabled={Boolean(result)}
                  value={answers[i]}
                  onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                  className="mt-2 w-full rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground outline-none focus-glow"
                  placeholder="Your answer"
                />
              )}
              {r && (
                <p className={cn('mt-2 flex items-start gap-1.5 text-sm', r.correct ? 'text-success' : 'text-foreground')}>
                  {r.correct ? <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> : <Lightbulb aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-(--kid-retry)" />}
                  <span>
                    {r.correct ? '🎉 Great job!' : `💡 Not quite. The answer is ${r.answer}`}
                    {r.explanation && <span className="block text-foreground-soft">{r.explanation}</span>}
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {!result && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => submit.mutate()}
            disabled={unanswered > 0 || submit.isPending}
            className="btn-primary inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
          >
            {submit.isPending && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
            Check my answers
          </button>
          {unanswered > 0 && <span className="text-sm text-muted">{unanswered} still to answer</span>}
          {submit.isError && <span className="text-sm text-danger">{submit.error instanceof ApiError && submit.error.status === 401 ? 'Please sign in again to save your score.' : 'Couldn’t check the quiz — please try again.'}</span>}
        </div>
      )}
    </div>
  );
}
