import type { CSSProperties } from 'react';
import { cn } from '@/utils/cn';
import { CAPACITY, type Team } from './waterRaceLogic';

export interface LaneStyle {
  name: string;
  color: string;
}

/** Where the bucket rests, as a percentage of the lane. */
const WELL = { left: 14, bottom: 24 };
const TANK = { left: 82, bottom: 82 };
/** Tank occupies the bottom 78% of the lane; this is how tall its water can get. */
const TANK_H = 78;

const SPLASH = [
  { sx: -26, sy: -34 },
  { sx: -14, sy: -48 },
  { sx: 0, sy: -54 },
  { sx: 14, sy: -46 },
  { sx: 26, sy: -32 },
  { sx: 6, sy: -28 },
];

function hint(team: Team): string {
  switch (team.location) {
    case 'well':
      return team.load >= CAPACITY ? 'Full — carry it →' : `Scoop  ${team.load}/${CAPACITY}`;
    case 'to-tank':
      return 'Carrying…';
    case 'tank':
      return team.load > 0 ? 'Pour it in!' : '← Head back';
    case 'to-well':
      return 'Returning…';
  }
}

/**
 * One team's side of the race: a well on the left, a tank on the right and the bucket that
 * travels between them. The bucket moves with CSS transitions timed to the trip length, so it
 * glides without the game re-rendering every frame.
 */
