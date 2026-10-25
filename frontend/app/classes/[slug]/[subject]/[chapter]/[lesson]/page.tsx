import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { currentViewer } from '@/components/marketing/MarketingShell';
import { classVars } from '@/components/kid-games/cards/ClassCourseCard';
import { ClassUnavailable } from '@/components/courses/ClassStates';
import { KidLesson } from '@/components/courses/learn/KidLesson';
import { getPublicChapter } from '@/lib/server/contentCatalog';
import { chapterPath, classPath, lessonPath, parseLessonParam, subjectPath } from '@/lib/content/learnPaths';
import { siteMetadataBase } from '@/lib/site';
import { scheduleOfChapter } from '@/lib/content/academicCalendar';
import { CourseBreadcrumb } from '@/components/courses/CourseBreadcrumb';

/**
 * /classes/class-N/<subject>/<chapter>/<n> — one lesson, played as a guided flow (see KidLesson):
 * explanation, examples, then each question and practice one at a time with kind feedback and
 * stars. Signed-in learners' progress is recorded (started when opened, completed at the end); the
 * last lesson leads on to the chapter quiz. The content is the lesson's database record, as written.
 */
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; subject: string; chapter: string; lesson: string }> };

const lessonNumber = parseLessonParam;

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
  // The month the database says this chapter is taught in: the way back to the subject and class keeps it.
  const when = scheduleOfChapter(chapter);
  const chapterNo = chapters.findIndex((c) => c.slug === chapter.slug) + 1;
  const lesson = chapter.lessons[n - 1];
  if (!lesson) notFound();
  const signedIn = (await currentViewer()) !== 'visitor';
  const total = chapter.lessons.length;
  const prevHref = n > 1 ? lessonPath(cls.slug, subject.key, chapter.slug, n - 1) : null;
  const nextHref = n < total ? lessonPath(cls.slug, subject.key, chapter.slug, n + 1) : chapter.quiz.length ? `${chapterPath(cls.slug, subject.key, chapter.slug)}#quiz` : null;
  const where = { class: cls.slug, subject: subject.key, chapter: chapter.slug };

  return (
    <div style={classVars(cls.classLevel)} className="relative px-4 pb-24 pt-6 sm:px-6 sm:pt-10 lg:px-8">
      <div aria-hidden className="mk-hero-glow mk-hero-fade pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex max-w-3xl min-w-0 flex-col gap-5">
        <CourseBreadcrumb
          items={[
            { label: 'Courses', href: '/classes' },
            { label: cls.title, href: classPath(cls.slug, when) },
            { label: subject.title, href: subjectPath(cls.slug, subject.key, when) },
            { label: chapterNo > 0 ? `Chapter ${chapterNo}` : chapter.title, href: chapterPath(cls.slug, subject.key, chapter.slug) },
            { label: `Lesson ${n}` },
          ]}
        />

        {/* The guided, playful lesson. The content is this lesson's own database record; `key` starts a
            fresh lesson (step, stars) whenever the address moves to another one. */}
        <KidLesson
          key={`${chapter.slug}-${n}`}
          lesson={lesson}
          total={total}
          chapterTitle={chapter.title}
          where={where}
          signedIn={signedIn}
          young={cls.classLevel <= 3}
          prevHref={prevHref}
          nextHref={n < total ? nextHref : null}
          nextTitle={n < total ? chapter.lessons[n]!.title : null}
          afterHref={nextHref ?? chapterPath(cls.slug, subject.key, chapter.slug)}
          hasQuiz={chapter.quiz.length > 0}
        />

        <div className="flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:justify-center">
          <Link href={chapterPath(cls.slug, subject.key, chapter.slug)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover">
            <ArrowLeft aria-hidden className="h-4 w-4" />
            Back to the chapter
          </Link>
          <Link href={subjectPath(cls.slug, subject.key, when)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover">
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
