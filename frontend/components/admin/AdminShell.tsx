'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileTabBar } from './MobileTabBar';
import { MobileDrawer } from './MobileDrawer';
import { LogoutPromptProvider } from '@/components/auth/LogoutPrompt';
import { isKidGameRoute } from '@/lib/kid-games/routes';

const COLLAPSED_KEY = 'media_tool_sidebar_collapsed';

export function AdminShell({
  children,
  variant = 'user',
}: {
  children: ReactNode;
  variant?: 'user' | 'admin';
}) {
  // Re-keying the content on navigation restarts its enter animation, which is what makes
  // a route change read as a screen transition rather than a repaint.
  const pathname = usePathname();
  // A single game (not a hub): on phones it takes over the whole screen.
  const isImmersiveGame = /^\/games\/[^/]+\/?$/.test(pathname) || isKidGameRoute(pathname);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Restored after mount: localStorage does not exist on the server, so reading it during
  // render would make the first client paint differ from the server HTML.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      // Storage can be blocked; an expanded sidebar is the right default anyway.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Not remembering the choice is harmless.
      }
      return next;
    });
  };

  return (
    <LogoutPromptProvider>
      {/* app-viewport-h rather than h-screen: on iOS Safari 100vh is taller than the visible
    area, which pushes the bottom of the app under the browser chrome. */}
      <div className="app-viewport-h relative flex overflow-hidden bg-background">
        {/* Two faint accent washes behind everything; the content sits above them. */}
        <div aria-hidden className="app-ambient pointer-events-none absolute inset-0" />

        {/* First focusable element on the page, so keyboard users can jump the nav. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-foreground"
        >
          Skip to content
        </a>

        <Sidebar variant={variant} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />

        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className={isImmersiveGame ? 'max-md:hidden' : undefined}>
            <Topbar variant={variant} onOpenNav={() => setIsDrawerOpen(true)} />
          </div>
          <main
            id="main-content"
            data-immersive={isImmersiveGame}
            tabIndex={-1}
            // app-main-pad leaves room for the tab bar below `lg` and reproduces the previous
            // safe-area-only padding from `lg` up; app-scroll stops a flick past the end of a
            // gallery from dragging the whole page.
            className="app-main-pad app-scroll min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pt-6 outline-none sm:px-6 lg:px-8 lg:pt-8 max-md:data-[immersive=true]:p-0"
          >
            <div
              key={pathname}
              className={`app-page-enter mx-auto w-full max-w-[1400px] ${isImmersiveGame ? 'app-immersive-route' : ''}`}
            >
              {children}
            </div>
          </main>
        </div>

        <MobileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} variant={variant} />
        <div className={isImmersiveGame ? 'max-md:hidden' : undefined}>
          <MobileTabBar variant={variant} />
        </div>
      </div>
    </LogoutPromptProvider>
  );
}