export function WaterLane({
  team,
  style,
  isBot,
  isWinner,
  active,
}: {
  team: Team;
  style: LaneStyle;
  isBot: boolean;
  isWinner: boolean;
  active: boolean;
}) {
  const { color } = style;
  const pct = Math.round(team.water);
  const atTankSide = team.location === 'tank' || team.location === 'to-tank';
  const target = atTankSide ? TANK : WELL;
  const travelling = team.location === 'to-tank' || team.location === 'to-well';
  const tankTop = (TANK_H * team.water) / 100;

  return (
    <section className="min-w-0" aria-label={style.name}>
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
          <span className="truncate">{style.name}</span>
          {isBot && <span className="rounded-md bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-subtle">Bot</span>}
        </h2>
        <div className="flex items-center gap-2.5">
          {team.combo >= 2 && (
            <span
              key={team.combo}
              className="anim-pop rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-wide"
              style={{ color, borderColor: `${color}66`, backgroundColor: `${color}1f` }}
            >
              COMBO ×{team.combo}
            </span>
          )}
          <span className="text-sm font-semibold tabular-nums" style={{ color }}>
            {pct}%
          </span>
        </div>
      </div>

      <div
        className={cn(
          'relative h-[22dvh] min-h-[132px] overflow-hidden rounded-2xl border bg-background/60 transition-shadow duration-500 md:h-[190px]',
          isWinner ? 'border-white/30' : 'border-border-strong',
        )}
        style={{
          backgroundImage: `radial-gradient(70% 90% at 82% 100%, ${color}22, transparent 70%), radial-gradient(40% 60% at 14% 100%, ${color}14, transparent 70%)`,
          boxShadow: isWinner ? `0 0 44px -10px ${color}` : active && pct > 0 ? `0 0 40px -22px ${color}` : undefined,
        }}
      >
        {/* Progress meter along the top edge */}
        <div
          className="absolute inset-x-0 top-0 h-1 bg-white/5"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${style.name} tank`}
        >
          <div className="h-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>

        {/* Ground */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[10%] bg-white/4" />

        {/* Path the bucket takes */}
        <div
          aria-hidden
          className="absolute h-px origin-left border-t border-dashed border-white/15"
          style={{
            left: `${WELL.left}%`,
            bottom: `${(WELL.bottom + TANK.bottom) / 2}%`,
            width: `${TANK.left - WELL.left}%`,
          }}
        />

        {/* Well */}
        <div className="absolute bottom-0 left-[4%] h-[28%] w-[20%]">
          <div className="absolute inset-0 overflow-hidden rounded-t-xl border border-border-strong bg-[#0c1119]">
            <div className="absolute inset-x-0 top-1.5 bottom-0 overflow-hidden" style={{ color }}>
              <svg viewBox="0 0 200 16" preserveAspectRatio="none" className="water-wave absolute left-0 top-0 h-3 w-[200%]" fill="currentColor" aria-hidden>
                <path d="M0 8 Q25 0 50 8 T100 8 T150 8 T200 8 V16 H0Z" />
              </svg>
              <div className="absolute inset-x-0 top-2 bottom-0" style={{ backgroundColor: color, opacity: 0.85 }} />
            </div>
          </div>
          <span className="absolute -top-px left-1/2 -translate-x-1/2 text-[9px] font-medium uppercase tracking-widest text-white/35" />
          {team.scoopTick > 0 && (
            <div key={team.scoopTick} aria-hidden className="pointer-events-none absolute left-1/2 top-0">
              {SPLASH.map((d, i) => (
                <span
                  key={i}
                  className="wr-splash absolute h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: color, '--sx': `${d.sx}px`, '--sy': `${d.sy}px` } as CSSProperties}
                />
              ))}
            </div>
          )}
        </div>

        {/* Tank */}
        <div
          className="absolute bottom-0 right-[4%] w-[28%] overflow-hidden rounded-t-2xl border border-border-strong bg-white/3"
          style={{ height: `${TANK_H}%` }}
        >
          <div className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out" style={{ height: `${team.water}%` }}>
            {team.water > 0 && (
              <>
                <div className="absolute inset-x-0 -top-2.5 h-3 overflow-hidden" style={{ color }}>
                  <svg viewBox="0 0 200 16" preserveAspectRatio="none" className="water-wave-slow absolute left-0 top-0 h-3 w-[200%]" fill="currentColor" aria-hidden>
                    <path d="M0 9 Q25 1 50 9 T100 9 T150 9 T200 9 V16 H0Z" />
                  </svg>
                  <svg viewBox="0 0 200 16" preserveAspectRatio="none" className="water-wave absolute left-0 top-0 h-3 w-[200%]" fill="currentColor" aria-hidden>
                    <path d="M0 8 Q25 0 50 8 T100 8 T150 8 T200 8 V16 H0Z" />
                  </svg>
                </div>
                <div
                  className="absolute inset-0"
                  style={{ backgroundImage: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 50%, #0b1220))` }}
                />
              </>
            )}
          </div>
          {/* Glass highlight and level ticks */}
          <span aria-hidden className="absolute inset-y-2 left-1.5 w-1 rounded-full bg-white/15" />
          {[75, 50, 25].map((t) => (
            <span key={t} aria-hidden className="absolute right-0 h-px w-2 bg-white/30" style={{ bottom: `${t}%` }} />
          ))}
        </div>

        {/* Pour stream and floating points */}
        {team.pourTick > 0 && (
          <>
            <span
              key={`s${team.pourTick}`}
              aria-hidden
              className="wr-stream pointer-events-none absolute w-1.5 -translate-x-1/2 rounded-full"
              style={{
                left: `${TANK.left}%`,
                bottom: `${tankTop}%`,
                height: `${Math.max(2, TANK.bottom - tankTop)}%`,
                backgroundColor: color,
              }}
            />
            <span
              key={`p${team.pourTick}`}
              aria-hidden
              className="wr-float pointer-events-none absolute -translate-x-1/2 text-sm font-bold tabular-nums"
              style={{ left: `${TANK.left}%`, bottom: `${TANK_H - 8}%`, color }}
            >
              +{team.lastPoints}
            </span>
          </>
        )}

        {/* Bucket */}
        <div
          aria-hidden
          className="absolute z-10 -translate-x-1/2"
          style={{
            left: `${target.left}%`,
            bottom: `${target.bottom}%`,
            transition: `left ${team.travelMs}ms cubic-bezier(0.45, 0.05, 0.55, 0.95), bottom ${team.travelMs}ms cubic-bezier(0.3, 0.7, 0.4, 1)`,
          }}
        >
          <div key={team.pourTick} className={cn('origin-top-right', team.pourTick > 0 && 'wr-tilt')}>
            <div key={team.scoopTick} className={cn(travelling && 'wr-sway', !travelling && team.scoopTick > 0 && 'wr-dip')}>
              <svg viewBox="0 0 44 40" className="h-9 w-10 drop-shadow-lg md:h-11 md:w-12">
                <defs>
                  <clipPath id={`bucket-${team.id}`}>
                    <path d="M6 12 H38 L33 38 H11 Z" />
                  </clipPath>
                </defs>
                <path d="M10 12 Q22 -4 34 12" fill="none" stroke="#9aa0ad" strokeWidth="2" strokeLinecap="round" />
                <path d="M6 12 H38 L33 38 H11 Z" fill="#1a1d27" stroke="#c4c9d6" strokeWidth="2" strokeLinejoin="round" />
                <g clipPath={`url(#bucket-${team.id})`}>
                  <rect
                    x="0"
                    width="44"
                    fill={color}
                    className="transition-[y,height] duration-200 ease-out"
                    y={38 - (26 * team.load) / CAPACITY}
                    height={(26 * team.load) / CAPACITY + 1}
                  />
                </g>
                <path d="M6 12 H38" stroke="#e5e7ee" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>

        {/* What to do next */}
        {active && (
          <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center">
            <span className="rounded-full border border-white/10 bg-black/45 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/70 backdrop-blur-sm">
              {hint(team)}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
