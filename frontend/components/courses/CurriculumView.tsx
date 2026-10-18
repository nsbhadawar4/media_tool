'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, Clock, ExternalLink, Gamepad2, Image as ImageIcon, Library, ListChecks, PencilRuler, Target } from 'lucide-react';
import type { CurriculumChapter, CurriculumQuestion, CurriculumSubject, FreeResource } from '@/lib/api/adminClasses';
import { cn } from '@/utils/cn';
import { formatMinutes } from '@/lib/content/learnPaths';

export { formatMinutes };

/**
 * A class's curriculum: its subjects as tabs, each with its chapters — objectives, lessons,
 * practice and quiz — and its free resources. The public class page, the admin preview and the
 * generator's preview all render this, so what an administrator previews is what visitors get.
 * Answers are shown only where `showAnswers` is set (administrators); public data has none.
 */
export function CurriculumView({ subjects, showAnswers = false, emptyText = 'Subjects for this class are on their way.' }: { subjects: CurriculumSubject[]; showAnswers?: boolean; emptyText?: string }) {
  const [active, setActive] = useState(0);
  if (subjects.length === 0) return <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted">{emptyText}</p>;
  const subject = subjects[Math.min(active, subjects.length - 1)]!;
  const minutes = subject.estimatedMinutes ?? subject.chapters.reduce((n, c) => n + (c.estimatedMinutes ?? 0), 0);

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Subjects" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {subjects.map((s, i) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors',
              i === active ? 'border-accent bg-accent/10 text-foreground' : 'border-border bg-surface text-muted hover:text-foreground',
            )}
          >
            <span aria-hidden className="text-base">
              {s.glyph || s.title.slice(0, 1)}
            </span>
            {s.title}
            {s.isVisible === false && <span className="rounded bg-surface-hover px-1.5 text-[10px] uppercase text-muted">Hidden</span>}
          </button>
        ))}
      </div>

      <section role="tabpanel" aria-label={subject.title} className="anim-rise space-y-4">
        <div className="surface-card rounded-2xl border border-border bg-surface p-5 shadow-card">
          <h3 className="text-xl font-semibold tracking-tight text-foreground">{subject.title}</h3>
          {subject.description && <p className="mt-1 text-sm text-muted">{subject.description}</p>}
          <ul className="mt-3 flex flex-wrap gap-2 text-xs text-foreground-soft">
            <Chip icon={BookOpen}>
              {subject.chapters.length} {subject.chapters.length === 1 ? 'chapter' : 'chapters'}
            </Chip>
            {minutes > 0 && <Chip icon={Clock}>{formatMinutes(minutes)}</Chip>}
            {subject.difficulty && <Chip icon={Target}>{DIFFICULTY[subject.difficulty]}</Chip>}
            {subject.games > 0 && <Chip icon={Gamepad2}>{subject.games} learning games</Chip>}
          </ul>
        </div>

        {subject.chapters.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-6 text-center text-sm text-muted">
            {subject.games > 0 ? 'This subject is learned through its games in Kid Games.' : 'Chapters for this subject are on their way.'}
          </p>
        ) : (
          <ol className="space-y-3">
            {subject.chapters.map((c, i) => (
              <ChapterCard key={`${c.title}-${i}`} chapter={c} index={i} showAnswers={showAnswers} />
            ))}
          </ol>
        )}

        {subject.resources.length > 0 && <Resources items={subject.resources} />}
      </section>
    </div>
  );
}

const DIFFICULTY = { easy: 'Easy', medium: 'Medium', hard: 'Challenging' } as const;


function Chip({ icon: Icon, children }: { icon: typeof BookOpen; children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover/60 px-2.5 py-1">
      <Icon aria-hidden className="h-3.5 w-3.5 text-accent" />
      {children}
    </li>
  );
}

