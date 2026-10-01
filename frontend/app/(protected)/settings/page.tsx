'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { SlidersHorizontal, ArrowUpRight, HardDrive, KeyRound, LogOut, Monitor, Moon, ShieldCheck, Sun } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Tabs } from '@/components/ui/Tabs';
import { Toggle } from '@/components/ui/Toggle';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLogoutPrompt } from '@/components/auth/LogoutPrompt';
import { dashboardApi } from '@/lib/api/dashboard';
import { formatBytes, formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';

const THEME_OPTIONS = [
  { value: 'light' as const, label: 'Light', icon: Sun },
  { value: 'dark' as const, label: 'Dark', icon: Moon },
  { value: 'system' as const, label: 'System', icon: Monitor },
];

const SECTIONS = [
  { value: 'account', label: 'Account' },
  { value: 'appearance', label: 'Appearance' },
  { value: 'storage', label: 'Storage' },
  { value: 'security', label: 'Security' },
  { value: 'preferences', label: 'Preferences' },
] as const;

type Section = (typeof SECTIONS)[number]['value'];

/** A settings row: a label and its explanation on the left, the control on the right. */
function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-b-0">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const MOTION_KEY = 'media_tool_reduce_motion';
const VIEW_KEYS = { media: 'media_tool_view_media', documents: 'media_tool_view_documents' } as const;

/** Reads a stored value without letting a blocked storage break the page. */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembering a preference is harmless.
  }
}

