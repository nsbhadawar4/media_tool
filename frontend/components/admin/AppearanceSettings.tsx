'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Moon, Palette, Sun, SunMoon } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useToast } from '@/lib/toast/ToastContext';
import type { Theme, ThemeMode } from '@/lib/theme/policy';
import { FormCard } from '@/components/profile/AccountForms';
import { Button } from '@/components/ui/Button';
import { InlineErrorState } from '@/components/ui/ErrorState';
import { formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';

interface AdminAppearance {
  themeMode: ThemeMode;
  defaultTheme: Theme;
  updatedAt: string | null;
  updatedBy: { name: string | null; email: string | null } | null;
}

const MODES: Array<{ value: ThemeMode; label: string; hint: string; icon: typeof Sun }> = [
  { value: 'both', label: 'Light + Dark', hint: 'Everyone can switch between the two themes.', icon: SunMoon },
  { value: 'light', label: 'Light only', hint: 'Light everywhere; the theme switch is hidden.', icon: Sun },
  { value: 'dark', label: 'Dark only', hint: 'Dark everywhere; the theme switch is hidden.', icon: Moon },
];

/** A miniature of the interface in one theme, drawn with that theme's own colours. */
function ThemePreview({ theme, active }: { theme: Theme; active: boolean }) {
  const c =
    theme === 'light'
      ? { bg: '#f5fffb', surface: '#ffffff', border: '#d1fae5', text: '#0f172a', muted: '#94a3b8', accent: '#059669' }
      : { bg: '#061a16', surface: '#0f2922', border: 'rgba(167,243,208,0.14)', text: '#f8fafc', muted: '#3d5a52', accent: '#10b981' };
  return (
    <figure className={cn('flex flex-col gap-2 rounded-2xl border p-2 transition', active ? 'border-accent/60 ring-1 ring-accent/30' : 'border-border opacity-60')}>
      <div aria-hidden className="flex h-24 gap-1.5 overflow-hidden rounded-xl p-2" style={{ background: c.bg }}>
        <div className="w-1/4 rounded-lg" style={{ background: c.surface, border: `1px solid ${c.border}` }} />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-3 w-2/3 rounded" style={{ background: c.text, opacity: 0.85 }} />
          <div className="h-2 w-1/2 rounded" style={{ background: c.muted }} />
          <div className="mt-auto flex gap-1.5">
            <div className="h-8 flex-1 rounded-md" style={{ background: c.surface, border: `1px solid ${c.border}` }} />
            <div className="h-8 flex-1 rounded-md" style={{ background: c.surface, border: `1px solid ${c.border}` }} />
            <div className="h-8 w-8 rounded-md" style={{ background: c.accent }} />
          </div>
        </div>
      </div>
      <figcaption className="flex items-center justify-between px-1 text-xs font-medium text-foreground-soft">
        {theme === 'light' ? 'Light' : 'Dark'}
        {active && <Check className="h-3.5 w-3.5 text-accent" aria-label="Available" />}
      </figcaption>
    </figure>
  );
}

/**
 * /admin/settings → Appearance: which themes the whole site may use (public site, user app and
 * admin panel) and the default for visitors who haven't chosen. Saved on the server (admin-only,
 * audited); every page follows it on its next load. A visitor's own choice is never overwritten —
 * it applies again whenever both themes are allowed.
 */
export function AppearanceSettings() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { refreshPolicy } = useTheme();
  const query = useQuery({ queryKey: ['admin', 'settings', 'appearance'], queryFn: async () => (await api.get<AdminAppearance>('/api/admin/settings/appearance')).data });
  const [draft, setDraft] = useState<{ themeMode: ThemeMode; defaultTheme: Theme } | null>(null);
  const saved = query.data;
  const current = draft ?? (saved ? { themeMode: saved.themeMode, defaultTheme: saved.defaultTheme } : null);
  const changed = Boolean(saved && current && (current.themeMode !== saved.themeMode || current.defaultTheme !== saved.defaultTheme));

  const save = useMutation({
    mutationFn: async () => (await api.patch<{ themeMode: ThemeMode; defaultTheme: Theme }>('/api/admin/settings/appearance', current)).data,
    onSuccess: async () => {
      toast.success('Appearance saved — every page follows it on its next load');
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'appearance'] });
      // This browser follows at once.
      await refreshPolicy();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const set = (patch: Partial<{ themeMode: ThemeMode; defaultTheme: Theme }>) => current && setDraft({ ...current, ...patch });
  // With a single theme the default is that theme: shown, not chosen.
  const effectiveDefault: Theme | null = current ? (current.themeMode === 'both' ? current.defaultTheme : current.themeMode) : null;

  return (
    <FormCard icon={Palette} title="Appearance" description="Themes for the whole site: the public pages, the user app and this admin panel.">
      {query.isError ? (
        <InlineErrorState error={query.error} onRetry={() => query.refetch()} subject="the appearance setting" />
      ) : !current ? (
        <div className="space-y-3" role="status" aria-label="Loading">
          <div className="h-20 animate-pulse rounded-xl bg-surface-hover" />
          <div className="h-10 animate-pulse rounded-xl bg-surface-hover" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-foreground">Theme availability</legend>
            <div role="radiogroup" aria-label="Theme availability" className="grid gap-2 sm:grid-cols-3">
              {MODES.map(({ value, label, hint, icon: Icon }) => {
                const active = current.themeMode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => set({ themeMode: value })}
                    className={cn(
                      'flex flex-col items-start gap-1.5 rounded-xl border px-3.5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                      active ? 'border-accent/60 bg-accent/10' : 'border-border hover:bg-surface-hover',
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Icon className={cn('h-4 w-4', active ? 'text-accent' : 'text-muted')} aria-hidden />
                      {label}
                    </span>
                    <span className="text-xs leading-snug text-muted">{hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset disabled={current.themeMode !== 'both'} className="disabled:opacity-60">
            <legend className="mb-2 text-[13px] font-semibold text-foreground">Default theme</legend>
            <div role="radiogroup" aria-label="Default theme" className="inline-flex rounded-xl border border-border bg-surface-elevated p-1">
              {(['light', 'dark'] as const).map((t) => {
                const active = effectiveDefault === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => set({ defaultTheme: t })}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed',
                      active ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted hover:text-foreground',
                    )}
                  >
                    {t === 'light' ? <Sun className="h-3.5 w-3.5" aria-hidden /> : <Moon className="h-3.5 w-3.5" aria-hidden />}
                    {t === 'light' ? 'Light' : 'Dark'}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">
              {current.themeMode === 'both'
                ? 'For visitors and users who haven’t picked a theme themselves. Anyone’s own choice is kept.'
                : 'With one theme allowed, everyone sees that theme. Their own choice returns when both are allowed again.'}
            </p>
          </fieldset>

          <div>
            <p className="mb-2 text-[13px] font-semibold text-foreground">Preview</p>
            <div className="grid grid-cols-2 gap-3">
              <ThemePreview theme="light" active={current.themeMode !== 'dark'} />
              <ThemePreview theme="dark" active={current.themeMode !== 'light'} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-subtle">
              {saved?.updatedAt
                ? `Last changed ${formatRelativeTime(saved.updatedAt)}${saved.updatedBy ? ` by ${saved.updatedBy.name || saved.updatedBy.email}` : ''}`
                : 'Using the default: Light + Dark, dark first.'}
            </p>
            <div className="flex gap-2">
              {changed && (
                <Button variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>
                  Discard
                </Button>
              )}
              <Button onClick={() => save.mutate()} disabled={!changed} isLoading={save.isPending}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </FormCard>
  );
}
