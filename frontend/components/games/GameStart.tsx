'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { BackToGames } from './BackToGames';

interface GameStartProps {
  title: string;
  description?: string;
  buttonLabel?: string;
  icon?: LucideIcon;
  onStart: () => void;
  /** Extra content between the description and the button, e.g. a mode picker. */
  children?: ReactNode;
}

/** Overlay shown before a round (and while paused): a title, a hint and one big button. */
export function GameStart({ title, description, buttonLabel = 'Start', icon: Icon = Play, onStart, children }: GameStartProps) {
  return (
    <div className="game-safe-top game-safe-bottom animate-fade-in flex flex-col items-center justify-center gap-3 bg-background/70 p-6 text-center backdrop-blur-sm max-md:fixed max-md:inset-0 max-md:z-50 max-md:bg-background/95 md:absolute md:inset-0 md:z-20">
      <h2 className="anim-rise text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      {description && <p className="anim-rise max-w-xs text-sm text-muted [--i:1]">{description}</p>}
      {children && <div className="anim-rise flex w-full max-w-sm flex-col items-center gap-3 [--i:2]">{children}</div>}
      <Button size="lg" className="anim-rise mt-2 min-h-12 min-w-40 [--i:3]" onClick={onStart}>
        <Icon className="h-4 w-4" />
        {buttonLabel}
      </Button>
      <BackToGames variant="block" className="max-w-52 md:hidden" />
    </div>
  );
}
