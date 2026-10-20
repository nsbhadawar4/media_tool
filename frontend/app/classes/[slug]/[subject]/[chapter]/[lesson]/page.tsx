import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, BookOpen, Clock, Lightbulb, ListChecks, PencilRuler, Sparkles } from 'lucide-react';
import { currentViewer } from '@/components/marketing/MarketingShell';
import { classVars } from '@/components/kid-games/cards/ClassCourseCard';
import { ClassUnavailable } from '@/components/courses/ClassStates';
import { LessonProgress, StudyQuestions } from '@/components/courses/LearnWidgets';
import { getPublicChapter } from '@/lib/server/contentCatalog';
import { chapterPath, classPath, formatMinutes, lessonPath, subjectPath } from '@/lib/content/learnPaths';
import { siteMetadataBase } from '@/lib/site';
import { CourseBreadcrumb } from '@/components/courses/CourseBreadcrumb';

/**
 * /classes/class-N/<subject>/<chapter>/<n> — one lesson: its explanation, examples and key points,
 * its questions (answers shown on request) and practice. Signed-in learners' progress is recorded
 * (started when opened, completed with a button); the last lesson leads on to the chapter quiz.
 */
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; subject: string; chapter: string; lesson: string }> };

const lessonNumber = (raw: string) => (/^\d{1,2}$/.test(raw) ? Number(raw) : NaN);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, subject, chapter, lesson } = await params;
  const read = await getPublicChapter(slug, subject, chapter);
  const l = read.status === 'ok' ? read.data.chapter.lessons[lessonNumber(lesson) - 1] : undefined;
  return {
    title: l && read.status === 'ok' ? `${l.title} — ${read.data.chapter.title} — ${read.data.class.title} — media_tool` : 'Lesson — media_tool',
    description: l?.explanation.slice(0, 160) || 'A lesson with examples and questions.',
    alternates: { canonical: `${chapterPath(slug, subject, chapter)}/${lesson}` },
    metadataBase: await siteMetadataBase(),
  };
}

