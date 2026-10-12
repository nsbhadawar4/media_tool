'use client';

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe2, LayoutDashboard, Power } from 'lucide-react';
import { adminContentApi, type AdminContentItem, type UpdateContentInput } from '@/lib/api/adminContent';
import { useToast } from '@/lib/toast/ToastContext';
import { Badge } from '@/components/ui/Badge';
import { Toggle } from '@/components/ui/Toggle';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDate, formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';

const listOf = (type: 'section' | 'dashboard_widget') => ({
  queryKey: ['admin', 'content', 'items', { type, status: 'live', sort: 'order', limit: 100 }],
  queryFn: () => adminContentApi.list({ type, status: 'live', sort: 'order', page: 1, limit: 100 }),
});

interface Pending {
  item: AdminContentItem;
  patch: UpdateContentInput;
  title: string;
  description: string;
}

/**
 * The three switches that decide where a whole feature (Games or Kid Games) appears, each saved
 * on its own entry:
 *  - the feature itself — its website section's ON switch: off, nothing from it appears anywhere
 *    and its pages are closed;
 *  - its block on the public home page — the section's `showOnLanding`;
 *  - its block on the user dashboard — the dashboard widget of the same key.
 * The two surfaces are independent ("Landing: off, Dashboard: on"); both need the feature on.
 */
export function FeatureSurfaces({ feature, label }: { feature: 'games' | 'kid-games'; label: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const sections = useQuery(listOf('section'));
  const widgets = useQuery(listOf('dashboard_widget'));
  const section = sections.data?.data.find((s) => s.key === feature);
  const widget = widgets.data?.data.find((w) => w.key === feature);
  const [pending, setPending] = useState<Pending | null>(null);

  const save = useMutation({
    mutationFn: ({ item, patch }: { item: AdminContentItem; patch: UpdateContentInput }) => adminContentApi.update(item.id, patch),
    onSuccess: () => {
      toast.success('Saved — visitors and users see it on their next page load');
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
      void queryClient.invalidateQueries({ queryKey: ['content', 'catalog'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (sections.isLoading || widgets.isLoading) {
    return (
      <section aria-label={`${label} switches`} className="grid gap-3 md:grid-cols-3" role="status">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl border border-border bg-surface" />
        ))}
      </section>
    );
  }
  if (!section) return null;

  const featureOn = section.isEnabled && section.isVisible;
  const landingOn = section.showOnLanding;
  const dashboardOn = widget?.isEnabled ?? false;

  return (
    <section aria-label={`${label} switches`} className="grid gap-3 md:grid-cols-3">
      <SurfaceCard
        icon={Power}
        title={`${label} feature`}
        body={`Master switch. Off: ${label} disappears everywhere and its pages say it is unavailable.`}
        on={featureOn}
        item={section}
        busy={save.isPending}
        onChange={(on) =>
          on
            ? save.mutate({ item: section, patch: { isEnabled: true, isVisible: true } })
            : setPending({
                item: section,
                patch: { isEnabled: false },
                title: `Turn the whole ${label} feature off?`,
                description: `Signed-in users lose access to ${label} — its pages, its dashboard block and its links — and the home page block goes too. Nothing is deleted; turn it back on at any time.`,
              })
        }
        accent="var(--accent)"
      />
      <SurfaceCard
        icon={Globe2}
        title="Landing page block"
        body={`A ${label} section on the public home page, listing the ${label.toLowerCase()} switched on for the landing page.`}
        on={landingOn}
        blocked={!featureOn}
        item={section}
        busy={save.isPending}
        onChange={(on) => save.mutate({ item: section, patch: { showOnLanding: on } })}
        accent="#22d3ee"
      />
      {widget && (
        <SurfaceCard
          icon={LayoutDashboard}
          title="User dashboard block"
          body={`The ${label} block on every signed-in user’s dashboard. Its position is set under User dashboard.`}
          on={dashboardOn}
          blocked={!featureOn}
          item={widget}
          busy={save.isPending}
          onChange={(on) =>
            on
              ? save.mutate({ item: widget, patch: { isEnabled: true } })
              : setPending({
                  item: widget,
                  patch: { isEnabled: false },
                  title: `Hide the ${label} block from the dashboard?`,
                  description: `Users can still open ${label} from the menu while the feature is on.`,
                })
          }
          accent="#a78bfa"
        />
      )}

      <ConfirmDialog
        isOpen={pending !== null}
        onClose={() => !save.isPending && setPending(null)}
        onConfirm={() => pending && save.mutate({ item: pending.item, patch: pending.patch })}
        title={pending?.title ?? ''}
        description={pending?.description ?? ''}
        confirmLabel="Turn off"
        isDangerous={pending?.item.type === 'section'}
        isLoading={save.isPending}
      />
    </section>
  );
}

function SurfaceCard({
  icon: Icon,
  title,
  body,
  on,
  blocked = false,
  item,
  busy,
  onChange,
  accent,
}: {
  icon: typeof Power;
  title: string;
  body: ReactNode;
  on: boolean;
  /** Its parent (the feature) is off, so it has no effect right now. */
  blocked?: boolean;
  item: AdminContentItem;
  busy: boolean;
  onChange: (on: boolean) => void;
  accent: string;
}) {
  const live = on && !blocked;
  return (
    <article
      className={cn(
        'relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border bg-surface p-4 shadow-card transition-colors',
        live ? 'border-border-strong' : 'border-border',
      )}
    >
      <span
        aria-hidden
        className={cn('pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl transition-opacity duration-300', live ? 'opacity-100' : 'opacity-0')}
        style={{ backgroundColor: `color-mix(in srgb, ${accent} 22%, transparent)` }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
          style={{ color: accent, backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`, borderColor: `color-mix(in srgb, ${accent} 26%, transparent)` }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <Toggle checked={on} onChange={onChange} label={title} disabled={busy} />
      </div>
      <div className="relative min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {blocked ? <Badge variant="warning">Feature off</Badge> : on ? <Badge variant="success">On</Badge> : <Badge>Off</Badge>}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
      </div>
      <p className="relative mt-auto text-[11px] text-subtle">
        Updated{' '}
        <time dateTime={item.updatedAt} title={formatDate(item.updatedAt)}>
          {formatRelativeTime(item.updatedAt)}
        </time>
        {item.updatedBy ? ` by ${item.updatedBy.name || item.updatedBy.email || 'an administrator'}` : ''}
      </p>
    </article>
  );
}
