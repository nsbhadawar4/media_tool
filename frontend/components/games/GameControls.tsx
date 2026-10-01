import type { ReactNode } from 'react';

/** The row of buttons under a game board; wraps on a narrow screen. */
export function GameControls({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-wrap items-center gap-2.5">{children}</div>;
}
