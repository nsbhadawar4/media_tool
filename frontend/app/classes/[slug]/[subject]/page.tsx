import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, BookOpen, Clock, Gamepad2, ListChecks, Target } from 'lucide-react';
import { currentViewer } from '@/components/marketing/MarketingShell';
import { classVars } from '@/components/kid-games/cards/ClassCourseCard';
import { Resources } from '@/components/courses/CurriculumView';
import { ProgressMark } from '@/components/courses/LearnWidgets';
import { ClassUnavailable } from '@/components/courses/ClassStates';
import { getPublicClassSubject, getPublicCurriculum, getPublicManualCourses, getServerCatalog } from '@/lib/server/contentCatalog';
import { isSectionOn } from '@/lib/content/sections';
import { chapterPath, classPath, formatMinutes, subjectPath } from '@/lib/content/learnPaths';
import { LOGIN_PATH } from '@/lib/auth/routes';
import { siteMetadataBase } from '@/lib/site';
import { CourseBreadcrumb } from '@/components/courses/CourseBreadcrumb';

/**
 * /classes/class-N/<subject> — one subject as this class teaches it: its chapters (each opening
 * its own page), free resources and, while Kid Games is on, the way to its games. The API checks
 * that the class offers the subject (and that both are public), so Class 6's Hindi is never
 * another class's Hindi; anything else is "not found".
 */
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; subject: string }> };

const DIFFICULTY = { easy: 'Easy', medium: 'Medium', hard: 'Challenging' } as const;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, subject } = await params;
  const read = await getPublicClassSubject(slug, subject);
  const data = read.status === 'ok' ? read.data : null;
  return {
    title: data ? `${data.subject.title} — ${data.class.title} — media_tool` : 'Subject — media_tool',
    description: data?.subject.description || 'Structured lessons, practice and quizzes.',
    alternates: { canonical: subjectPath(slug, subject) },
    metadataBase: await siteMetadataBase(),
  };
}

