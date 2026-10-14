'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, GraduationCap } from 'lucide-react';
import { ADMIN_CLASSES_KEY, adminClassesApi } from '@/lib/api/adminClasses';

/**
 * The admin dashboard's Courses figure: how many classes are visible and hidden, and how many
 * subjects and learning games they hold — counted from the same data as Manage Courses, which it
 * opens. Loading shows placeholders; a failed load says so rather than showing zeros.
 */
export function CoursesSummaryCard() {
  const query = useQuery({ queryKey: [...ADMIN_CLASSES_KEY, 'all'], queryFn: async () => (await adminClassesApi.list('all')).data });
  const live = (query.data ?? []).filter((c) => c.status !== 'archived');
  const figures = [
    { label: 'Visible', value: live.filter((c) => c.status === 'visible').length, tone: 'text-success' },
    { label: 'Hidden', value: live.filter((c) => c.status !== 'visible').length, tone: 'text-warning' },
    { label: 'Subjects', value: new Set(live.flatMap((c) => c.subjects.map((s) => s.key))).size, tone: 'text-foreground' },
    { label: 'Learning games', value: live.reduce((n, c) => n + c.counts.games, 0), tone: 'text-foreground' },
  ];
  return (
    <Link
      href="/admin/courses"
      className="surface-card group flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
          <GraduationCap className="h-5 w-5" />
        </span>
        <div>
          <p className="flex items-center gap-1 text-sm font-semibold text-foreground">
            Courses
            <ArrowUpRight aria-hidden className="h-4 w-4 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </p>
          <p className="text-xs text-muted">{query.isLoading ? 'Loading…' : query.isError ? 'Unable to load classes' : `${live.length} ${live.length === 1 ? 'class' : 'classes'} · Manage Courses`}</p>
        </div>
      </div>
      <dl className="grid grid-cols-4 gap-3 sm:gap-6">
        {figures.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="truncate text-[11px] text-muted">{f.label}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${f.tone}`}>{query.isLoading ? <span className="inline-block h-5 w-6 animate-pulse rounded bg-surface-hover align-middle" /> : query.isError ? '—' : f.value}</dd>
          </div>
        ))}
      </dl>
    </Link>
  );
}
