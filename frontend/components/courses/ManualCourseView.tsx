'use client';

import { useState } from 'react';
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Lightbulb } from 'lucide-react';
import type { ManualQuestion } from '@/lib/api/manualCourses';
import { OPTION_LETTERS } from '@/lib/manualCourses/builder';
import { cn } from '@/utils/cn';

export interface ManualCourseViewData {
  title: string;
  description: string;
  classTitle: string;
  subjectTitle: string;
  chapters: Array<{
    title: string;
    description: string;
    lessons: Array<{ title: string; description: string; content: string; questions: Array<Omit<ManualQuestion, 'uid'>> }>;
  }>;
}

/**
 * A manual course as learners take it: its chapters and lessons on the side, one lesson at a time with
 * its questions (answers on request), and previous / next. The admin preview shows the very same view.
 * Lesson text is shown as text (line breaks kept) — never as HTML.
 */
export function ManualCourseView({ course }: { course: ManualCourseViewData }) {
  const lessons = course.chapters.flatMap((c, ci) => c.lessons.map((l, li) => ({ ci, li, chapter: c, lesson: l })));
  const [at, setAt] = useState(0);
  const current = lessons[Math.min(at, lessons.length - 1)];

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-2xl" />
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">
          {course.classTitle} · {course.subjectTitle}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{course.title || 'Untitled course'}</h1>
        {course.description && <p className="mt-2 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-foreground-soft sm:text-base">{course.description}</p>}
        <p className="mt-4 text-xs text-muted">
          {course.chapters.length} {course.chapters.length === 1 ? 'chapter' : 'chapters'} · {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}
        </p>
      </header>

      {!current ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
          <BookOpen aria-hidden className="h-7 w-7 text-muted" />
          <p className="font-semibold text-foreground">No lessons to show yet.</p>
          <p className="text-sm text-muted">Published chapters with published lessons appear here.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <nav aria-label="Course contents" className="h-fit rounded-2xl border border-border bg-surface p-3 shadow-card lg:sticky lg:top-4">
            <ol className="space-y-3">
              {course.chapters.map((c, ci) => (
                <li key={ci}>
                  <p className="px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">Chapter {ci + 1}</p>
                  <p className="px-2 text-sm font-semibold text-foreground">{c.title}</p>
                  <ol className="mt-1 space-y-0.5">
                    {c.lessons.map((l, li) => {
                      const index = lessons.findIndex((x) => x.ci === ci && x.li === li);
                      const active = index === at;
                      return (
                        <li key={li}>
                          <button
                            type="button"
                            onClick={() => setAt(index)}
                            aria-current={active ? 'step' : undefined}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                              active ? 'bg-accent/10 font-semibold text-accent' : 'text-foreground-soft hover:bg-surface-hover',
                            )}
                          >
                            <span className="w-5 shrink-0 text-xs tabular-nums text-muted">{li + 1}.</span>
                            <span className="truncate">{l.title}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          </nav>

          <article id="manual-lesson" className="min-w-0 space-y-6">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-7">
              <p className="text-xs font-semibold text-muted">
                Chapter {current.ci + 1}: {current.chapter.title} · Lesson {current.li + 1}
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{current.lesson.title}</h2>
              {current.lesson.description && <p className="mt-2 text-sm text-foreground-soft">{current.lesson.description}</p>}
              {current.lesson.content ? (
                <div className="mt-5 whitespace-pre-line text-[15px] leading-7 text-foreground">{current.lesson.content}</div>
              ) : (
                <p className="mt-5 text-sm italic text-muted">This lesson has no content yet.</p>
              )}
            </div>

            {current.lesson.questions.length > 0 && (
              <section aria-labelledby="manual-questions" className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-7">
                <h3 id="manual-questions" className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <CircleHelp aria-hidden className="h-5 w-5 text-accent" />
                  Questions
                </h3>
                <ol className="mt-4 space-y-4">
                  {current.lesson.questions.map((q, qi) => (
                    <QuestionCard key={`${at}-${qi}`} index={qi} question={q} />
                  ))}
                </ol>
              </section>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={at === 0}
                onClick={() => setAt(at - 1)}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:opacity-40"
              >
                <ChevronLeft aria-hidden className="h-4 w-4" />
                Previous
              </button>
              <span className="text-xs tabular-nums text-muted">
                {at + 1} / {lessons.length}
              </span>
              <button
                type="button"
                disabled={at >= lessons.length - 1}
                onClick={() => setAt(at + 1)}
                className="btn-primary inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-accent-foreground disabled:opacity-40"
              >
                Next
                <ChevronRight aria-hidden className="h-4 w-4" />
              </button>
            </div>
          </article>
        </div>
      )}
    </div>
  );
}

function QuestionCard({ index, question: q }: { index: number; question: Omit<ManualQuestion, 'uid'> }) {
  const [shown, setShown] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const choices = q.type === 'mcq' ? q.options : q.type === 'true-false' ? ['True', 'False'] : [];
  return (
    <li className="rounded-xl border border-border bg-surface-elevated p-4">
      <p className="font-medium text-foreground">
        <span className="mr-1.5 text-muted">{index + 1}.</span>
        {q.prompt}
      </p>
      {choices.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {choices.map((c, ci) => {
            const right = shown && c === q.answer;
            const wrong = shown && picked === c && c !== q.answer;
            return (
              <button
                key={ci}
                type="button"
                onClick={() => setPicked(c)}
                aria-pressed={picked === c}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  right
                    ? 'border-success bg-success/10 text-foreground'
                    : wrong
                      ? 'border-danger bg-danger/10 text-foreground'
                      : picked === c
                        ? 'border-accent bg-accent/10'
                        : 'border-border hover:bg-surface-hover',
                )}
              >
                {q.type === 'mcq' && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-hover text-xs font-semibold">{OPTION_LETTERS[ci]}</span>}
                <span>{c}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-3">
        {shown ? (
          <div className="space-y-1.5 rounded-lg bg-success/5 p-3 text-sm">
            <p className="flex items-center gap-1.5 font-semibold text-success">
              <CheckCircle2 aria-hidden className="h-4 w-4" />
              Answer: {q.answer}
            </p>
            {q.explanation && (
              <p className="flex items-start gap-1.5 text-foreground-soft">
                <Lightbulb aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                {q.explanation}
              </p>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => setShown(true)} className="text-sm font-semibold text-accent hover:underline">
            Show answer
          </button>
        )}
      </div>
    </li>
  );
}
