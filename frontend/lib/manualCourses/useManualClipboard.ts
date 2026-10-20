'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { parseClip, type Clip } from './builder';

/**
 * The Manual Course builder's clipboard: one copied course, chapter, lesson or question, kept in this
 * browser so it can be pasted into another course (or another tab). Pasting always gives every part a
 * new id (builder.pasted). If storage is unavailable, copying still works for this page.
 */
const KEY = 'manual-course-clipboard';
const EVENT = 'manual-course-clipboard';
let memory: string | null = null;

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useManualClipboard() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const clip = useMemo(() => parseClip(raw), [raw]);
  const copy = useCallback((next: Clip) => {
    memory = JSON.stringify(next);
    try {
      window.localStorage.setItem(KEY, memory);
    } catch {
      // Private mode or storage full: the in-memory copy still pastes on this page.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { clip, copy };
}
