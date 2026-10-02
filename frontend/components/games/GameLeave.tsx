'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export interface GameLeaveConfig {
  /** Ask "Leave this game?" first. Off when there is nothing to lose (setup screen, finished game). */
  confirm: boolean;
  /** Runs when the player really leaves, before navigating to /games (e.g. clear the saved session). */
  onLeave: () => void;
}

const LeaveContext = createContext<(() => void) | null>(null);

/**
 * Every way out of a game (the Back buttons, an Exit button) goes through one request function,
 * so a game in progress is never abandoned by accident and its saved session is cleared only when
 * the player confirms. A page refresh never passes through here, which is why it keeps the session.
 */
export function GameLeaveProvider({ leave, children }: { leave?: GameLeaveConfig; children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const go = useCallback(() => {
    leave?.onLeave();
    router.push('/games');
  }, [leave, router]);

  const request = useCallback(() => {
    if (leave?.confirm) setOpen(true);
    else go();
  }, [leave?.confirm, go]);

  const value = useMemo(() => request, [request]);

  return (
    <LeaveContext.Provider value={value}>
      {children}
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Leave this game?" size="sm" hideCloseButton>
        <p className="text-sm text-muted">Your current game will be lost.</p>
        <div className="mt-5 flex flex-col gap-2.5">
          <Button size="lg" className="min-h-12 w-full" onClick={() => setOpen(false)}>
            CONTINUE GAME
          </Button>
          <Button
            size="lg"
            variant="danger"
            className="min-h-12 w-full"
            onClick={() => {
              setOpen(false);
              go();
            }}
          >
            LEAVE GAME
          </Button>
        </div>
      </Modal>
    </LeaveContext.Provider>
  );
}

/** Returns the function to call to leave the game (asks first when the game needs it). */
export function useGameLeave(): () => void {
  const ctx = useContext(LeaveContext);
  const router = useRouter();
  return ctx ?? (() => router.push('/games'));
}
