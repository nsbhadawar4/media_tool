'use client';

import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AdminShell({
  children,
  variant = 'user',
}: {
  children: ReactNode;
  variant?: 'user' | 'admin';
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

      <Sidebar
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        variant={variant}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />
        <main
          id="main-content"
          tabIndex={-1}
          className="app-safe-bottom min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 outline-none sm:px-6 lg:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
