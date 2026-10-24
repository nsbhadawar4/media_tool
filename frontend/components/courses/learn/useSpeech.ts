'use client';

import { useCallback, useEffect, useId, useSyncExternalStore } from 'react';
import { detectLanguage, fallbackLang, pickVoice, SPEECH_PITCH, SPEECH_RATE, SPEECH_VOLUME } from '@/lib/learn/speech';

/**
 * One shared speaker for the whole page: starting any reading stops the one before it, so two
 * messages can never overlap. `activeId` says which button is currently speaking.
 */
let activeId: string | null = null;
let token = 0;
// Chrome can garbage-collect an utterance mid-speech (and never fire onend); keep a reference.
let current: SpeechSynthesisUtterance | null = null;
const listeners = new Set<() => void>();

const emit = (id: string | null) => {
  activeId = id;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const supportedNow = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
const noopSubscribe = () => () => {};

function stopAll() {
  token++;
  current = null;
  if (supportedNow()) window.speechSynthesis.cancel();
  emit(null);
}

function start(id: string, text: string) {
  const synth = window.speechSynthesis;
  const language = detectLanguage(text);
  const mine = ++token;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(synth.getVoices(), language);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else {
    u.lang = fallbackLang(language);
  }
  u.rate = SPEECH_RATE;
  u.pitch = SPEECH_PITCH;
  u.volume = SPEECH_VOLUME;
  // cancel() ends the previous utterance asynchronously; only the newest token may clear the state.
  const finish = () => {
    if (token === mine) {
      if (current === u) current = null;
      emit(null);
    }
  };
  u.onend = finish;
  u.onerror = finish;
  current = u;
  emit(id);
  synth.speak(u);
}

/** Speak/stop control for one piece of text. `supported` is false on the server and in browsers without speech. */
export function useSpeech(text: string) {
  const id = useId();
  const supported = useSyncExternalStore(noopSubscribe, supportedNow, () => false);
  const speaking = useSyncExternalStore(subscribe, () => activeId === id, () => false);

  // Voices load asynchronously in Chrome; touching the list early makes them ready by the first tap.
  useEffect(() => {
    if (!supportedNow()) return;
    window.speechSynthesis.getVoices();
  }, []);
  // A button that leaves the page while speaking takes its speech with it.
  useEffect(() => () => {
    if (activeId === id) stopAll();
  }, [id]);

  const toggle = useCallback(() => {
    if (!supportedNow()) return;
    if (activeId === id) stopAll();
    else if (text.trim()) start(id, text);
  }, [id, text]);

  return { supported, speaking, toggle };
}
