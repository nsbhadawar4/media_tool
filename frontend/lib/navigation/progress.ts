'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The top-of-page navigation bar's start signal.
 *
 * The App Router has no "route change started" event, so the bar is started by what begins a
 * navigation — a click on an internal link and back/forward (both seen by NavigationProgress
 * itself), and programmatic navigation through `useNavigationRouter` below — and finished by
 * the URL actually changing (usePathname / useSearchParams). Nothing here touches the router's
 * internals.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

export function onNavigationStart(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when `href` leads somewhere other than the current page (path or query differs). */
export function isNewDestination(href: string, current: Location = window.location): boolean {
  let target: URL;
  try {
    target = new URL(href, current.href);
  } catch {
    return false;
  }
  if (target.origin !== current.origin) return false;
  return target.pathname !== current.pathname || target.search !== current.search;
}

/** Starts the bar, unless `href` is the page already shown (or a hash on it). */
export function startNavigationProgress(href?: string): void {
  if (typeof window === 'undefined') return;
  if (href !== undefined && !isNewDestination(href)) return;
  listeners.forEach((listener) => listener());
}

/**
 * `useRouter()` whose push / replace also start the progress bar. Everything else (back,
 * refresh, prefetch, forward) is the router's own — back and forward are caught as popstate.
 */
export function useNavigationRouter(): ReturnType<typeof useRouter> {
  const router = useRouter();
  return useMemo(
    () => ({
      ...router,
      push: (href, options) => {
        startNavigationProgress(href);
        router.push(href, options);
      },
      replace: (href, options) => {
        startNavigationProgress(href);
        router.replace(href, options);
      },
    }),
    [router],
  );
}
