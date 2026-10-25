import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Clock, ListChecks, PencilRuler, Target } from 'lucide-react';
import { currentViewer } from '@/components/marketing/MarketingShell';
import { classVars } from '@/components/kid-games/cards/ClassCourseCard';
import { Resources } from '@/components/courses/CurriculumView';
import { ClassUnavailable } from '@/components/courses/ClassStates';
import { ChapterQuiz, ProgressMark, StudyQuestions } from '@/components/courses/LearnWidgets';
import { getPublicChapter } from '@/lib/server/contentCatalog';
import { chapterPath, classPath, formatMinutes, lessonPath, subjectPath } from '@/lib/content/learnPaths';
import { previewEmoji } from '@/lib/learn/lessonFlow';
import { ChapterStart, LessonDots } from '@/components/courses/learn/ProgressPieces';
import { siteMetadataBase } from '@/lib/site';
import { scheduleLabel, scheduleOfChapter } from '@/lib/content/academicCalendar';
import { CourseBreadcrumb } from '@/components/courses/CourseBreadcrumb';

/**
 * /classes/class-N/<subject>/<chapter> — one chapter as a short learning journey: what it teaches, its
 * lessons (each opening its own page), practice, and its quiz (marked on the server for signed-in learners). The API checks
 * that the chapter belongs to this class and subject and is published; anything else is "not found".
 */
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; subject: string; chapter: string }> };

const DIFFICULTY = { easy: 'Easy', medium: 'Medium', hard: 'Challenging' } as const;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, subject, chapter } = await params;
  const read = await getPublicChapter(slug, subject, chapter);
  const d = read.status === 'ok' ? read.data : null;
  return {
    title: d ? `${d.chapter.title} — ${d.subject.title} — ${d.class.title} — media_tool` : 'Chapter — media_tool',
    description: d?.chapter.description || 'Lessons, practice and a quiz.',
    alternates: { canonical: chapterPath(slug, subject, chapter) },
    metadataBase: await siteMetadataBase(),
  };
}

