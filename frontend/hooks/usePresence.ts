'use client';

import { useEffect, useState } from 'react';

/**
 * Keeps something mounted long enough for its exit animation to play.
 *
 * `open` flips instantly; `mounted` stays true for `exitMs` afterwards, and `state` is the
 * value to put in `data-state` so CSS can run the enter or exit keyframes. Unmounting on
 * the same frame as closing is what made every dialog and menu in the app blink out.
 */
export function usePresence(open: boolean, exitMs = 200) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      // Mounting on open is the point of the hook: it mirrors an external prop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted: open || mounted, state: open ? ('open' as const) : ('closed' as const) };
}
