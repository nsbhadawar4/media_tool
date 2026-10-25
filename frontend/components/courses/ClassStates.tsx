import Link from 'next/link';
import { CalendarX2, RefreshCw, SearchX } from 'lucide-react';

/**
 * What the public class pages (/classes/…) show while they load, when the API can't be read, and
 * when a class, subject or chapter isn't there. Server components: the skeletons are the routes'
 * loading.tsx (shown at once on a click, inside the site's header and footer).
 */

const bar = 'animate-pulse rounded-lg bg-surface-hover';

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative px-4 pb-20 pt-8 sm:px-6 sm:pt-12 lg:px-8" aria-busy="true">
      <div className="relative mx-auto max-w-6xl" role="status" aria-label={label}>
        <div className={`${bar} mb-6 h-5 w-28`} />
        {children}
      </div>
    </div>
  );
}

export function ClassPageSkeleton() {
  return (
    <Shell label="Loading class">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
        <div className="aspect-[4/3] animate-pulse rounded-[2rem] border border-border bg-surface-hover" />
        <div className="space-y-4">
          <div className={`${bar} h-4 w-32`} />
          <div className={`${bar} h-11 w-2/3`} />
          <div className={`${bar} h-5 w-full`} />
          <div className={`${bar} h-5 w-4/5`} />
          <div className="flex gap-2 pt-2">
            <div className={`${bar} h-8 w-28 rounded-full`} />
            <div className={`${bar} h-8 w-28 rounded-full`} />
          </div>
          <div className={`${bar} mt-4 h-12 w-48 rounded-xl`} />
        </div>
      </div>
      <div className={`${bar} mt-16 h-7 w-56`} />
      <SubjectCardsSkeleton />
    </Shell>
  );
}

export function SubjectCardsSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-44 animate-pulse rounded-3xl border border-border bg-surface-hover" />
      ))}
    </div>
  );
}

export function SubjectPageSkeleton() {
  return (
    <Shell label="Loading subject">
      <div className="space-y-3">
        <div className={`${bar} h-4 w-40`} />
        <div className={`${bar} h-10 w-1/2`} />
        <div className={`${bar} h-5 w-3/4`} />
      </div>
      <div className="mt-10 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl border border-border bg-surface-hover" />
        ))}
      </div>
    </Shell>
  );
}

export function ChapterPageSkeleton() {
  return (
    <Shell label="Loading chapter">
      <div className="mx-auto max-w-3xl space-y-3">
        <div className={`${bar} h-4 w-40`} />
        <div className={`${bar} h-10 w-2/3`} />
        <div className={`${bar} h-5 w-full`} />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mt-4 h-28 animate-pulse rounded-2xl border border-border bg-surface-hover" />
        ))}
      </div>
    </Shell>
  );
}

/** The API couldn't be read: say so plainly, with a way to try again (a full reload of this address). */
export function ClassUnavailable({ what, retryHref }: { what: 'class' | 'subject' | 'chapter'; retryHref: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-20">
      <div className="max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
        <h1 className="text-xl font-semibold text-foreground">Unable to load this {what}</h1>
        <p className="mt-2 text-sm text-muted">Something went wrong while loading it. Please try again in a moment.</p>
        <a href={retryHref} className="btn-primary mt-6 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-accent-foreground">
          <RefreshCw aria-hidden className="h-4 w-4" />
          Retry
        </a>
      </div>
    </div>
  );
}

/** A class, subject or chapter that isn't there (or isn't public): a clear way back instead of a bare 404. */
export function ClassNotFoundState({ title, description, backHref, backLabel }: { title: string; description: string; backHref: string; backLabel: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-20">
      <div className="max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
        <SearchX aria-hidden className="mx-auto h-8 w-8 text-muted" />
        <h1 className="mt-3 text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted">{description}</p>
        <Link href={backHref} className="btn-primary mt-6 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold text-accent-foreground">
          {backLabel}
        </Link>
      </div>
    </div>
  );
}

/**
 * A month (or year) with nothing published in it — shown in place of the subject cards, never a blank.
 * `what` names what is missing ("courses", "Mathematics lessons"); `offer` is where else to look.
 */
export function ScheduleEmptyState({ place, what = 'courses', offer }: { place: string; what?: string; offer?: { href: string; label: string } }) {
  return (
    <div role="status" className="rounded-[2rem] border-2 border-dashed border-border bg-surface/60 px-6 py-12 text-center">
      <CalendarX2 aria-hidden className="mx-auto h-10 w-10 text-(--kg)" />
      <p className="mt-4 text-xl font-extrabold text-foreground">
        No {what} are available for {place} yet.
      </p>
      <p className="mx-auto mt-2 max-w-md text-base text-foreground-soft">Check another month or come back soon.</p>
      {offer && (
        <Link href={offer.href} className="btn-primary mt-6 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold text-accent-foreground">
          {offer.label}
        </Link>
      )}
    </div>
  );
}
