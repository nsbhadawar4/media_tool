import Link from 'next/link';
import { BookOpen, Clock, ListChecks } from 'lucide-react';
import { MONTHS, UNSCHEDULED, monthName, type ClassSchedule, type Schedule } from '@/lib/content/academicCalendar';
import { classPath, formatMinutes } from '@/lib/content/learnPaths';
import { YearSelect } from '@/components/courses/YearSelect';

/**
 * Step 2 of a class page: the academic year and its twelve months, April to March. Months that have
 * published content are links (the address carries the choice); the others are shown but not offered, so
 * the year always reads as a whole and nobody lands on an empty month by clicking. "Anytime" holds the
 * chapters not placed in the calendar. Counts come from the database, never from the page.
 */
export function SchedulePicker({ classKey, schedule, selected }: { classKey: string; schedule: ClassSchedule; selected: Schedule }) {
  const anytime = selected.year === UNSCHEDULED;
  const year = schedule.years.find((y) => y.academicYear === selected.year);
  const open = new Map((year?.months ?? []).map((m) => [m.month, m]));
  const wholeYear = open.get(null);
  const current = selected.year === schedule.currentYear ? schedule.currentMonth : null;
  const chip = 'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground-soft';
  // What the chosen place holds: a month, the whole year, or the anytime chapters.
  const slot = anytime ? schedule.unscheduled : selected.month !== null ? open.get(selected.month) : year;

  return (
    <div className="rounded-[2rem] border-2 border-border bg-surface/70 p-4 shadow-card sm:p-6">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-start">
        <YearSelect classKey={classKey} years={schedule.years.map((y) => y.academicYear)} value={selected.year} hasAnytime={schedule.unscheduled.chapters > 0} />

        {anytime ? (
          <p className="text-base leading-relaxed text-foreground-soft sm:pt-6">These lessons are not tied to a month — learn them whenever you like.</p>
        ) : (
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.16em] text-muted" id="month-label">
              Month
            </p>
            <ul aria-labelledby="month-label" className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {MONTHS.map((m) => {
                const here = open.get(m.n);
                const active = selected.month === m.n;
                const base = 'flex h-12 w-full items-center justify-center rounded-2xl border-2 text-base font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)';
                return (
                  <li key={m.n}>
                    {here ? (
                      <Link
                        href={classPath(classKey, { year: selected.year, month: m.n })}
                        aria-current={active ? 'true' : undefined}
                        aria-label={`${m.long} ${selected.year}: ${here.subjects} ${here.subjects === 1 ? 'subject' : 'subjects'}, ${here.lessons} ${here.lessons === 1 ? 'lesson' : 'lessons'}${current === m.n ? ', this month' : ''}`}
                        className={`${base} ${active ? 'kl-badge border-transparent text-white shadow-lift' : 'border-border bg-surface text-foreground hover:-translate-y-0.5 hover:border-(--kg) hover:shadow-card'}`}
                      >
                        {m.short}
                        {current === m.n && !active ? <span aria-hidden className="ml-1.5 h-1.5 w-1.5 rounded-full bg-(--kg)" /> : null}
                      </Link>
                    ) : (
                      <span aria-disabled="true" title={`Nothing in ${m.long} yet`} className={`${base} cursor-not-allowed border-dashed border-border bg-transparent text-subtle opacity-60`}>
                        {m.short}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {wholeYear && (
              <p className="mt-3 text-sm text-foreground-soft">
                {wholeYear.chapters} {wholeYear.chapters === 1 ? 'chapter' : 'chapters'} in {selected.year} are not tied to a month.{' '}
                <Link href={classPath(classKey, { year: selected.year, month: null })} className="font-semibold text-foreground underline underline-offset-2">
                  Show the whole year
                </Link>
              </p>
            )}
          </div>
        )}
      </div>

      {slot && (
        <ul className="mt-5 flex flex-wrap gap-2" aria-label={`${anytime ? 'Anytime lessons' : selected.month !== null ? `${monthName(selected.month)} ${selected.year}` : selected.year} at a glance`}>
          <li className={chip}>
            <BookOpen aria-hidden className="h-4 w-4 kl-text" />
            {slot.chapters} {slot.chapters === 1 ? 'chapter' : 'chapters'}
          </li>
          <li className={chip}>
            <ListChecks aria-hidden className="h-4 w-4 kl-text" />
            {slot.lessons} {slot.lessons === 1 ? 'lesson' : 'lessons'}
          </li>
          {slot.minutes > 0 && (
            <li className={chip}>
              <Clock aria-hidden className="h-4 w-4 kl-text" />
              {formatMinutes(slot.minutes)}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
