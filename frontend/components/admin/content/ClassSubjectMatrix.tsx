'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, X } from 'lucide-react';
import { adminContentApi, type AdminContentItem } from '@/lib/api/adminContent';
import { useToast } from '@/lib/toast/ToastContext';
import { Toggle } from '@/components/ui/Toggle';
import { InlineErrorState } from '@/components/ui/ErrorState';
import { useTaxonomy } from './useTaxonomy';

/**
 * Which classes offer which subjects. Each cell is one class ↔ subject link: offered and on,
 * offered but switched off (e.g. "Class 2 → Maths" off, nothing else changed), or not offered.
 * Removing a link archives it, so it can be offered again with everything it had.
 */
export function ClassSubjectMatrix() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const tax = useTaxonomy();
  // Archived links too, so "offer again" restores the one that existed.
  const allLinks = useQuery({
    queryKey: ['admin', 'content', 'taxonomy', 'class_subject', 'all'],
    queryFn: async () => (await adminContentApi.list({ type: 'class_subject', status: 'all', limit: 100 })).data,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
    void queryClient.invalidateQueries({ queryKey: ['content', 'catalog'] });
  };
  const onError = (err: Error) => toast.error(err.message);
  const toggle = useMutation({ mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) => adminContentApi.update(id, { isEnabled }), onSuccess: refresh, onError });
  const offer = useMutation({
    mutationFn: ({ existing, classLevel, subject, title }: { existing?: AdminContentItem; classLevel: number; subject: string; title: string }) =>
      existing ? adminContentApi.restore(existing.id) : adminContentApi.create({ type: 'class_subject', classLevel, subject, title }),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({ mutationFn: (id: string) => adminContentApi.archive(id), onSuccess: refresh, onError });
  const busy = toggle.isPending || offer.isPending || remove.isPending;

  if (allLinks.isError) return <InlineErrorState error={allLinks.error} onRetry={() => allLinks.refetch()} subject="class subjects" />;
  if (tax.isLoading || allLinks.isLoading) {
    return (
      <div className="flex items-center gap-2 px-5 py-6 text-sm text-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading classes and subjects…
      </div>
    );
  }
  const links = allLinks.data ?? [];
  const find = (classLevel: number, subject: string) => links.find((l) => l.classLevel === classLevel && l.subject === subject);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wider text-subtle">
            <th scope="col" className="px-5 py-3 font-medium">Class</th>
            {tax.subjects.map((s) => (
              <th key={s.id} scope="col" className="px-3 py-3 text-center font-medium">{s.title}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tax.classes.map((c) => (
            <tr key={c.id}>
              <th scope="row" className="whitespace-nowrap px-5 py-3 text-left font-medium text-foreground">{c.title}</th>
              {tax.subjects.map((s) => {
                const link = find(c.classLevel!, s.key);
                const live = link && !link.archivedAt;
                const label = `${c.title} · ${s.title}`;
                return (
                  <td key={s.id} className="px-3 py-3 text-center">
                    {live ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Toggle checked={link.isEnabled} onChange={(v) => toggle.mutate({ id: link.id, isEnabled: v })} label={`${label} enabled`} disabled={busy} />
                        <button
                          type="button"
                          onClick={() => remove.mutate(link.id)}
                          disabled={busy}
                          aria-label={`Stop offering ${s.title} in ${c.title}`}
                          title="Stop offering (archives the link)"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-subtle transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => offer.mutate({ existing: link, classLevel: c.classLevel!, subject: s.key, title: label })}
                        disabled={busy}
                        aria-label={`Offer ${s.title} in ${c.title}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border-strong px-2 py-1 text-xs font-medium text-muted transition hover:border-accent hover:text-accent disabled:opacity-40"
                      >
                        <Plus className="h-3 w-3" />
                        Offer
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
