'use client';

import { useRouter } from 'next/navigation';
import { LogOut, Monitor, Moon, Sun, User } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useToast } from '@/lib/toast/ToastContext';
import { cn } from '@/utils/cn';

const THEME_OPTIONS = [
  { value: 'light' as const, label: 'Light', icon: Sun },
  { value: 'dark' as const, label: 'Dark', icon: Moon },
  { value: 'system' as const, label: 'System', icon: Monitor },
];

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Signed out');
      router.replace('/login');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account and how the app looks." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-foreground">Account</h2>
          </CardHeader>
          {/* Wraps on narrow screens so a long email never pushes the button off-screen. */}
          <CardBody className="flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <User className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 basis-40">
              <p className="truncate text-sm font-medium text-foreground">{user?.name}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
            <Button variant="secondary" className="shrink-0" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-foreground">Appearance</h2>
          </CardHeader>
          <CardBody>
            <p className="mb-3 text-xs text-muted">Choose how media_tool looks on this device.</p>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium transition',
                      isActive
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-muted hover:bg-surface-hover hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
