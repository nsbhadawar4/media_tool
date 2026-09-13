'use client';

import { useState } from 'react';
import { Menu, Moon, Search, Sun, User } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { GlobalSearchModal } from './GlobalSearchModal';

export function Topbar({ onOpenMobileMenu }: { onOpenMobileMenu: () => void }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { admin } = useAuth();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur sm:px-6">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="rounded-lg p-2 text-muted transition hover:bg-surface-hover hover:text-foreground lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted transition hover:border-accent/40 sm:max-w-sm"
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Search your library…</span>
          <span className="sm:hidden">Search…</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-hover hover:text-foreground"
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <div className="flex items-center gap-2 rounded-xl border border-border bg-background py-1.5 pl-1.5 pr-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <User className="h-3.5 w-3.5" />
            </div>
            <span className="hidden max-w-[9rem] truncate text-xs font-medium text-foreground sm:inline">
              {admin?.name ?? admin?.email ?? 'Admin'}
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
