'use client';

import { useEffect, useRef } from 'react';

/**
 * setInterval that always calls the latest callback and can be switched off by passing
 * `null`. The standard way to drive a game clock without stale closures.
 */
export function useInterval(callback: () => void, delayMs: number | null) {
  const saved = useRef(callback);

  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null) return;
    const id = setInterval(() => saved.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}
