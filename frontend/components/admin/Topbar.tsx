'use client';

import { useEffect, useState } from 'react';
import { Menu, Moon, Search, Sun, User } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { GlobalSearchModal } from './GlobalSearchModal';

export function Topbar({ onOpenMobileMenu }: { onOpenMobileMenu: () => void }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { user } = useAuth();
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

          <div className="flex items-center gap-2 rounded-xl border border-border bg-background py-1.5 pl-1.5 pr-1.5 sm:pr-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <User className="h-3.5 w-3.5" />
            </div>
            <span className="hidden max-w-36 truncate text-xs font-medium text-foreground sm:inline">
              {user?.name ?? user?.email ?? 'Admin'}
            </span>
          </div>
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
