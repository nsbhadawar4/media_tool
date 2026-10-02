import { memo, type CSSProperties } from 'react';
import { cn } from '@/utils/cn';
import { COLOR_DARK, COLOR_HEX, COLOR_LIGHT, COLOR_NAME } from './ludoLayout';
import type { PlayerColor } from './ludoTypes';

interface LudoTokenProps {
  color: PlayerColor;
  id: number;
  /** Position of the pawn's centre, in percent of the board. */
  left: number;
  top: number;
  /** Width in percent of the board. */
  size: number;
  scale: number;
  valid: boolean;
  dimmed: boolean;
  moving: boolean;
  returning: boolean;
  /** Changes on every step so the hop animation restarts. */
  hopKey: number;
  onSelect: (tokenId: number) => void;
}

/** A glossy pawn: ground shadow, tapered body, domed head with a specular highlight. */
function LudoTokenView({ color, id, left, top, size, scale, valid, dimmed, moving, returning, hopKey, onSelect }: LudoTokenProps) {
  const main = COLOR_HEX[color];
  const dark = COLOR_DARK[color];
  const light = COLOR_LIGHT[color];
  const gid = `pawn-${color}`;
  return (
    <button
      type="button"
      disabled={!valid}
      onClick={() => onSelect(id)}
      aria-label={`${COLOR_NAME[color]} token ${id + 1}${valid ? ', can move' : ''}`}
      className={cn(
        'ludo-token absolute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default',
        valid && 'ludo-valid cursor-pointer',
        returning && 'ludo-returning',
      )}
      style={
        {
          left: `${left}%`,
          top: `${top}%`,
          width: `${size}%`,
          aspectRatio: '0.86',
          transform: `translate(-50%, -64%) scale(${scale})`,
          zIndex: moving ? 30 : valid ? 20 : 10,
          opacity: dimmed ? 0.45 : 1,
          pointerEvents: valid ? 'auto' : 'none',
          '--ludo-c': main,
        } as CSSProperties
      }
    >
      <span aria-hidden className="ludo-ring" />
      {/* Generous hit area around the small pawn. */}
      <span aria-hidden className="absolute -inset-[30%]" />
      <span key={hopKey} className={cn('ludo-pawn absolute inset-0 block', moving && 'ludo-hop')}>
        <svg viewBox="0 0 40 46" className="h-full w-full overflow-visible" aria-hidden>
          <defs>
            <radialGradient id={gid} cx="35%" cy="28%" r="80%">
              <stop offset="0" stopColor={light} />
              <stop offset="0.45" stopColor={main} />
              <stop offset="1" stopColor={dark} />
            </radialGradient>
          </defs>
          <ellipse cx="20" cy="41" rx="15" ry="4.2" fill="#000" opacity="0.38" />
          <path d="M6 39 Q7 27 15 24 H25 Q33 27 34 39 Q20 44 6 39Z" fill={`url(#${gid})`} stroke={dark} strokeWidth="1" />
          <circle cx="20" cy="15" r="11" fill={`url(#${gid})`} stroke={dark} strokeWidth="1" />
          <ellipse cx="16" cy="10.5" rx="4.2" ry="3" fill="#fff" opacity="0.55" transform="rotate(-25 16 10.5)" />
          <path d="M8 36 Q20 40 32 36" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          {valid && <circle cx="20" cy="15" r="13.5" fill="none" stroke="#fff" strokeWidth="1.6" strokeDasharray="3 2.4" opacity="0.9" />}
        </svg>
      </span>
    </button>
  );
}


/** Memoised: a token re-renders only when its own position or state changes, not on every turn. */
export const LudoToken = memo(LudoTokenView);
