'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, GraduationCap, MousePointerClick, RefreshCw } from 'lucide-react';
import type { CSSProperties } from 'react';
import { contentApi } from '@/lib/api/content';
import { ApiError } from '@/lib/api/client';
import type { ClassView } from '@/lib/content/catalog';
import { classPath } from '@/lib/content/learnPaths';
import { classPicture, classVars } from '@/components/kid-games/cards/ClassCourseCard';
import { SubjectCards } from './SubjectCards';
import { SubjectCardsSkeleton } from './ClassStates';
import { cn } from '@/utils/cn';

/** The address keeps the chosen class (?class=class-7), so a refresh, a new tab or Back keeps it. */
export const CLASS_PARAM = 'class';

export type PickerClass = ClassView & { subjects?: number };

/**
 * Class first, then subject: the classes as they are published (none hard-coded — a class an
 * administrator adds appears here by itself), and, once one is chosen, only the subjects that class
 * offers, read from the server for that class alone (the same rules as its page: visible subjects
 * of a published, visible class). Each subject opens /classes/<class>/<subject>, where the server
 * checks the pair again. Changing class clears the subjects at once and loads the new class's —
 * they are a separate query per class, so another class's subjects never show, even for a moment.
 */
export function ClassSubjectPicker({ classes, kidGamesOn, progress, idPrefix = 'pick' }: { classes: readonly PickerClass[]; kidGamesOn: boolean; progress?: ReadonlyMap<string, number>; idPrefix?: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const requested = params.get(CLASS_PARAM);
  const selected = classes.find((c) => c.key === requested) ?? null;

  const subjects = useQuery({
    queryKey: ['content', 'class-curriculum', selected?.key],
    queryFn: async ({ signal }) => (await contentApi.classCurriculum(selected!.key, signal)).data,
    enabled: Boolean(selected),
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  // The native History API (synced with useSearchParams by Next): the choice shows at once, with no
  // server round trip, and still lives in the address for a refresh, a new tab or Back.
  const choose = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(CLASS_PARAM, key);
    window.history.replaceState(null, '', `${pathname}?${next.toString()}${window.location.hash}`);
  };

  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border px-6 py-10 text-center">
        <GraduationCap aria-hidden className="h-8 w-8 text-muted" />
        <p className="font-semibold text-foreground">No classes available yet.</p>
      </div>
    );
  }

  const panelId = `${idPrefix}-subjects`;
  return (
    <div className="space-y-6">
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-accent">
        <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] text-accent-foreground">1</span>
        Step 1 · Choose your class
      </p>
      <div role="radiogroup" aria-label="Choose your class" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {classes.map((c, i) => {
          const on = c.key === selected?.key;
          const picture = classPicture(c.level, c.thumbnailUrl, c.title, c.isCode);
          const percent = progress?.get(c.key);
          return (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-controls={panelId}
              onClick={() => choose(c.key)}
              style={{ ...classVars(c.level), '--i': i } as CSSProperties}
              className={cn(
                'anim-rise group relative flex min-h-[4.5rem] min-w-0 items-center gap-3 rounded-2xl border bg-surface p-2.5 pr-3 text-left shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-(--kg) hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)',
                on ? 'border-(--kg) ring-2 ring-(--kg)/40' : 'border-border',
              )}
            >
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-to-br from-(--kg) to-(--kg-2) text-lg font-bold text-white">
                {picture &&
                  (picture.local ? (
                    <Image src={picture.src} alt="" fill sizes="56px" className="object-cover opacity-70" style={picture.focus ? { objectPosition: picture.focus } : undefined} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- an uploaded or linked picture
                    <img src={picture.src} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" loading="lazy" referrerPolicy="no-referrer" />
                  ))}
                <span className="relative [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{c.level}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{c.title}</span>
                <span className="block truncate text-xs text-muted">
                  {c.subtitle || (typeof c.subjects === 'number' ? `${c.subjects} ${c.subjects === 1 ? 'subject' : 'subjects'}` : 'Open subjects')}
                </span>
                {typeof percent === 'number' && percent > 0 && (
                  <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-hover" aria-label={`${percent}% complete`}>
                    <span className="block h-full rounded-full bg-(--kg)" style={{ width: `${percent}%` }} />
                  </span>
                )}
              </span>
              {on && (
                <span aria-hidden className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-(--kg) text-white shadow-card">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section id={panelId} aria-live="polite" aria-label={selected ? `${selected.title} subjects` : 'Subjects'} style={selected ? classVars(selected.level) : undefined} className="scroll-mt-24">
        {!selected ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border bg-surface/50 px-6 py-10 text-center">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-muted">
              <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-[11px]">2</span>
              Step 2 · Choose a subject
            </p>
            <MousePointerClick aria-hidden className="mt-2 h-7 w-7 text-muted" />
            <p className="text-sm text-muted">Choose your class first — only its subjects appear here.</p>
          </div>
        ) : (
          <div key={selected.key} className="space-y-5 rounded-3xl border border-border bg-surface/60 p-4 shadow-card sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--kg)_70%,var(--foreground))]">
                  <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-(--kg) text-[11px] text-white">2</span>
                  Step 2 · {selected.title}
                </p>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">Choose a subject to continue</h3>
              </div>
              <Link href={classPath(selected.key)} className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[color-mix(in_srgb,var(--kg)_70%,var(--foreground))]">
                Open {selected.title}
                <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            {subjects.isPending ? (
              <div aria-busy="true" aria-label="Loading subjects">
                <SubjectCardsSkeleton />
              </div>
            ) : subjects.isError ? (
              <div className="rounded-2xl border border-border bg-surface px-5 py-8 text-center">
                <p className="font-semibold text-foreground">{subjects.error instanceof ApiError && subjects.error.status === 404 ? `${selected.title} is not available right now` : 'Unable to load the subjects'}</p>
                {!(subjects.error instanceof ApiError && subjects.error.status === 404) && (
                  <button type="button" onClick={() => void subjects.refetch()} className="btn-primary mt-4 inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-accent-foreground">
                    <RefreshCw aria-hidden className="h-4 w-4" />
                    Try Again
                  </button>
                )}
              </div>
            ) : (
              <SubjectCards classKey={selected.key} subjects={subjects.data.subjects} kidGamesOn={kidGamesOn} />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