/** Device-level preferences, kept in this browser like the theme. */
function PreferencesPanel() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [views, setViews] = useState<{ media: string; documents: string }>({ media: 'grid', documents: 'grid' });

  // Read after mount: storage does not exist while rendering on the server.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduceMotion(readStored(MOTION_KEY) === '1');
    setViews({
      media: readStored(VIEW_KEYS.media) === 'list' ? 'list' : 'grid',
      documents: readStored(VIEW_KEYS.documents) === 'list' ? 'list' : 'grid',
    });
  }, []);

  const changeMotion = (next: boolean) => {
    setReduceMotion(next);
    writeStored(MOTION_KEY, next ? '1' : '0');
    if (next) document.documentElement.setAttribute('data-motion', 'reduce');
    else document.documentElement.removeAttribute('data-motion');
  };

  const changeView = (kind: 'media' | 'documents', next: 'grid' | 'list') => {
    setViews((current) => ({ ...current, [kind]: next }));
    writeStored(VIEW_KEYS[kind], next);
  };

  const renderViewPicker = (kind: 'media' | 'documents') => (
    <div role="radiogroup" aria-label={`${kind} layout`} className="flex rounded-xl border border-border bg-surface p-1">
      {(['grid', 'list'] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={views[kind] === option}
          onClick={() => changeView(kind, option)}
          className={cn(
            'rounded-lg px-3 py-1 text-[13px] font-medium capitalize transition-colors duration-200',
            views[kind] === option ? 'bg-surface-elevated text-foreground shadow-card' : 'text-muted hover:text-foreground',
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold tracking-tight text-foreground">Preferences</h2>
        <p className="mt-0.5 text-xs text-muted">Saved in this browser only.</p>
      </CardHeader>
      <CardBody padded={false}>
        <SettingRow title="Reduce motion" description="Turns off page transitions and hover animations.">
          <Toggle checked={reduceMotion} onChange={changeMotion} label="Reduce motion" />
        </SettingRow>
        <SettingRow title="Media layout" description="How photos and videos are shown by default.">
          {renderViewPicker('media')}
        </SettingRow>
        <SettingRow title="Documents layout" description="How documents are shown by default.">
          {renderViewPicker('documents')}
        </SettingRow>
      </CardBody>
    </Card>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [section, setSection] = useState<Section>('account');

  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardApi.stats(),
  });
  const stats = statsQuery.data?.data;

  const { requestLogout } = useLogoutPrompt();

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        icon={SlidersHorizontal}
        eyebrow="Preferences"
        title="Settings"
        description="Manage your account and how media_tool looks on this device."
      />

      <Tabs tabs={SECTIONS} value={section} onChange={setSection} aria-label="Settings sections" className="mb-6" />

      <div key={section} className="app-content-enter">
        {section === 'account' && (
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Account</h2>
            </CardHeader>
            <CardBody padded={false}>
              <div className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-5">
                <Avatar name={user?.name ?? '?'} src={user?.avatarUrl} size="lg" />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm font-semibold text-foreground">{user?.name}</p>
                  <p className="truncate text-xs text-muted">{user?.email}</p>
                </div>
                <Link
                  href="/profile"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface-elevated px-3.5 text-[13px] font-medium text-foreground transition hover:border-border-strong hover:bg-surface-hover"
                >
                  Edit profile
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted" />
                </Link>
              </div>
              {user?.createdAt && (
                <SettingRow title="Member since" description="When this account was created.">
                  <span className="text-sm text-foreground-soft">{formatDate(user.createdAt)}</span>
                </SettingRow>
              )}
              <SettingRow title="Sign out" description="End your session on this device.">
                <Button variant="secondary" onClick={requestLogout}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </SettingRow>
            </CardBody>
          </Card>
        )}

        {section === 'appearance' && (
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Appearance</h2>
              <p className="mt-0.5 text-xs text-muted">Stored in this browser only; it does not follow your account.</p>
            </CardHeader>
            <CardBody>
              <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
                {THEME_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isActive = theme === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => setTheme(option.value)}
                      className={cn(
                        'flex flex-col items-center gap-2.5 rounded-xl border px-4 py-4 text-[13px] font-medium transition duration-150',
                        isActive
                          ? 'border-accent bg-accent/10 text-foreground ring-1 ring-accent/40'
                          : 'border-border text-muted hover:border-border-strong hover:bg-surface-hover hover:text-foreground',
                      )}
                    >
                      <Icon className={cn('h-5 w-5', isActive && 'text-accent')} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        )}

        {section === 'storage' && (
          <Card>
            <CardHeader className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <HardDrive className="h-4 w-4" />
              </span>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Storage</h2>
            </CardHeader>
            <CardBody padded={false}>
              <SettingRow title="Space used" description="Total size of every file in your library, trash included.">
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {stats ? formatBytes(stats.storageUsedBytes) : '…'}
                </span>
              </SettingRow>
              <SettingRow title="Images" description="Photos in your library.">
                <span className="text-sm tabular-nums text-foreground-soft">{stats?.totalImages ?? '…'}</span>
              </SettingRow>
              <SettingRow title="Videos">
                <span className="text-sm tabular-nums text-foreground-soft">{stats?.totalVideos ?? '…'}</span>
              </SettingRow>
              <SettingRow title="Documents">
                <span className="text-sm tabular-nums text-foreground-soft">{stats?.totalDocuments ?? '…'}</span>
              </SettingRow>
              <SettingRow title="In trash" description="Recoverable until you delete it permanently.">
                <Link href="/trash" className="text-sm font-medium text-accent hover:underline">
                  {stats?.trashItems ?? '…'} {stats?.trashItems === 1 ? 'item' : 'items'}
                </Link>
              </SettingRow>
            </CardBody>
          </Card>
        )}

        {section === 'preferences' && <PreferencesPanel />}

        {section === 'security' && (
          <Card>
            <CardHeader className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Security</h2>
            </CardHeader>
            <CardBody padded={false}>
              <SettingRow
                title="Password"
                description="Change it from your profile; your current password is required."
              >
                <Link
                  href="/profile"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface-elevated px-3.5 text-[13px] font-medium text-foreground transition hover:border-border-strong hover:bg-surface-hover"
                >
                  <KeyRound className="h-3.5 w-3.5 text-muted" />
                  Change password
                </Link>
              </SettingRow>
              <SettingRow
                title="Email"
                description={user?.isEmailVerified ? 'Your email address is verified.' : 'Your email address is not verified yet.'}
              >
                <span
                  className={cn(
                    'rounded-md px-2 py-1 text-xs font-medium',
                    user?.isEmailVerified ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                  )}
                >
                  {user?.isEmailVerified ? 'Verified' : 'Not verified'}
                </span>
              </SettingRow>
              {user?.lastLoginAt && (
                <SettingRow title="Last sign-in" description="The most recent time this account was signed in to.">
                  <span className="text-sm text-foreground-soft">{formatDate(user.lastLoginAt)}</span>
                </SettingRow>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
