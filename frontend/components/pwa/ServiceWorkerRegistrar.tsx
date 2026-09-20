'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker, which is what makes the app installable on Android — Chrome
 * will not offer the install prompt without one.
 *
 * In development it does the opposite and tears down any worker left over from a production
 * build on the same origin (localhost is shared between the two). A stale worker serving
 * yesterday's hashed chunks is a genuinely confusing bug to chase, and this removes the
 * possibility rather than relying on remembering to clear it by hand.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((registration) => registration.unregister()))
        .catch(() => {
          // Nothing to clean up, or the browser refused — either way there is nothing to do.
        });
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration is an enhancement: the app works exactly the same without it.
    });
  }, []);

  return null;
}
