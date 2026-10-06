import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { GAME_LOADING_LAYOUTS, type GameLoadingLayout } from '@/components/games/shared/GameLoading';
import type { Subject } from '@/lib/kid-games/types';
import { subjectStyle } from '../theme';

const GLYPHS: Record<Subject, readonly string[]> = {
  hindi: ['अ', 'आ', 'इ'],
  english: ['A', 'B', 'C'],
  math: ['+', '−', '×', '÷'],
};

const NAMES: Record<Subject, string> = { hindi: 'हिंदी', english: 'English', math: 'Maths' };

interface KidGameLoaderProps {
  variant: Subject;
  /** The game's name; defaults to the subject. */
  title?: string;
  label?: string;
  layout?: GameLoadingLayout;
  children?: ReactNode;
}

/**
 * The loading state for every Kid Game, in the same frame as the arcade games' loaders: Hindi
 * letters appear one after another, English letters flip, maths symbols bounce. It is the first
 * thing on screen for a game route, so there is never a generic spinner in front of a game.
 */
export function KidGameLoader({ variant, title, label = 'Getting your game ready…', layout = 'inline', children }: KidGameLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${title ?? NAMES[variant]}: ${label}`}
      style={subjectStyle(variant)}
      className={cn('kg-loader gl-fadein grid w-full place-items-center overflow-hidden', GAME_LOADING_LAYOUTS[layout])}
    >
      <div className="flex flex-col items-center gap-5 px-6 text-center">
        <div className={cn('kg-glyphs', `kg-glyphs-${variant}`)} aria-hidden>
          {GLYPHS[variant].map((glyph, i) => (
            <span key={glyph} style={{ animationDelay: `${i * 0.35}s` }}>
              {glyph}
            </span>
          ))}
        </div>
        <div>
          <p className="text-lg font-bold tracking-wide text-foreground">{title ?? NAMES[variant]}</p>
          <p className="ludo-load-text mt-1.5 text-xs text-muted">{label}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
