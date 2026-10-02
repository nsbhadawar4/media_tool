'use client';

import { useGameLeave } from './GameLeave';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/utils/cn';

interface BackToGamesProps {
  /** 'bar' is the compact pill in the mobile header; 'block' is a full-width button for overlays. */
  variant?: 'bar' | 'block';
  className?: string;
}

/**
 * Back to the games hub. Always /games — never the dashboard and never history — so leaving a
 * game lands in the same place however the player arrived.
 */
export function BackToGames({ variant = 'bar', className }: BackToGamesProps) {
  const leave = useGameLeave();
  return (
    <button
      type="button"
      onClick={leave}
      className={cn(
        'group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface-elevated/80 text-sm font-medium text-foreground backdrop-blur-sm transition duration-150 hover:bg-surface-hover active:scale-95',
        variant === 'bar' ? 'px-3.5' : 'w-full px-4',
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
      {variant === 'bar' ? 'Back' : 'Back to Games'}
    </button>
  );
}
