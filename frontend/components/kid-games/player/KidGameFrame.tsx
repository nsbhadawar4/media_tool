'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import type { ClassLevel, Subject } from '@/lib/kid-games/types';
import { subjectStyle } from '../theme';

interface KidGameFrameProps {
  subject: Subject;
  classLevel: ClassLevel;
  header: ReactNode;
  children: ReactNode;
  /** Pinned to the bottom on phones: feedback, the Next button and the progress bar. */
  footer?: ReactNode;
}

/**
 * The one frame for every Kid Game screen (intro, play, results).
 *
 * Below 768px it is a fixed, full-screen layer one dynamic viewport tall (the app's own header and
 * tab bar are hidden for these routes by AdminShell), with the header under the notch and the
 * footer above the home indicator. From 768px up it is a rounded card inside the app.
 */
export function KidGameFrame({ subject, classLevel, header, children, footer }: KidGameFrameProps) {
  return (
    <div
      style={subjectStyle(subject)}
      data-class={classLevel}
      className="kg-stage game-screen gl-fadein relative flex flex-col max-md:fixed max-md:inset-0 max-md:z-40 max-md:overflow-hidden max-md:bg-background md:mx-auto md:min-h-[72dvh] md:w-full md:max-w-3xl md:overflow-hidden md:rounded-4xl md:border md:border-border md:bg-surface md:shadow-card"
    >
      <div aria-hidden className="kg-wash pointer-events-none absolute inset-x-0 top-0 h-72 opacity-80" />

      <div className="game-safe-top relative z-20 border-b border-border bg-background/75 backdrop-blur-md md:bg-surface/70">{header}</div>

      <main
        className={cn(
          'app-scroll relative z-10 flex flex-1 flex-col items-center overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-8 sm:py-8',
          'max-md:min-h-0',
        )}
      >
        <div className="my-auto w-full max-w-2xl">{children}</div>
      </main>

      {footer && (
        <div className="game-safe-bottom relative z-20 border-t border-border bg-background/85 px-4 pt-3 backdrop-blur-md md:bg-surface/85 md:pb-4 sm:px-8">
          {footer}
        </div>
      )}
    </div>
  );
}