export default async function LessonPage({ params }: Params) {
  const { slug, subject: subjectKey, chapter: chapterSlug, lesson: raw } = await params;
  const n = lessonNumber(raw);
  if (!Number.isInteger(n) || n < 1) notFound();
  const read = await getPublicChapter(slug, subjectKey, chapterSlug);
  if (read.status === 'error') return <ClassUnavailable what="chapter" retryHref={`${chapterPath(slug, subjectKey, chapterSlug)}/${raw}`} />;
  if (read.status === 'missing') notFound();
  const { class: cls, subject, chapter, chapters } = read.data;
  const chapterNo = chapters.findIndex((c) => c.slug === chapter.slug) + 1;
  const lesson = chapter.lessons[n - 1];
  if (!lesson) notFound();
  const signedIn = (await currentViewer()) !== 'visitor';
  const total = chapter.lessons.length;
  const prevHref = n > 1 ? lessonPath(cls.slug, subject.key, chapter.slug, n - 1) : null;
  const nextHref = n < total ? lessonPath(cls.slug, subject.key, chapter.slug, n + 1) : chapter.quiz.length ? `${chapterPath(cls.slug, subject.key, chapter.slug)}#quiz` : null;
  const where = { class: cls.slug, subject: subject.key, chapter: chapter.slug };

  return (
    <div style={classVars(cls.classLevel)} className="relative px-4 pb-20 pt-8 sm:px-6 sm:pt-12 lg:px-8">
      <div aria-hidden className="mk-hero-glow mk-hero-fade pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex max-w-3xl min-w-0 flex-col gap-6">
        <CourseBreadcrumb
          items={[
            { label: 'Courses', href: '/classes' },
            { label: cls.title, href: classPath(cls.slug) },
            { label: subject.title, href: subjectPath(cls.slug, subject.key) },
            { label: chapterNo > 0 ? `Chapter ${chapterNo}` : chapter.title, href: chapterPath(cls.slug, subject.key, chapter.slug) },
            { label: `Lesson ${n}` },
          ]}
        />

        <header className="anim-rise rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--kg)_70%,var(--foreground))]">
            Lesson {n} of {total} · {chapter.title}
          </p>
          <h1 className="mt-2 text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{lesson.title}</h1>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={n} aria-label="Position in the chapter">
            <div className="h-full rounded-full bg-linear-to-r from-(--kg) to-(--kg-2)" style={{ width: `${Math.round((n / total) * 100)}%` }} />
          </div>
          {lesson.estimatedMinutes ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted">
              <Clock aria-hidden className="h-3.5 w-3.5" />
              About {formatMinutes(lesson.estimatedMinutes)}
            </p>
          ) : null}
        </header>

        <section aria-labelledby="lesson-learn" className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
          <h2 id="lesson-learn" className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
            <BookOpen aria-hidden className="h-5 w-5 text-accent" />
            Learn
          </h2>
          {lesson.explanation ? (
            <p className="whitespace-pre-line text-base leading-relaxed text-foreground-soft [overflow-wrap:anywhere]">{lesson.explanation}</p>
          ) : (
            <p className="text-sm text-muted">This lesson&apos;s explanation is on its way.</p>
          )}
          {lesson.examples.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-muted">
                <Sparkles aria-hidden className="h-4 w-4 text-accent" />
                Examples
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {lesson.examples.map((x, i) => (
                  <li key={`${x}-${i}`} className="rounded-xl border border-border bg-surface-elevated/60 px-4 py-3 text-sm text-foreground [overflow-wrap:anywhere]">
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lesson.keyPoints.length > 0 && (
            <div className="mt-6 rounded-2xl bg-accent/10 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-foreground">
                <Lightbulb aria-hidden className="h-4 w-4 text-accent" />
                Remember
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground-soft">
                {lesson.keyPoints.map((x, i) => (
                  <li key={`${x}-${i}`}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {lesson.questions.length > 0 && (
          <section aria-labelledby="lesson-questions" className="space-y-3">
            <h2 id="lesson-questions" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
              <ListChecks aria-hidden className="h-5 w-5 text-accent" />
              Questions
            </h2>
            <StudyQuestions items={lesson.questions} label="Questions" />
          </section>
        )}
        {lesson.practice.length > 0 && (
          <section aria-labelledby="lesson-practice" className="space-y-3">
            <h2 id="lesson-practice" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
              <PencilRuler aria-hidden className="h-5 w-5 text-accent" />
              Practice
            </h2>
            <StudyQuestions items={lesson.practice} label="Practice" />
          </section>
        )}

        <div className="rounded-2xl border border-border bg-surface p-4">
          <LessonProgress where={where} lesson={n} signedIn={signedIn} nextHref={nextHref} />
        </div>

        <nav aria-label="Lessons" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {prevHref ? (
            <Link href={prevHref} className="group flex min-h-16 flex-col justify-center rounded-2xl border border-border bg-surface px-4 py-3 transition hover:border-(--kg)">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
                Previous lesson
              </span>
              <span className="truncate font-semibold text-foreground">{chapter.lessons[n - 2]!.title}</span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {n < total ? (
            <Link href={nextHref!} className="group flex min-h-16 flex-col justify-center rounded-2xl border border-border bg-surface px-4 py-3 text-right transition hover:border-(--kg)">
              <span className="inline-flex items-center justify-end gap-1 text-xs font-medium text-muted">
                Next lesson
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </span>
              <span className="truncate font-semibold text-foreground">{chapter.lessons[n]!.title}</span>
            </Link>
          ) : (
            <Link href={nextHref ?? chapterPath(cls.slug, subject.key, chapter.slug)} className="flex min-h-16 flex-col justify-center rounded-2xl border border-border bg-surface px-4 py-3 text-right transition hover:border-(--kg)">
              <span className="text-xs font-medium text-muted">Last lesson done</span>
              <span className="font-semibold text-foreground">{chapter.quiz.length ? 'Take the chapter quiz' : `Back to ${chapter.title}`}</span>
            </Link>
          )}
        </nav>

        <div className="flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:justify-center">
          <Link href={chapterPath(cls.slug, subject.key, chapter.slug)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover">
            <ArrowLeft aria-hidden className="h-4 w-4" />
            Back to the chapter
          </Link>
          <Link href={subjectPath(cls.slug, subject.key)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover">
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
