'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export type SoundName =
  | 'tap'
  | 'collect'
  | 'pour'
  | 'success'
  | 'fail'
  | 'win'
  | 'lose'
  | 'tick'
  | 'go'
  | 'eat'
  | 'bonus'
  | 'level'
  | 'dice'
  | 'move'
  | 'capture'
  | 'flip'
  | 'match';

interface Note {
  /** Hz */
  f: number;
  /** Seconds */
  d: number;
  /** Seconds after the sound starts. */
  at?: number;
  type?: OscillatorType;
  /** Frequency the note glides to. */
  to?: number;
  gain?: number;
}

const SOUNDS: Record<SoundName, Note[]> = {
  tap: [{ f: 520, d: 0.05, type: 'triangle', gain: 0.12 }],
  flip: [{ f: 360, d: 0.06, type: 'triangle', to: 480, gain: 0.1 }],
  match: [
    { f: 660, d: 0.1, type: 'sine' },
    { f: 880, d: 0.14, at: 0.08, type: 'sine' },
  ],
  collect: [{ f: 300, d: 0.09, type: 'sine', to: 520, gain: 0.14 }],
  pour: [{ f: 700, d: 0.22, type: 'sine', to: 320, gain: 0.14 }],
  success: [
    { f: 600, d: 0.08, type: 'triangle' },
    { f: 900, d: 0.12, at: 0.07, type: 'triangle' },
  ],
  fail: [{ f: 220, d: 0.22, type: 'sawtooth', to: 120, gain: 0.1 }],
  tick: [{ f: 880, d: 0.04, type: 'square', gain: 0.05 }],
  go: [{ f: 1040, d: 0.16, type: 'triangle', gain: 0.16 }],
  eat: [{ f: 440, d: 0.07, type: 'square', to: 700, gain: 0.07 }],
  bonus: [
    { f: 700, d: 0.07, type: 'square', gain: 0.07 },
    { f: 940, d: 0.07, at: 0.06, type: 'square', gain: 0.07 },
    { f: 1250, d: 0.1, at: 0.12, type: 'square', gain: 0.07 },
  ],
  level: [
    { f: 520, d: 0.09, type: 'triangle' },
    { f: 660, d: 0.09, at: 0.09, type: 'triangle' },
    { f: 880, d: 0.16, at: 0.18, type: 'triangle' },
  ],
  dice: [
    { f: 180, d: 0.04, type: 'square', gain: 0.06 },
    { f: 240, d: 0.04, at: 0.07, type: 'square', gain: 0.06 },
    { f: 200, d: 0.04, at: 0.14, type: 'square', gain: 0.06 },
    { f: 280, d: 0.05, at: 0.22, type: 'square', gain: 0.06 },
  ],
  move: [{ f: 400, d: 0.05, type: 'sine', to: 460, gain: 0.1 }],
  capture: [
    { f: 420, d: 0.12, type: 'sawtooth', to: 140, gain: 0.1 },
    { f: 200, d: 0.12, at: 0.1, type: 'square', to: 90, gain: 0.07 },
  ],
  win: [
    { f: 523, d: 0.12, type: 'triangle' },
    { f: 659, d: 0.12, at: 0.12, type: 'triangle' },
    { f: 784, d: 0.12, at: 0.24, type: 'triangle' },
    { f: 1046, d: 0.3, at: 0.36, type: 'triangle' },
  ],
  lose: [
    { f: 330, d: 0.16, type: 'triangle' },
    { f: 262, d: 0.16, at: 0.15, type: 'triangle' },
    { f: 196, d: 0.3, at: 0.3, type: 'triangle' },
  ],
};

/**
 * Tiny synthesised sound effects — no audio files. The AudioContext is only created inside the
 * first play() call, which every game makes from a click, tap or key press, so nothing sounds
 * (or even initialises) before the player has interacted. Muting is per visit and not stored.
 */
export function useGameSound() {
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
    };
  }, []);

  const play = useCallback((name: SoundName) => {
    if (mutedRef.current || typeof window === 'undefined') return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = (ctxRef.current ??= new Ctor());
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      for (const note of SOUNDS[name]) {
        const start = now + (note.at ?? 0);
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        osc.type = note.type ?? 'sine';
        osc.frequency.setValueAtTime(note.f, start);
        if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, start + note.d);
        const peak = note.gain ?? 0.12;
        amp.gain.setValueAtTime(0.0001, start);
        amp.gain.exponentialRampToValueAtTime(peak, start + 0.01);
        amp.gain.exponentialRampToValueAtTime(0.0001, start + note.d);
        osc.connect(amp).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + note.d + 0.02);
      }
    } catch {
      // Audio is a nicety; a browser that refuses it should never break a game.
    }
  }, []);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
  }, []);

  return { muted, toggleMute, play };
}

/** Mute button for a game's control row. */
export function SoundToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={muted}
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface-elevated/80 text-muted transition duration-150 hover:text-foreground active:scale-95"
    >
      {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
    </button>
  );
}
