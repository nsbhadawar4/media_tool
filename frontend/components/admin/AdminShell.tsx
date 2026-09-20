'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileTabBar } from './MobileTabBar';

export function AdminShell({
  children,
  variant = 'user',
}: {
  children: ReactNode;
  variant?: 'user' | 'admin';
}) {
  // Re-keying the content on navigation restarts its enter animation, which is what makes
  // a route change on a phone read as a screen transition rather than a repaint.
  const pathname = usePathname();

  return (
    // app-viewport-h rather than h-screen: on iOS Safari 100vh is taller than the visible
    // area, which pushes the bottom of the app under the browser chrome.
    <div className="app-viewport-h flex overflow-hidden bg-background">
      {/* First focusable element on the page, so keyboard users can jump the nav. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-foreground"
      >
        Skip to content
      </a>

      <Sidebar variant={variant} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar variant={variant} />
        <main
          id="main-content"
          tabIndex={-1}
          // app-main-pad leaves room for the tab bar below `lg` and reproduces the previous
          // safe-area-only padding from `lg` up; app-scroll stops a flick past the end of a
          // gallery from dragging the whole page.
          className="app-main-pad app-scroll min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pt-6 outline-none sm:px-6 lg:px-8"
        >
          <div key={pathname} className="app-page-enter">
            {children}
          </div>
        </main>
      </div>

      <MobileTabBar variant={variant} />
    </div>
  );
}
