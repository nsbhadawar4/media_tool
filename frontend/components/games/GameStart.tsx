'use client';

import type { LucideIcon } from 'lucide-react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface GameStartProps {
  title: string;
  description?: string;
  buttonLabel?: string;
  icon?: LucideIcon;
  onStart: () => void;
}

/** Overlay shown before a round (and while paused): a title, a hint and one big button. */
export function GameStart({ title, description, buttonLabel = 'Start', icon: Icon = Play, onStart }: GameStartProps) {
  return (
    <div className="animate-fade-in absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/70 p-6 text-center backdrop-blur-sm">
      <h2 className="anim-rise text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      {description && <p className="anim-rise max-w-xs text-sm text-muted [--i:1]">{description}</p>}
      <Button size="lg" className="anim-rise mt-2 min-w-40 [--i:2]" onClick={onStart}>
        <Icon className="h-4 w-4" />
        {buttonLabel}
      </Button>
    </div>
  );
}
