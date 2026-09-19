'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Menu, Moon, Search, Settings, Sun, User } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { useToast } from '@/lib/toast/ToastContext';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { GlobalSearchModal } from './GlobalSearchModal';

export function Topbar({ onOpenMobileMenu }: { onOpenMobileMenu: () => void }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // navigator is browser-only, so the hint renders as Ctrl until this resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));

    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleSignOut = async () => {
    try {
      await logout();
      toast.success('Signed out');
      router.replace('/login');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-surface/85 px-4 backdrop-blur-md sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="-ml-1 shrink-0 rounded-lg p-2 text-muted transition hover:bg-surface-hover hover:text-foreground lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted transition hover:border-accent/40 hover:text-foreground sm:max-w-sm"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">Search your library…</span>
          <kbd className="ml-auto hidden shrink-0 rounded-md border border-border bg-surface px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted sm:inline">
            {isMac ? '⌘' : 'Ctrl '}K
          </kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-hover hover:text-foreground"
            aria-label="Toggle light and dark theme"
            title="Toggle theme"
          >
            {/*
              Both icons render and CSS picks one, keyed off the same `data-theme`
              attribute the pre-paint script sets. Choosing in JS would either mismatch
              during hydration or flash the wrong icon until the theme effect runs.
            */}
            <Sun className="theme-icon-dark h-4 w-4" aria-hidden />
            <Moon className="theme-icon-light h-4 w-4" aria-hidden />
          </button>

          {/*
            The avatar and name are the menu's trigger rather than a label sitting next to
            one: it is the target people already aim at, and a lone caret beside it would be
            a second, smaller thing to hit for the same result.
          */}
          <DropdownMenu
            triggerSize="auto"
            triggerLabel="Account menu"
            triggerClassName="gap-2 border border-border bg-background py-1.5 pl-1.5 pr-1.5 hover:bg-surface-hover sm:pr-2.5"
            width={224}
            trigger={
              <>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <User className="h-3.5 w-3.5" />
                </span>
                <span className="hidden max-w-36 truncate text-xs font-medium text-foreground sm:inline">
                  {user?.name ?? user?.email ?? 'Account'}
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-muted sm:inline" aria-hidden />
              </>
            }
            header={
              <div className="border-b border-border px-3 py-2.5">
                <p className="truncate text-sm font-medium text-foreground">{user?.name ?? 'Account'}</p>
                {/* The signed-in address only — never a role, an id, or anything else about the account. */}
                <p className="truncate text-xs text-muted">{user?.email}</p>
              </div>
            }
            items={[
              {
                label: 'Settings',
                icon: <Settings className="h-4 w-4" />,
                onClick: () => router.push('/settings'),
              },
              { label: 'Sign out', icon: <LogOut className="h-4 w-4" />, onClick: handleSignOut, danger: true },
            ]}
          />
        </div>
      </header>

      <GlobalSearchModal
        key={isSearchOpen ? 'search-open' : 'search-closed'}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
}
