import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, BookOpen, Clock, ListChecks, PencilRuler, Target } from 'lucide-react';
import { currentViewer } from '@/components/marketing/MarketingShell';
import { classVars } from '@/components/kid-games/cards/ClassCourseCard';
import { Resources } from '@/components/courses/CurriculumView';
import { ClassUnavailable } from '@/components/courses/ClassStates';
import { ChapterQuiz, ProgressMark, StudyQuestions } from '@/components/courses/LearnWidgets';
import { getPublicChapter } from '@/lib/server/contentCatalog';
import { chapterPath, classPath, formatMinutes, lessonPath, subjectPath } from '@/lib/content/learnPaths';
import { siteMetadataBase } from '@/lib/site';
import { CourseBreadcrumb } from '@/components/courses/CourseBreadcrumb';

/**
 * /classes/class-N/<subject>/<chapter> — one chapter: what it teaches, its lessons (each opening its
 * own page), practice, and its quiz (marked on the server for signed-in learners). The API checks
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
  const signedIn = (await currentViewer()) !== 'visitor';
  const index = chapters.findIndex((c) => c.slug === chapter.slug);
  const prev = chapters[index - 1];
  const next = chapters[index + 1];
  const where = { class: cls.slug, subject: subject.key, chapter: chapter.slug };
  const practice = chapter.activities.filter((a) => a.questions.length);

  return (
    <div style={classVars(cls.classLevel)} className="relative px-4 pb-20 pt-8 sm:px-6 sm:pt-12 lg:px-8">
      <div aria-hidden className="mk-hero-glow mk-hero-fade pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex max-w-3xl min-w-0 flex-col gap-6">
        <CourseBreadcrumb
          items={[
            { label: 'Courses', href: '/classes' },
            { label: cls.title, href: classPath(cls.slug) },
            { label: subject.title, href: subjectPath(cls.slug, subject.key) },
            { label: `Chapter ${index + 1}` },
          ]}
        />

        <header className="anim-rise rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--kg)_70%,var(--foreground))]">
            Chapter {index + 1} of {chapters.length} · {subject.title}
          </p>
          <h1 className="mt-2 text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{chapter.title}</h1>
          {chapter.description && <p className="mt-2 text-sm leading-relaxed text-foreground-soft sm:text-base">{chapter.description}</p>}
          <ul className="mt-4 flex flex-wrap gap-2 text-xs text-foreground-soft">
            <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover/60 px-2.5 py-1">
              <BookOpen aria-hidden className="h-3.5 w-3.5 text-accent" />
              {chapter.lessons.length} {chapter.lessons.length === 1 ? 'lesson' : 'lessons'}
            </li>
            {chapter.questionCount > 0 && (
              <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover/60 px-2.5 py-1">
                <ListChecks aria-hidden className="h-3.5 w-3.5 text-accent" />
                {chapter.questionCount} questions
              </li>
            )}
            {chapter.estimatedMinutes ? (
              <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover/60 px-2.5 py-1">
                <Clock aria-hidden className="h-3.5 w-3.5 text-accent" />
                {formatMinutes(chapter.estimatedMinutes)}
              </li>
            ) : null}
            {chapter.difficulty && (
              <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover/60 px-2.5 py-1">
                <Target aria-hidden className="h-3.5 w-3.5 text-accent" />
                {DIFFICULTY[chapter.difficulty]}
              </li>
            )}
          </ul>
          {chapter.lessons[0] && (
            <Link href={lessonPath(cls.slug, subject.key, chapter.slug, 1)} className="mk-btn-primary btn-primary mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-accent-foreground">
              Start learning
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          )}
        </header>

        {chapter.objectives.length > 0 && (
          <section aria-labelledby="chapter-goals" className="rounded-2xl border border-border bg-surface p-5">
            <h2 id="chapter-goals" className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-muted">
              <Target aria-hidden className="h-4 w-4 text-accent" />
              You will learn
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground-soft">
              {chapter.objectives.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="chapter-lessons">
          <h2 id="chapter-lessons" className="mb-3 text-lg font-semibold tracking-tight text-foreground">
            Lessons
          </h2>
          {chapter.lessons.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted">Lessons for this chapter are on their way.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {chapter.lessons.map((lesson) => (
                <li key={lesson.number}>
                  <Link
                    href={lessonPath(cls.slug, subject.key, chapter.slug, lesson.number)}
                    className="group flex min-h-16 items-center gap-4 rounded-2xl border border-border bg-surface p-4 transition hover:border-(--kg) hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold tabular-nums text-accent">{lesson.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-foreground">{lesson.title}</span>
                      <span className="mt-0.5 block text-xs text-subtle">
                        {[lesson.questions.length ? `${lesson.questions.length} questions` : '', lesson.practice.length ? `${lesson.practice.length} practice` : '', lesson.estimatedMinutes ? formatMinutes(lesson.estimatedMinutes) : ''].filter(Boolean).join(' · ') || 'Read the lesson'}
                      </span>
                    </span>
                    <ProgressMark classSlug={cls.slug} chapter={chapter.slug} lesson={lesson.number} signedIn={signedIn} />
                    <ArrowRight aria-hidden className="h-5 w-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                </li>
              ))}
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
            <Link href={subjectPath(cls.slug, subject.key)} className="flex min-h-16 flex-col justify-center rounded-2xl border border-border bg-surface px-4 py-3 text-right transition hover:border-(--kg)">
              <span className="text-xs font-medium text-muted">Finished the last chapter</span>
              <span className="font-semibold text-foreground">Back to {subject.title}</span>
            </Link>
          )}
        </nav>

        <div className="flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:justify-center">
          <Link href={subjectPath(cls.slug, subject.key)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover">
            <ArrowLeft aria-hidden className="h-4 w-4" />
            Back to {subject.title}
          </Link>
          <Link href={classPath(cls.slug)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover">
            Back to {cls.title}
          </Link>
        </div>
      </div>
    </div>
  );
}
