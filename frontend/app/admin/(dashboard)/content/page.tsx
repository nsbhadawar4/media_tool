'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { adminContentApi } from '@/lib/api/adminContent';
import { PageHeader } from '@/components/ui/PageHeader';
import { InlineErrorState } from '@/components/ui/ErrorState';
import { ContentNav } from '@/components/admin/content/ContentNav';
import { CONTENT_TYPES, COURSES_INFO, OVERVIEW_ICON } from '@/components/admin/content/contentTypes';

/**
 * /admin/content: every kind of managed content at a glance, with live counts from the database.
 * Each card opens that kind's management screen.
 */
export default function AdminContentPage() {
  const stats = useQuery({ queryKey: ['admin', 'content', 'stats'], queryFn: async () => (await adminContentApi.stats()).data });
  const data = stats.data;

  const cards = [
    ...CONTENT_TYPES.map((t) => ({
      href: `/admin/content/${t.slug}`,
      label: t.label,
      description: t.description,
      icon: t.icon,
      figures: data ? [
        { label: 'Active', value: data[t.type].active, tone: 'text-success' },
        { label: 'Disabled', value: data[t.type].disabled, tone: 'text-danger' },
        { label: 'Hidden', value: data[t.type].hidden, tone: 'text-warning' },
        { label: 'Archived', value: data[t.type].archived, tone: 'text-subtle' },
      ] : null,
      total: data?.[t.type].total,
    })),
    {
      href: `/admin/content/${COURSES_INFO.slug}`,
      label: COURSES_INFO.label,
      description: COURSES_INFO.description,
      icon: COURSES_INFO.icon,
      figures: data ? [
        { label: 'Published', value: data.course.active, tone: 'text-success' },
        { label: 'Not published', value: data.course.total - data.course.active, tone: 'text-warning' },
        { label: 'Archived', value: data.course.archived, tone: 'text-subtle' },
      ] : null,
      total: data?.course.total,
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="Manage"
        icon={OVERVIEW_ICON}
        title="Content"
        description="Website sections, Kid Games, games and courses — what users see, in what order, and what's switched on."
      />
      <ContentNav />

      {stats.isError && (
        <div className="rounded-2xl border border-border bg-surface">
          <InlineErrorState error={stats.error} onRetry={() => stats.refetch()} subject="content figures" />
        </div>
      )}

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <li key={card.href} className="anim-rise-scale" style={{ '--i': i } as React.CSSProperties}>
              <Link
                href={card.href}
                className="card-interactive group flex h-full flex-col rounded-2xl border border-border bg-surface p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                    {card.total ?? <span className="inline-block h-8 w-10 animate-pulse rounded bg-surface-hover align-middle" />}
                  </span>
                </div>
                <h2 className="mt-4 flex items-center gap-1.5 text-base font-semibold text-foreground group-hover:text-accent">
                  {card.label}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                </h2>
                <p className="mt-1 text-xs text-muted">{card.description}</p>
                <dl className="mt-auto grid grid-cols-4 gap-2 pt-4">
                  {(card.figures ?? Array.from({ length: 4 }, () => null)).map((f, j) =>
                    f ? (
                      <div key={f.label} className="min-w-0">
                        <dt className="truncate text-[10px] font-medium uppercase tracking-wider text-subtle">{f.label}</dt>
                        <dd className={`text-sm font-semibold tabular-nums ${f.tone}`}>{f.value}</dd>
                      </div>
                    ) : (
                      <div key={j} className="h-8 animate-pulse rounded bg-surface-hover" />
                    ),
                  )}
                </dl>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
