import type { ReactNode } from 'react';

/**
 * The row of buttons under a game board. On phones it sits in the pinned bottom bar and
 * every button is at least 44px tall; on larger screens it is an ordinary wrapping row.
 */
export function GameControls({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 md:mt-5 max-md:[&_button]:min-h-11 max-md:[&_button]:touch-manipulation">
      {children}
    </div>
  );
}
