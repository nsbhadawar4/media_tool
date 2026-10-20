import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';

export interface CourseCrumb {
  label: string;
  /** Absent for the page itself (the last crumb). */
  href?: string;
}

/**
 * Where a learner is: Courses / Class 7 / Hindi / Chapter 1 / Lesson 1 — the same trail on every
 * course page, each part a link up one level (the page itself is not a link). On a phone the trail
 * wraps; the step up ("←") is always the link just before the page.
 */
export function CourseBreadcrumb({ items }: { items: CourseCrumb[] }) {
  const upIndex = items.length - 2;
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-subtle" />}
            {c.href ? (
              <Link href={c.href} className="group inline-flex min-h-11 max-w-[14rem] items-center gap-1.5 truncate transition-colors hover:text-foreground">
                {i === upIndex && <ArrowLeft aria-hidden className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />}
                <span className="truncate">{c.label}</span>
              </Link>
            ) : (
              <span aria-current="page" className="inline-flex min-h-11 max-w-[16rem] items-center truncate font-medium text-foreground">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
