'use client';

import Link from 'next/link';
import { ArrowUpRight, LayoutTemplate, Monitor, Moon, Settings, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormCard, PasswordForm } from '@/components/profile/AccountForms';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useToast } from '@/lib/toast/ToastContext';
import { formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';

const THEMES = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
] as const;

/** Where the website itself is configured — all of it lives in the content pages. */
const WEBSITE_LINKS = [
  { href: '/admin/content/sections', label: 'Website sections', hint: 'Turn public sections on or off, and reorder them' },
  { href: '/admin/content', label: 'Content overview', hint: 'Classes, subjects, courses and games' },
] as const;

/**
 * The administrator's own settings: their account (with the same change-password flow as a
 * user's Profile page — the current password is required), this browser's theme, and where
 * the website is configured. Everything here acts on the signed-in account only.
 */
export default function AdminSettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  if (!user) return null;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader eyebrow="System" icon={Settings} title="Settings" description="Your administrator account, this browser's appearance, and where the website is configured." />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <FormCard icon={UserRound} title="Administrator account" description="The account signed in to the admin panel.">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted">Name</dt>
            <dd className="truncate font-medium text-foreground">{user.name}</dd>
            <dt className="text-muted">Email</dt>
            <dd className="truncate font-medium text-foreground">{user.email ?? '—'}</dd>
            <dt className="text-muted">Role</dt>
            <dd>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-2 py-0.5 text-xs font-semibold text-accent">
                <ShieldCheck className="h-3.5 w-3.5" /> Administrator
              </span>
            </dd>
            {user.createdAt && (
              <>
                <dt className="text-muted">Since</dt>
                <dd className="text-foreground-soft">{formatDate(user.createdAt)}</dd>
              </>
            )}
          </dl>
          <p className="mt-5 text-xs text-muted">
            The administrator role is set on the server only (<code className="rounded bg-surface-hover px-1 font-mono text-[11px]">npm run create-admin</code>); it can&apos;t be granted from here.
          </p>
        </FormCard>

        <PasswordForm toast={toast} />

        <FormCard icon={Monitor} title="Appearance" description="Applies to this browser only.">
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                  theme === value ? 'border-accent/50 bg-accent/10 text-foreground' : 'border-border text-muted hover:bg-surface-hover hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </FormCard>

        <FormCard icon={LayoutTemplate} title="Website" description="The public site is configured from the content pages.">
          <ul className="flex flex-col gap-2">
            {WEBSITE_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="group flex items-center gap-3 rounded-xl border border-border px-3.5 py-3 transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{link.label}</span>
                    <span className="block text-xs text-muted">{link.hint}</span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle transition group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </FormCard>
      </div>
    </div>
  );
}
