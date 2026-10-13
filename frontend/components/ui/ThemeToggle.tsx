'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { cn } from '@/utils/cn';

/**
 * The light / dark switch, shared by the app's top bar (user and admin) and the public header.
 *
 * Both icons render and CSS picks one off `data-theme` (set before paint), so the icon never
 * mismatches during hydration. When the administrator allows a single theme the pre-paint script
 * sets `data-theme-lock` and CSS hides the switch (`.theme-switch` in globals.css) — no flash of a
 * switch that then disappears.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={cn('theme-switch group items-center justify-center rounded-xl text-muted transition hover:bg-surface-hover hover:text-foreground active:scale-90', className)}
      aria-label={`Switch to ${next} theme`}
      data-tooltip="Toggle theme"
    >
      <Sun className="theme-icon-dark h-4 w-4 transition-transform duration-500 group-hover:rotate-90" aria-hidden />
      <Moon className="theme-icon-light h-4 w-4 transition-transform duration-500 group-hover:-rotate-12" aria-hidden />
    </button>
  );
}