function ChapterCard({ chapter: c, index, showAnswers }: { chapter: CurriculumChapter; index: number; showAnswers: boolean }) {
  return (
    <li>
      <details className="group surface-card rounded-2xl border border-border bg-surface shadow-card open:shadow-lift">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-sm font-bold text-accent">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold text-foreground">{c.title}</span>
              {c.draft ? (
                <span className="shrink-0 rounded bg-sky-500/15 px-1.5 text-[10px] font-semibold uppercase text-sky-600 dark:text-sky-300">Draft</span>
              ) : (
                c.isVisible === false && <span className="shrink-0 rounded bg-surface-hover px-1.5 text-[10px] font-semibold uppercase text-muted">Hidden</span>
              )}
            </span>
            {c.description && <span className="block truncate text-sm text-muted">{c.description}</span>}
          </span>
          <span className="hidden shrink-0 text-xs text-muted sm:block">
            {c.lessons.length} lessons · {c.questionCount ?? 0} questions{c.estimatedMinutes ? ` · ${formatMinutes(c.estimatedMinutes)}` : ''}
          </span>
          <ChevronDown aria-hidden className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-5 border-t border-border px-4 pb-5 pt-4 sm:px-5">
          {c.objectives.length > 0 && (
            <Block icon={Target} title="Learning objectives">
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground-soft">
                {c.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </Block>
          )}
          {c.lessons.length > 0 && (
            <Block icon={BookOpen} title="Lessons">
              <ol className="space-y-3">
                {c.lessons.map((l, i) => (
                  <li key={`${l.title}-${i}`} className="rounded-xl border border-border bg-surface-elevated/60 p-3">
                    <p className="text-sm font-semibold text-foreground">
                      {i + 1}. {l.title}
                    </p>
                    {l.explanation && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{l.explanation}</p>}
                    {l.examples.length > 0 && (
                      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-foreground-soft">
                        {l.examples.map((x, j) => (
                          <li key={`${x}-${j}`}>{x}</li>
                        ))}
                      </ul>
                    )}
                    {l.keyPoints.length > 0 && <p className="mt-2 text-xs text-muted">Key points: {l.keyPoints.join(' · ')}</p>}
                    {l.questions.length > 0 && <Questions items={l.questions} showAnswers={showAnswers} />}
                    {l.practice.length > 0 && (
                      <>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted">Practice</p>
                        <Questions items={l.practice} showAnswers={showAnswers} />
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </Block>
          )}
          {c.activities.length > 0 && (
            <Block icon={PencilRuler} title="Practice">
              <div className="grid gap-3 lg:grid-cols-2">
                {c.activities.map((a, i) => (
                  <div key={`${a.title}-${i}`} className="rounded-xl border border-border bg-surface-elevated/60 p-3">
                    <p className="text-sm font-semibold text-foreground">{a.title}</p>
                    {a.instructions && <p className="text-xs text-muted">{a.instructions}</p>}
                    <Questions items={a.questions} showAnswers={showAnswers} />
                  </div>
                ))}
              </div>
            </Block>
          )}
          {c.quiz.length > 0 && (
            <Block icon={ListChecks} title={`Quiz · ${c.quiz.length} questions`}>
              <Questions items={c.quiz} showAnswers={showAnswers} />
            </Block>
          )}
          {c.resources && c.resources.length > 0 && <Resources items={c.resources} />}
        </div>
      </details>
    </li>
  );
}

function Block({ icon: Icon, title, children }: { icon: typeof BookOpen; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">
        <Icon aria-hidden className="h-4 w-4 text-accent" />
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * A chapter's objectives, practice, quiz and resources for a signed-in learner (the course page):
 * each answer stays hidden until the learner chooses to check it.
 */
export function PracticeAndQuiz({ chapter }: { chapter: Pick<CurriculumChapter, 'objectives' | 'activities' | 'quiz' | 'resources'> }) {
  if (!chapter.objectives.length && !chapter.activities.length && !chapter.quiz.length && !chapter.resources?.length) return null;
  return (
    <div className="space-y-5">
      {chapter.objectives.length > 0 && (
        <Block icon={Target} title="Learning objectives">
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground-soft">
            {chapter.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </Block>
      )}
      {chapter.activities.length > 0 && (
        <Block icon={PencilRuler} title="Practice">
          <div className="grid gap-3 lg:grid-cols-2">
            {chapter.activities.map((a, i) => (
              <div key={`${a.title}-${i}`} className="rounded-2xl border border-border bg-surface p-4">
                <p className="text-sm font-semibold text-foreground">{a.title}</p>
                {a.instructions && <p className="text-xs text-muted">{a.instructions}</p>}
                <Questions items={a.questions} showAnswers={false} reveal />
              </div>
            ))}
          </div>
        </Block>
      )}
      {chapter.quiz.length > 0 && (
        <Block icon={ListChecks} title={`Quiz · ${chapter.quiz.length} questions`}>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <Questions items={chapter.quiz} showAnswers={false} reveal />
          </div>
        </Block>
      )}
      {chapter.resources && chapter.resources.length > 0 && <Resources items={chapter.resources} />}
    </div>
  );
}

function Questions({ items, showAnswers, reveal = false }: { items: CurriculumQuestion[]; showAnswers: boolean; reveal?: boolean }) {
  return (
    <ol className="mt-2 space-y-2 text-sm">
      {items.map((q, i) => (
        <li key={`${q.prompt}-${i}`} className="text-foreground-soft">
          <span className="font-medium text-foreground">{i + 1}.</span> {q.prompt}
          {q.options.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1.5">
              {q.options.map((o) => (
                <span key={o} className={cn('rounded-lg border px-2 py-0.5 text-xs', showAnswers && o === q.answer ? 'border-accent bg-accent/10 text-foreground' : 'border-border text-muted')}>
                  {o}
                </span>
              ))}
            </span>
          )}
          {showAnswers && q.answer && q.options.length === 0 && <span className="ml-1 text-xs font-medium text-accent">→ {q.answer}</span>}
          {reveal && q.answer && (
            <details className="mt-1">
              <summary className="inline-flex min-h-8 cursor-pointer list-none items-center text-xs font-semibold text-accent [&::-webkit-details-marker]:hidden">Show answer</summary>
              <span className="ml-1 text-xs font-medium text-foreground">{q.answer}</span>
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Free resources, by reference: they open on their own sites, in a new tab. */
export function Resources({ items }: { items: FreeResource[] }) {
  return (
    <div className="surface-card rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Library aria-hidden className="h-4 w-4 text-accent" />
        Free Resources
      </p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((r) => (
          <li key={r.url} className="flex min-w-0 gap-3 rounded-xl border border-border bg-surface-elevated/60 p-3">
            <span className="relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-hover text-muted">
              {r.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a thumbnail from the resource's own (openly licensed) source
                <img src={r.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
              ) : r.type === 'image' ? (
                <ImageIcon aria-hidden className="h-5 w-5" />
              ) : (
                <BookOpen aria-hidden className="h-5 w-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium uppercase tracking-wider text-muted">{r.type === 'book' ? '📚 Recommended reading' : r.type === 'image' ? '🖼️ Educational image' : '🔗 Resource'}</span>
              <span className="line-clamp-2 text-sm font-medium text-foreground">{r.title}</span>
              <span className="block truncate text-xs text-muted">{[r.author, r.source].filter(Boolean).join(' · ')}</span>
              {r.license && <span className="block truncate text-[11px] text-subtle">{r.license}</span>}
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                {r.type === 'image' ? 'View Resource' : 'Open Resource'}
                <ExternalLink aria-hidden className="h-3 w-3" />
              </a>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
