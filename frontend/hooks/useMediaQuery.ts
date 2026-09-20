import { useSyncExternalStore } from 'react';

/**
 * Subscribes to a CSS media query.
 *
 * `useSyncExternalStore` rather than state-plus-effect so there is no render where the
 * answer is stale. The server snapshot is `false`, which keeps the desktop branch as the
 * markup the server produces — layout is chosen with CSS wherever possible, and this is
 * kept for the few places where the *behaviour* has to differ, not just the styling.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onStoreChange);
      return () => list.removeEventListener('change', onStoreChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * True below Tailwind's `lg`, the width at which the sidebar appears. Everything narrower
 * than this gets the bottom tab bar and sheet-based navigation.
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 1023.98px)');
}
