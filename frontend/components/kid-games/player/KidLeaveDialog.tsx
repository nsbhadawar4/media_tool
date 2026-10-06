'use client';

import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { DoorOpen } from 'lucide-react';
import type { Subject } from '@/lib/kid-games/types';
import { subjectStyle } from '../theme';

/**
 * "Leave this game?" — the safe choice (CONTINUE) has focus, Escape and the backdrop also continue.
 * Leaving never loses anything already answered: the attempt is saved and can be resumed.
 * Rendered into <body>: the route's enter animation leaves a transform on the page wrapper, which
 * would otherwise pin a fixed overlay to the page instead of the screen.
 */
export function KidLeaveDialog({ subject, onContinue, onExit }: { subject: Subject; onContinue: () => void; onExit: () => void }) {
  const titleId = useId();
  const descId = useId();
  const continueRef = useRef<HTMLButtonElement>(null);
  const exitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    continueRef.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onContinue();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      (document.activeElement === continueRef.current ? exitRef : continueRef).current?.focus();
    }
  };

  return createPortal(
    <div style={subjectStyle(subject)} className="fixed inset-0 z-[90] flex items-center justify-center p-4" onKeyDown={onKeyDown}>
      <div aria-hidden className="quit-overlay absolute inset-0 bg-black/60" onClick={onContinue} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="quit-panel relative w-full max-w-sm rounded-3xl border border-border-strong bg-surface-elevated p-6 text-center shadow-pop"
      >
        <span className="kg-tint kg-text mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
          <DoorOpen className="h-6 w-6" />
        </span>
        <h2 id={titleId} className="text-xl font-bold tracking-tight text-foreground">
          Leave this game?
        </h2>
        <p id={descId} className="mt-2 text-sm text-muted">
          Your answers so far are saved. You can carry on from here next time.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button ref={continueRef} type="button" onClick={onContinue} className="kg-btn min-h-12 rounded-2xl text-sm font-bold tracking-wider">
            CONTINUE
          </button>
          <button
            ref={exitRef}
            type="button"
            onClick={onExit}
            className="min-h-12 rounded-2xl border border-border-strong bg-surface text-sm font-bold tracking-wider text-foreground transition hover:bg-surface-hover active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            EXIT GAME
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
