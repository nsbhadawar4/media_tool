'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isNewDestination, onNavigationStart } from '@/lib/navigation/progress';

/** Longest the bar may run: past this a navigation has failed or been abandoned. */
const MAX_MS = 12_000;
const TRICKLE_MS = 250;

function prefersReducedMotion(): boolean {
  return document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The slim bar at the very top of the viewport while the app moves to another page.
 *
 * Starts on: a click on an internal link (Next's <Link> or a plain <a>), back / forward
 * (popstate), and programmatic navigation through `useNavigationRouter`. Finishes when the URL
 * the app renders has changed (pathname or query), so redirects — the proxy's, a layout guard's
 * — finish it too, wherever they land. It never blocks the page (pointer-events: none) and never
 * sticks: a navigation that fails or is cancelled is closed after MAX_MS.
 *
 * Left alone: links that open elsewhere (new tab, another origin), Ctrl/⌘/Shift/Alt clicks,
 * downloads and API file links, hash-only and same-URL clicks, and clicks a component stopped
 * (a menu button inside a card link, say).
 *
 * Driven by writing styles to two elements rather than by React state: the bar re-renders
 * nothing else, and it has no server/client difference to hydrate (it renders the same idle
 * markup on both).
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const state = useRef({ active: false, progress: 0, trickle: 0, safety: 0, hide: 0, reset: 0 });

  const paint = useCallback((progress: number, visible: boolean, animate = true) => {
    const root = rootRef.current;
    const bar = barRef.current;
    if (!root || !bar) return;
    bar.style.transition = animate && !prefersReducedMotion() ? 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    bar.style.transform = `scaleX(${progress})`;
    root.style.opacity = visible ? '1' : '0';
  }, []);

  const clearTimers = useCallback(() => {
    const s = state.current;
    window.clearInterval(s.trickle);
    window.clearTimeout(s.safety);
    window.clearTimeout(s.hide);
    window.clearTimeout(s.reset);
  }, []);

  const finish = useCallback(() => {
    const s = state.current;
    if (!s.active) return;
    s.active = false;
    clearTimers();
    s.progress = 1;
    paint(1, true);
    rootRef.current?.setAttribute('data-state', 'done');
    // Let the bar reach the end, then fade it, then put it back at the start unseen.
    s.hide = window.setTimeout(() => paint(1, false), 200);
    s.reset = window.setTimeout(() => {
      s.progress = 0;
      paint(0, false, false);
      rootRef.current?.setAttribute('data-state', 'idle');
    }, 550);
  }, [clearTimers, paint]);

  const start = useCallback(() => {
    const s = state.current;
    if (s.active) return;
    clearTimers();
    s.active = true;
    rootRef.current?.setAttribute('data-state', 'loading');
    // Appear at once, from the left edge.
    s.progress = 0;
    paint(0, true, false);
    if (prefersReducedMotion()) {
      // No creeping motion: a steady bar until the page arrives.
      s.progress = 0.6;
      requestAnimationFrame(() => paint(0.6, true, false));
    } else {
      requestAnimationFrame(() => {
        s.progress = 0.12;
        paint(0.12, true);
      });
      // Eases towards 90%; the last stretch belongs to the page actually arriving.
      s.trickle = window.setInterval(() => {
        s.progress = Math.min(0.9, s.progress + Math.max(0.004, (0.9 - s.progress) * 0.09));
        paint(s.progress, true);
      }, TRICKLE_MS);
    }
    s.safety = window.setTimeout(finish, MAX_MS);
  }, [clearTimers, finish, paint]);

  // The page that was asked for (or a redirect from it) is now the one rendered.
  useEffect(() => {
    finish();
  }, [routeKey, finish]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a');
      if (!anchor || !anchor.getAttribute('href')) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return;
      if (!isNewDestination(url.href)) return;
      start();
    };
    const onPopState = () => start();
    // Bubbling phase: a component that stops the click (a menu inside a card link) never
    // reaches here, so it can't start a bar that no navigation will finish.
    document.addEventListener('click', onClick);
    window.addEventListener('popstate', onPopState);
    const unsubscribe = onNavigationStart(start);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('popstate', onPopState);
      unsubscribe();
      clearTimers();
    };
  }, [start, clearTimers]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      data-state="idle"
      className="nav-progress pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px] opacity-0 transition-opacity duration-300"
    >
      <div ref={barRef} className="nav-progress-bar h-full w-full origin-left" style={{ transform: 'scaleX(0)' }} />
    </div>
  );
}
