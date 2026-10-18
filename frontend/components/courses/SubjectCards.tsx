import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowRight, BookOpen, Clock, Gamepad2 } from 'lucide-react';
import type { CurriculumChapterSummary, CurriculumSubject } from '@/lib/api/adminClasses';
import { formatMinutes, subjectHasChapters, subjectPath } from '@/lib/content/learnPaths';

/**
 * A class's subjects as cards on its page. Every card opens the subject's own page — the class and
 * the subject both in the address, checked together by the API — which lists its chapters, or says
 * plainly that none are there yet. Games show only while Kid Games is on (`kidGamesOn`); they never
 * decide whether a subject opens. Colours come from the page's class colours (--kg).
 */
export function SubjectCards({ classKey, subjects, kidGamesOn }: { classKey: string; subjects: CurriculumSubject<CurriculumChapterSummary>[]; kidGamesOn: boolean }) {
  if (subjects.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted">No subjects available yet. New subjects for this class will appear here.</p>;
  }
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {subjects.map((s, i) => {
        const minutes = s.estimatedMinutes ?? s.chapters.reduce((n, c) => n + (c.estimatedMinutes ?? 0), 0);
        const games = kidGamesOn ? s.games : 0;
        const ready = subjectHasChapters(s);
        return (
          <li key={s.key} className="anim-rise" style={{ '--i': i } as CSSProperties}>
            <article className="group relative flex h-full min-w-0 flex-col gap-4 rounded-3xl border border-border bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-(--kg) hover:shadow-lift sm:p-6">
              <Link
                href={subjectPath(classKey, s.key)}
                aria-label={`${s.title}: ${s.chapters.length} ${s.chapters.length === 1 ? 'chapter' : 'chapters'}`}
                className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)"
              />
              <div className="flex items-center gap-3.5">
                <span aria-hidden className="flex h-12 min-w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-(--kg) to-(--kg-2) px-2 text-lg font-bold text-white">
                  {s.glyph || s.title.slice(0, 1)}
                </span>
                <h3 className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground">{s.title}</h3>
              </div>
              {s.description && <p className="line-clamp-3 text-sm leading-relaxed text-muted">{s.description}</p>}
              <ul className="flex flex-wrap gap-2 text-xs text-foreground-soft" aria-label={`About ${s.title}`}>
                <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover/60 px-2.5 py-1">
                  <BookOpen aria-hidden className="h-3.5 w-3.5 text-accent" />
                  {s.chapters.length} {s.chapters.length === 1 ? 'chapter' : 'chapters'}
                </li>
                {minutes > 0 && (
                  <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover/60 px-2.5 py-1">
                    <Clock aria-hidden className="h-3.5 w-3.5 text-accent" />
                    {formatMinutes(minutes)}
                  </li>
                )}
                {games > 0 && (
                  <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover/60 px-2.5 py-1">
                    <Gamepad2 aria-hidden className="h-3.5 w-3.5 text-accent" />
                    {games} {games === 1 ? 'game' : 'games'}
                  </li>
                )}
              </ul>
              <div aria-hidden className="flex-1" />
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color-mix(in_srgb,var(--kg)_70%,var(--foreground))]">
                {ready ? 'Start learning' : 'Open subject'}
                <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
