'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface GameLeaveConfig {
  /** Ask "Are you sure you want to quit the game?" first. Off when there is nothing to lose. */
  confirm: boolean;
  /** Runs when the player really quits, before navigating to /games (clears the saved session). */
  onLeave: () => void;
}

const LeaveContext = createContext<(() => void) | null>(null);

/** Confirmation dialog: dark glass panel, fades and rises in. Escape or the backdrop cancels. */
function QuitDialog({ onCancel, onQuit }: { onCancel: () => void; onQuit: () => void }) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const quitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus(); // the safe choice gets focus
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Tab') {
      // Keep focus inside the dialog: two buttons, so Tab simply swaps between them.
      e.preventDefault();
      (document.activeElement === cancelRef.current ? quitRef : cancelRef).current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" onKeyDown={onKeyDown}>
      <div aria-hidden className="quit-overlay absolute inset-0 bg-black/65" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="quit-panel relative w-full max-w-sm rounded-3xl border border-border-strong bg-surface-elevated/95 p-6 text-center shadow-pop"
      >
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/12 text-rose-300">
          <LogOut className="h-5 w-5" />
        </span>
        <h2 id={titleId} className="text-balance text-xl font-semibold tracking-tight text-foreground">
          Are you sure you want to quit the game?
        </h2>
        <p id={descId} className="mt-2 text-sm text-muted">
          Your current game progress will be lost if you quit.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-12 rounded-xl border border-border-strong bg-white/[0.04] text-sm font-semibold tracking-wider text-foreground transition duration-200 hover:bg-white/[0.08] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            CANCEL
          </button>
          <button
            ref={quitRef}
            type="button"
            onClick={onQuit}
            className="min-h-12 rounded-xl border border-rose-400/40 bg-rose-500/90 text-sm font-semibold tracking-wider text-white transition duration-200 hover:bg-rose-500 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300"
          >
            QUIT GAME
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Every way out of a game (Back buttons, the header's EXIT) goes through one request function, so a
 * game in progress is never abandoned by accident and its saved session is cleared only when the
 * player confirms. Page refreshes, tab closes and route remounts never pass through here, which is
 * why they keep the session.
 */
export function GameLeaveProvider({ leave, children }: { leave?: GameLeaveConfig; children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);

  const quit = useCallback(() => {
    leave?.onLeave();
    router.push('/games'); // client-side navigation: no browser reload
  }, [leave, router]);

  const request = useCallback(() => {
    if (leave?.confirm) {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(true);
    } else quit();
  }, [leave?.confirm, quit]);

  const cancel = useCallback(() => {
    setOpen(false);
    // Hand focus back to whatever opened the dialog (normally the EXIT button).
    requestAnimationFrame(() => trigger.current?.focus());
  }, []);

  return (
    <LeaveContext.Provider value={request}>
      {children}
      {open && (
        <QuitDialog
          onCancel={cancel}
          onQuit={() => {
            setOpen(false);
            quit();
          }}
        />
      )}
    </LeaveContext.Provider>
  );
}

/** Returns the function to call to leave the game (asks first when the game needs it). */
export function useGameLeave(): () => void {
  const ctx = useContext(LeaveContext);
  const router = useRouter();
  return ctx ?? (() => router.push('/games'));
}

/** The header EXIT button: a quiet secondary action with a small red accent. */
export function GameExitButton({ className }: { className?: string }) {
  const leave = useGameLeave();
  return (
    <button
      type="button"
      onClick={leave}
      aria-label="Exit game"
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-500/[0.07] px-3.5 text-xs font-semibold tracking-[0.14em] text-rose-200 transition duration-200 hover:border-rose-400/50 hover:bg-rose-500/[0.14] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300',
        className,
      )}
    >
      EXIT
    </button>
  );
}