export default async function ClassChapterPage({ params }: Params) {
  const { slug, subject: subjectKey, chapter: chapterSlug } = await params;
  const read = await getPublicChapter(slug, subjectKey, chapterSlug);
  if (read.status === 'error') return <ClassUnavailable what="chapter" retryHref={chapterPath(slug, subjectKey, chapterSlug)} />;
  if (read.status === 'missing') notFound();
  const { class: cls, subject, chapter, chapters } = read.data;
  // The month the database says this chapter is taught in: the way back to the subject and class keeps it.
  const when = scheduleOfChapter(chapter);
  const signedIn = (await currentViewer()) !== 'visitor';
  const index = chapters.findIndex((c) => c.slug === chapter.slug);
  const prev = chapters[index - 1];
  const next = chapters[index + 1];
  const where = { class: cls.slug, subject: subject.key, chapter: chapter.slug };
  const practice = chapter.activities.filter((a) => a.questions.length);
  const chapterEmoji = previewEmoji([chapter.title, chapter.description, ...chapter.lessons.flatMap((l) => [l.title, ...l.examples])], 1)[0] ?? '⭐';

  return (
    <div style={classVars(cls.classLevel)} className="relative px-4 pb-20 pt-8 sm:px-6 sm:pt-12 lg:px-8">
      <div aria-hidden className="mk-hero-glow mk-hero-fade pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex max-w-3xl min-w-0 flex-col gap-6">
        <CourseBreadcrumb
          items={[
            { label: 'Courses', href: '/classes' },
            { label: cls.title, href: classPath(cls.slug, when) },
            { label: subject.title, href: subjectPath(cls.slug, subject.key, when) },
            { label: `Chapter ${index + 1}` },
          ]}
        />

        <header className="kl-tone-0 kl-tint anim-rise rounded-[2rem] border-2 p-5 shadow-card sm:p-8">
          <div className="flex items-start gap-4">
            <span aria-hidden className="kl-badge kl-float flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl text-4xl shadow-card sm:h-20 sm:w-20 sm:text-5xl">
              {chapterEmoji}
            </span>
            <div className="min-w-0">
              <p className="kl-text text-xs font-extrabold uppercase tracking-[0.16em]">
                <span aria-hidden>⭐ </span>Chapter {index + 1} of {chapters.length} · {subject.title}
              </p>
              <h1 className="mt-1 text-balance text-3xl font-extrabold leading-tight tracking-normal text-foreground sm:text-4xl">{chapter.title}</h1>
              {chapter.description && <p className="mt-2 text-lg leading-relaxed text-foreground-soft">{chapter.description}</p>}
            </div>
          </div>
          <div className="mt-5">
            <LessonDots classSlug={cls.slug} chapter={chapter.slug} lessonCount={chapter.lessons.length} signedIn={signedIn} />
          </div>
          <ul className="mt-4 flex flex-wrap gap-2 text-sm font-medium text-foreground-soft">
            <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
              <BookOpen aria-hidden className="h-4 w-4 kl-text" />
              {chapter.lessons.length} {chapter.lessons.length === 1 ? 'lesson' : 'lessons'}
            </li>
            {when && (
              <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
                <CalendarDays aria-hidden className="h-4 w-4 kl-text" />
                {scheduleLabel(when)}
              </li>
            )}
            {chapter.questionCount > 0 && (
              <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
                <ListChecks aria-hidden className="h-4 w-4 kl-text" />
                {chapter.questionCount} questions
              </li>
            )}
            {chapter.estimatedMinutes ? (
              <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
                <Clock aria-hidden className="h-4 w-4 kl-text" />
                {formatMinutes(chapter.estimatedMinutes)}
              </li>
            ) : null}
            {chapter.difficulty && (
              <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
                <Target aria-hidden className="h-4 w-4 kl-text" />
                {DIFFICULTY[chapter.difficulty]}
              </li>
            )}
          </ul>
          {chapter.lessons.length > 0 && (
            <div className="mt-6">
              <ChapterStart classSlug={cls.slug} subject={subject.key} chapter={chapter.slug} lessonCount={chapter.lessons.length} signedIn={signedIn} />
            </div>
          )}
        </header>

        {chapter.objectives.length > 0 && (
          <section aria-labelledby="chapter-goals" className="kl-tone-1 kl-tint rounded-[2rem] border-2 p-5 sm:p-7">
            <h2 id="chapter-goals" className="flex items-center gap-2 text-xl font-extrabold text-foreground sm:text-2xl">
              <span aria-hidden>🎯</span>You will learn
            </h2>
            <ul className="mt-3 space-y-2">
              {chapter.objectives.map((o) => (
                <li key={o} className="flex items-start gap-3 text-lg leading-snug text-foreground">
                  <span aria-hidden className="mt-0.5">✅</span>
                  {o}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="chapter-lessons">
          <h2 id="chapter-lessons" className="mb-4 flex items-center gap-2 text-2xl font-extrabold tracking-tight text-foreground">
            <span aria-hidden>🗺️</span>Lessons
          </h2>
          {chapter.lessons.length === 0 ? (
            <p className="rounded-3xl border-2 border-dashed border-border px-5 py-8 text-center text-base text-muted">Lessons for this chapter are on their way.</p>
          ) : (
            <ol className="grid gap-4">
              {chapter.lessons.map((lesson, i) => {
                const preview = previewEmoji([lesson.title, ...lesson.examples], 4);
                const questions = lesson.questions.length + lesson.practice.length;
                return (
                  <li key={lesson.number} className="anim-rise" style={{ '--i': i } as CSSProperties}>
                    <Link
                      href={lessonPath(cls.slug, subject.key, chapter.slug, i + 1)}
                      className={`kl-tone-${i % 4} kl-tint group flex min-h-24 items-center gap-4 rounded-[1.75rem] border-2 p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--t1) sm:p-5`}
                    >
                      <span aria-hidden className="kl-badge flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl font-extrabold tabular-nums text-white shadow-card">
                        {lesson.number}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xl font-extrabold leading-snug text-foreground [overflow-wrap:anywhere]">{lesson.title}</span>
                        {preview.length > 0 && (
                          <span aria-hidden className="mt-1 block text-3xl leading-none">
                            {preview.join(' ')}
                          </span>
                        )}
                        <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium text-foreground-soft">
                          {lesson.estimatedMinutes ? <span>⏱️ {formatMinutes(lesson.estimatedMinutes)}</span> : null}
                          {questions > 0 && <span>🎯 {questions} activities</span>}
                        </span>
                      </span>
                      <ProgressMark classSlug={cls.slug} chapter={chapter.slug} lesson={lesson.number} signedIn={signedIn} />
                      <span className="kl-badge hidden h-11 shrink-0 items-center gap-1.5 rounded-2xl px-4 text-base font-extrabold text-white sm:inline-flex">
                        Start
                        <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                      <ArrowRight aria-hidden className="h-6 w-6 shrink-0 text-muted sm:hidden" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {practice.length > 0 && (
          <section aria-labelledby="chapter-practice" className="space-y-4">
            <h2 id="chapter-practice" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
              <PencilRuler aria-hidden className="h-5 w-5 text-accent" />
              Practice
            </h2>
            {practice.map((a, i) => (
              <div key={`${a.title}-${i}`} className="space-y-2">
                <p className="font-semibold text-foreground">{a.title}</p>
                {a.instructions && <p className="text-sm text-muted">{a.instructions}</p>}
                <StudyQuestions items={a.questions} label={a.title} />
              </div>
            ))}
          </section>
        )}

        {chapter.summary && (
          <section aria-labelledby="chapter-summary" className="rounded-2xl border border-border bg-accent/10 p-5">
            <h2 id="chapter-summary" className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-foreground">
              Summary
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground-soft">{chapter.summary}</p>
          </section>
        )}

        {chapter.quiz.length > 0 && (
          <section id="quiz" aria-labelledby="chapter-quiz" className="scroll-mt-24 space-y-3">
            <h2 id="chapter-quiz" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
              <ListChecks aria-hidden className="h-5 w-5 text-accent" />
              Chapter quiz · {chapter.quiz.length} questions
            </h2>
            <ChapterQuiz where={where} questions={chapter.quiz} signedIn={signedIn} />
          </section>
        )}

        {chapter.resources && chapter.resources.length > 0 && <Resources items={chapter.resources} />}

        <nav aria-label="Chapters" className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
          {prev ? (
            <Link href={chapterPath(cls.slug, subject.key, prev.slug)} className="group flex min-h-16 flex-col justify-center rounded-2xl border border-border bg-surface px-4 py-3 transition hover:border-(--kg)">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
                Previous chapter
              </span>
              <span className="truncate font-semibold text-foreground">{prev.title}</span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next ? (
            <Link href={chapterPath(cls.slug, subject.key, next.slug)} className="group flex min-h-16 flex-col justify-center rounded-2xl border border-border bg-surface px-4 py-3 text-right transition hover:border-(--kg)">
              <span className="inline-flex items-center justify-end gap-1 text-xs font-medium text-muted">
                Next chapter
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </span>
              <span className="truncate font-semibold text-foreground">{next.title}</span>
            </Link>
          ) : (
            <Link href={subjectPath(cls.slug, subject.key, when)} className="flex min-h-16 flex-col justify-center rounded-2xl border border-border bg-surface px-4 py-3 text-right transition hover:border-(--kg)">
              <span className="text-xs font-medium text-muted">Finished the last chapter</span>
              <span className="font-semibold text-foreground">Back to {subject.title}</span>
            </Link>
          )}
        </nav>

        <div className="flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:justify-center">
          <Link href={subjectPath(cls.slug, subject.key, when)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover">
            <ArrowLeft aria-hidden className="h-4 w-4" />
            Back to {subject.title}
          </Link>
          <Link href={classPath(cls.slug, when)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover">
            Back to {cls.title}
          </Link>
        </div>
      </div>
    </div>
  );
}