export default async function ClassSubjectPage({ params }: Params) {
  const { slug, subject: subjectKey } = await params;
  // The class's other subjects too, for previous / next (the same public data as the class page).
  const [raw, read, curriculum, manual] = await Promise.all([getServerCatalog(), getPublicClassSubject(slug, subjectKey), getPublicCurriculum(slug), getPublicManualCourses(slug, subjectKey)]);
  if (read.status === 'error') return <ClassUnavailable what="subject" retryHref={subjectPath(slug, subjectKey)} />;
  if (read.status === 'missing') notFound();
  const { class: cls, subject } = read.data;
  const kidGamesOpen = isSectionOn(raw, 'kid-games');
  const games = kidGamesOpen ? subject.games : 0;
  const chapters = subject.chapters.filter((c) => c.slug);
  const minutes = subject.estimatedMinutes ?? chapters.reduce((n, c) => n + (c.estimatedMinutes ?? 0), 0);
  const signedIn = (await currentViewer()) !== 'visitor';
  const gamesPath = `/kid-games/${cls.slug}/${subject.key}`;
  const gamesHref = signedIn ? gamesPath : `${LOGIN_PATH}?from=${gamesPath}`;
  const siblings = curriculum.status === 'ok' ? curriculum.data.subjects : [];
  const at = siblings.findIndex((s) => s.key === subject.key);
  const prevSubject = at > 0 ? siblings[at - 1] : undefined;
  const nextSubject = at >= 0 ? siblings[at + 1] : undefined;
  // Courses written by hand in Admin → Manual Courses, published and visible (an extra: never required).
  const manualCourses = manual.status === 'ok' ? manual.data : [];

  return (
    <div style={classVars(cls.classLevel)} className="relative px-4 pb-20 pt-8 sm:px-6 sm:pt-12 lg:px-8">
      <div aria-hidden className="mk-hero-glow mk-hero-fade pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-4xl">
        <div className="mb-6">
          <CourseBreadcrumb items={[{ label: 'Courses', href: '/classes' }, { label: cls.title, href: classPath(cls.slug) }, { label: subject.title }]} />
        </div>

        <header className="anim-rise flex flex-col gap-5 sm:flex-row sm:items-center">
          <span aria-hidden className="kl-tone-0 kl-badge kl-float flex h-20 min-w-20 shrink-0 items-center justify-center self-start rounded-3xl px-3 text-4xl font-extrabold text-white shadow-card sm:self-auto">
            {subject.glyph || subject.title.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--kg)_70%,var(--foreground))]">{cls.title} · Subject</p>
            <h1 className="mt-1 text-4xl font-extrabold tracking-normal text-foreground sm:text-5xl">{subject.title}</h1>
            {subject.description && <p className="mt-2 text-base leading-relaxed text-foreground-soft">{subject.description}</p>}
          </div>
        </header>

        <ul className="mt-6 flex flex-wrap gap-2 text-sm" aria-label={`About ${subject.title}`}>
          <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-foreground-soft">
            <BookOpen aria-hidden className="h-4 w-4 text-accent" />
            {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}
          </li>
          {minutes > 0 && (
            <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-foreground-soft">
              <Clock aria-hidden className="h-4 w-4 text-accent" />
              {formatMinutes(minutes)}
            </li>
          )}
          {subject.difficulty && (
            <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-foreground-soft">
              <Target aria-hidden className="h-4 w-4 text-accent" />
              {DIFFICULTY[subject.difficulty]}
            </li>
          )}
          {games > 0 && (
            <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-foreground-soft">
              <Gamepad2 aria-hidden className="h-4 w-4 text-accent" />
              {games} learning {games === 1 ? 'game' : 'games'}
            </li>
          )}
        </ul>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {chapters[0] && (
            <Link href={chapterPath(cls.slug, subject.key, chapters[0].slug!)} className="mk-btn-primary btn-primary inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-accent-foreground">
              Start learning
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          )}
          {/* Games are an extra, only while Kid Games is on — they never decide whether the subject opens. */}
          {games > 0 && (
            <Link href={gamesHref} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover">
              <Gamepad2 aria-hidden className="h-4 w-4" />
              {signedIn ? `Play ${subject.title} games` : `Sign in to play ${subject.title} games`}
            </Link>
          )}
        </div>

        <section aria-labelledby="subject-chapters" className="mt-12">
          <h2 id="subject-chapters" className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-foreground">
            <span aria-hidden>🗺️</span>Chapters
          </h2>
          {chapters.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-border px-6 py-10 text-center">
              <BookOpen aria-hidden className="mx-auto h-8 w-8 text-muted" />
              <p className="mt-3 font-semibold text-foreground">Course content is being prepared.</p>
              <p className="mt-1 text-sm text-muted">
                {games > 0 ? `Meanwhile, ${subject.title} in ${cls.title} can be learned through its games.` : `Chapters for ${subject.title} in ${cls.title} will appear here.`}
              </p>
              <Link href={classPath(cls.slug)} className="mt-5 inline-flex h-11 items-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover">
                See other subjects
              </Link>
            </div>
          ) : (
            <ol className="mt-6 grid gap-4">
              {chapters.map((c, i) => (
                <li key={c.slug} className="anim-rise" style={{ '--i': i } as CSSProperties}>
                  <Link
                    href={chapterPath(cls.slug, subject.key, c.slug!)}
                    className={`kl-tone-${i % 4} kl-tint group flex min-h-24 items-center gap-4 rounded-[1.75rem] border-2 p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--t1) sm:p-5`}
                  >
                    <span aria-hidden className="kl-badge flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-extrabold tabular-nums text-white shadow-card">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xl font-extrabold leading-snug text-foreground [overflow-wrap:anywhere]">{c.title}</span>
                      {c.description && <span className="mt-0.5 line-clamp-2 block text-base text-foreground-soft">{c.description}</span>}
                      <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium text-foreground-soft">
                        <span className="inline-flex items-center gap-1">
                          <BookOpen aria-hidden className="h-4 w-4" />
                          {c.lessonCount} {c.lessonCount === 1 ? 'lesson' : 'lessons'}
                        </span>
                        {c.questionCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <ListChecks aria-hidden className="h-4 w-4" />
                            {c.questionCount} questions
                          </span>
                        )}
                        {c.estimatedMinutes ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock aria-hidden className="h-4 w-4" />
                            {formatMinutes(c.estimatedMinutes)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <ProgressMark classSlug={cls.slug} chapter={c.slug} lessonCount={c.lessonCount} signedIn={signedIn} />
                    <ArrowRight aria-hidden className="h-6 w-6 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        {manualCourses.length > 0 && (
          <section aria-labelledby="subject-manual-courses" className="mt-12">
            <h2 id="subject-manual-courses" className="text-2xl font-semibold tracking-tight text-foreground">
              More courses
            </h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {manualCourses.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`${subjectPath(cls.slug, subject.key)}/manual/${c.slug}`}
                    className="group flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-card transition hover:border-(--kg) hover:shadow-lift sm:p-5"
                  >
                    <span className="font-semibold text-foreground">{c.title}</span>
                    {c.description && <span className="line-clamp-2 text-sm text-muted">{c.description}</span>}
                    <span className="mt-auto flex items-center gap-3 text-xs text-subtle">
                      <span className="inline-flex items-center gap-1">
                        <BookOpen aria-hidden className="h-3.5 w-3.5" />
                        {c.chapters} {c.chapters === 1 ? 'chapter' : 'chapters'} · {c.lessons} {c.lessons === 1 ? 'lesson' : 'lessons'}
                      </span>
                      <ArrowRight aria-hidden className="ml-auto h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(prevSubject || nextSubject) && (
          <nav aria-label="Subjects" className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {prevSubject ? (
              <Link href={subjectPath(cls.slug, prevSubject.key)} className="flex min-h-16 flex-col justify-center rounded-2xl border border-border bg-surface px-4 py-3 transition hover:border-(--kg)">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                  <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
                  Previous subject
                </span>
                <span className="truncate font-semibold text-foreground">{prevSubject.title}</span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {nextSubject && (
              <Link href={subjectPath(cls.slug, nextSubject.key)} className="flex min-h-16 flex-col justify-center rounded-2xl border border-border bg-surface px-4 py-3 text-right transition hover:border-(--kg)">
                <span className="inline-flex items-center justify-end gap-1 text-xs font-medium text-muted">
                  Next subject
                  <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                </span>
                <span className="truncate font-semibold text-foreground">{nextSubject.title}</span>
              </Link>
            )}
          </nav>
        )}

        {subject.resources.length > 0 && (
          <section aria-label="Free resources" className="mt-10">
            <Resources items={subject.resources} />
          </section>
        )}
      </div>
    </div>
  );
}
