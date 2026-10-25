import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowRight, BookOpen, Clock, Gamepad2, ListChecks } from 'lucide-react';
import type { CurriculumChapterSummary, CurriculumSubject } from '@/lib/api/adminClasses';
import { formatMinutes, subjectHasChapters, subjectPath } from '@/lib/content/learnPaths';
import type { Schedule } from '@/lib/content/academicCalendar';
import { SubjectProgress } from '@/components/courses/learn/ProgressPieces';

/**
 * A class's subjects as cards on its page. Every card opens the subject's own page — the class and
 * the subject both in the address, checked together by the API — which lists its chapters, or says
 * plainly that none are there yet. Games show only while Kid Games is on (`kidGamesOn`); they never
 * decide whether a subject opens. Colours come from the page's class colours (--kg), with three fixed
 * companion tones so neighbouring cards differ; each card shows the learner's own progress when signed in.
 */
export function SubjectCards({ classKey, subjects, kidGamesOn, signedIn = false, schedule = null }: { classKey: string; subjects: CurriculumSubject<CurriculumChapterSummary>[]; kidGamesOn: boolean; signedIn?: boolean; schedule?: Schedule | null }) {
  if (subjects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
        <p className="font-semibold text-foreground">No subjects are available for this class yet.</p>
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {subjects.map((s, i) => {
        // A month's card shows that month's time; the subject's own estimate is for the whole subject.
        const chapterMinutes = s.chapters.reduce((n, c) => n + (c.estimatedMinutes ?? 0), 0);
        const minutes = schedule ? chapterMinutes : (s.estimatedMinutes ?? chapterMinutes);
        const lessons = s.chapters.reduce((n, c) => n + c.lessonCount, 0);
        const games = kidGamesOn ? s.games : 0;
        const ready = subjectHasChapters(s);
        const chip = 'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground-soft';
        return (
          <li key={s.key} className="anim-rise" style={{ '--i': i } as CSSProperties}>
            <article className={`kl-tone-${i % 4} kl-tint group relative flex h-full min-w-0 flex-col gap-4 overflow-hidden rounded-[2rem] border-2 p-5 shadow-card transition duration-200 hover:-translate-y-1 hover:shadow-lift focus-within:-translate-y-1 sm:p-6`}>
              <Link
                href={subjectPath(classKey, s.key, schedule)}
                aria-label={`${s.title}: ${s.chapters.length} ${s.chapters.length === 1 ? 'chapter' : 'chapters'}`}
                className="absolute inset-0 z-10 rounded-[2rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--t1)"
              />
              <div className="flex items-center gap-4">
                <span aria-hidden className="kl-badge kl-float flex h-16 min-w-16 shrink-0 items-center justify-center rounded-3xl px-3 text-3xl font-extrabold text-white shadow-card" style={{ '--i': i } as CSSProperties}>
                  {s.glyph || s.title.slice(0, 1)}
                </span>
                <h3 className="min-w-0 text-2xl font-extrabold leading-tight tracking-normal text-foreground [overflow-wrap:anywhere]">{s.title}</h3>
              </div>
              {s.description && <p className="line-clamp-3 text-base leading-relaxed text-foreground-soft">{s.description}</p>}
              <ul className="flex flex-wrap gap-2" aria-label={`About ${s.title}`}>
                <li className={chip}>
                  <BookOpen aria-hidden className="h-4 w-4 kl-text" />
                  {s.chapters.length} {s.chapters.length === 1 ? 'chapter' : 'chapters'}
                </li>
                {lessons > 0 && (
                  <li className={chip}>
                    <ListChecks aria-hidden className="h-4 w-4 kl-text" />
                    {lessons} {lessons === 1 ? 'lesson' : 'lessons'}
                  </li>
                )}
                {minutes > 0 && (
                  <li className={chip}>
                    <Clock aria-hidden className="h-4 w-4 kl-text" />
                    {formatMinutes(minutes)}
                  </li>
                )}
                {games > 0 && (
                  <li className={chip}>
                    <Gamepad2 aria-hidden className="h-4 w-4 kl-text" />
                    {games} {games === 1 ? 'game' : 'games'}
                  </li>
                )}
              </ul>
              {ready ? (
                <SubjectProgress classSlug={classKey} subject={s.key} chapters={s.chapters.map((c) => c.slug)} lessons={lessons} signedIn={signedIn} />
              ) : (
                <span className="mt-auto inline-flex items-center gap-1.5 text-base font-bold kl-text">
                  Open subject
                  <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              )}
            </article>
          </li>
        );
      })}
    </ul>
  );
}
