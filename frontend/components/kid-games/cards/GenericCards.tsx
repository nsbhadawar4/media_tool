'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowRight, BookOpenCheck, GraduationCap, Layers, Sparkles } from 'lucide-react';
import type { CatalogCourse } from '@/lib/api/content';
import type { ClassView, SubjectView } from '@/lib/content/catalog';

/**
 * Cards for learning content that exists only in the database — a class or subject an
 * administrator added (e.g. "Class 6", "Science"), and courses. Same shape and feel as the code
 * classes' and subjects' cards, using the colours those already define.
 */

type KidStyle = CSSProperties & Record<'--kg' | '--kg-2', string>;

/** Classes beyond 5 reuse the five class colours in turn. */
export function anyClassStyle(level: number): KidStyle {
  const slot = ((level - 1) % 5) + 1;
  return { '--kg': `var(--kid-class-${slot})`, '--kg-2': `var(--kid-class-${slot}-2)` };
}

/** Subjects without their own colour use the app accent. */
export const ANY_SUBJECT_STYLE: KidStyle = { '--kg': 'var(--accent)', '--kg-2': 'var(--accent-2)' };

const stagger = (index: number) => ({ '--i': index }) as CSSProperties;

function Art({ thumbnailUrl, children }: { thumbnailUrl: string | null; children: React.ReactNode }) {
  return (
    <div className="relative h-28 shrink-0 overflow-hidden">
      <div className="kg-gradient absolute inset-0" />
      {thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- an administrator's image from any https host
        <img src={thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
      )}
      <span aria-hidden className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/20" />
      {children}
    </div>
  );
}

export function GenericClassCard({ view, index }: { view: ClassView; index: number }) {
  return (
    <article style={{ ...anyClassStyle(view.level), ...stagger(index) }} className="kg-class-card kg-enter group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
      <Link href={`/kid-games/${view.key}`} aria-label={`${view.title}: ${view.description}`} className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)" />
      <Art thumbnailUrl={view.thumbnailUrl}>
        <span className="absolute left-4 top-3.5 rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm">{view.title}</span>
        {!view.thumbnailUrl && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/30 bg-white/15 shadow-lg backdrop-blur-sm">
              <GraduationCap aria-hidden className="h-7 w-7 text-white" strokeWidth={1.9} />
            </span>
          </span>
        )}
      </Art>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold leading-7 tracking-tight text-foreground">{view.description || view.title}</h3>
        <p className="text-sm text-muted">Courses and activities</p>
        <div aria-hidden className="min-h-5 flex-1" />
        <span className="kg-btn kg-cta inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold">
          Start Learning
          <ArrowRight aria-hidden className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  );
}

export function GenericSubjectCard({ classKey, view, courseCount, gameCount, index }: { classKey: string; view: SubjectView; courseCount: number; gameCount: number; index: number }) {
  return (
    <article style={{ ...ANY_SUBJECT_STYLE, ...stagger(index) }} className="kg-card kg-enter group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
      <Link href={`/kid-games/${classKey}/${view.key}`} aria-label={`${view.title}: ${courseCount} courses, ${gameCount} games`} className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)" />
      <Art thumbnailUrl={view.thumbnailUrl}>
        {!view.thumbnailUrl && (
          <span aria-hidden className="absolute inset-0 flex items-center px-5 text-5xl font-bold tracking-wide text-white drop-shadow-lg">
            {view.glyph ?? view.title.slice(0, 2)}
          </span>
        )}
      </Art>
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">{view.title}</h3>
          {view.description && <p className="text-sm text-muted">{view.description}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-surface-hover/70 px-1 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Courses</p>
            <p className="text-sm font-bold tabular-nums text-foreground">{courseCount}</p>
          </div>
          <div className="rounded-xl bg-surface-hover/70 px-1 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Games</p>
            <p className="text-sm font-bold tabular-nums text-foreground">{gameCount}</p>
          </div>
        </div>
        <span className="kg-btn mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-base font-bold">
          Start Learning
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      </div>
    </article>
  );
}

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

export function CourseCard({ course, gameCount, index }: { course: CatalogCourse; gameCount: number; index: number }) {
  return (
    <article style={stagger(index)} className="kg-enter group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-card transition hover:border-(--kg)">
      <Link href={`/courses/${course.slug}`} aria-label={`Course: ${course.title}`} className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)" />
      {course.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- an administrator's image from any https host
        <img src={course.thumbnailUrl} alt="" className="h-32 w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <div className="kg-gradient flex h-20 items-center px-5">
          <BookOpenCheck aria-hidden className="h-7 w-7 text-white" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
          <span className="rounded-full bg-(--kg)/15 px-2 py-0.5 text-(--kg)">Course</span>
          {course.difficulty && <span className="rounded-full bg-surface-hover px-2 py-0.5 text-muted">{DIFFICULTY_LABEL[course.difficulty]}</span>}
          {course.ageGroup && <span className="rounded-full bg-surface-hover px-2 py-0.5 text-muted">{course.ageGroup}</span>}
        </div>
        <h3 className="text-lg font-bold tracking-tight text-foreground group-hover:text-(--kg)">{course.title}</h3>
        {course.summary && <p className="line-clamp-2 text-sm text-muted">{course.summary}</p>}
        <p className="mt-auto flex items-center gap-3 pt-2 text-xs font-semibold text-subtle">
          <span className="inline-flex items-center gap-1">
            <Layers aria-hidden className="h-3.5 w-3.5" />
            {course.lessonCount} {course.lessonCount === 1 ? 'lesson' : 'lessons'}
          </span>
          {gameCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
              {gameCount} {gameCount === 1 ? 'game' : 'games'}
            </span>
          )}
        </p>
      </div>
    </article>
  );
}
