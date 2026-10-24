/**
 * Voice choice for reading lessons aloud. Pure (no window), so it is unit-tested outside the browser.
 * Voices differ between Chrome, Windows, Android and Safari, so nothing is hard-coded by name: the
 * clearest voice for the language is picked from what the device offers.
 */

export type SpeechLanguage = 'en' | 'hi';

/** Child-friendly delivery: slow and clear, never robotic-fast. */
export const SPEECH_RATE = 0.85;
export const SPEECH_PITCH = 1;
export const SPEECH_VOLUME = 1;

/** Hindi/Devanagari text is read in a Hindi voice, everything else in English. */
export const detectLanguage = (text: string): SpeechLanguage => (/[ऀ-ॿ]/.test(text) ? 'hi' : 'en');

export type VoiceLike = { lang: string; default?: boolean };

const norm = (lang: string) => lang.replace('_', '-').toLowerCase();

/**
 * English: en-US, then en-GB, then any other en-* (en-IN only when nothing else is there).
 * Hindi: hi-IN, then any other hi-*. Null means "let the browser use its default for this lang".
 */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], language: SpeechLanguage): T | null {
  const tiers: Array<(l: string) => boolean> =
    language === 'hi'
      ? [(l) => l === 'hi-in', (l) => l === 'hi' || l.startsWith('hi-')]
      : [(l) => l === 'en-us', (l) => l === 'en-gb', (l) => (l === 'en' || l.startsWith('en-')) && l !== 'en-in', (l) => l === 'en-in'];
  for (const matches of tiers) {
    const found = voices.filter((v) => matches(norm(v.lang)));
    if (found.length) return found.find((v) => v.default) ?? found[0]!;
  }
  return null;
}

/** The BCP-47 tag to put on an utterance, used when no matching voice exists. */
export const fallbackLang = (language: SpeechLanguage): string => (language === 'hi' ? 'hi-IN' : 'en-US');
