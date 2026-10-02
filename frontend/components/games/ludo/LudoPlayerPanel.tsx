import type { CSSProperties } from 'react';
import { cn } from '@/utils/cn';
import { COLOR_HEX, COLOR_NAME, PROGRESS_FINISHED, PROGRESS_YARD } from './ludoLayout';
import type { Controller, GameState, PlayerColor } from './ludoTypes';

interface LudoPlayerPanelProps {
  state: GameState;
  controllers?: Record<PlayerColor, Controller>;
  /** Online: the display name for each colour. */
  names?: Partial<Record<PlayerColor, string>>;
  /** Online: the colour this device plays. */
  youColor?: PlayerColor | null;
  /** Online: colours whose player is currently offline, and colours a bot is playing. */
  offline?: ReadonlySet<PlayerColor>;
  botColors?: ReadonlySet<PlayerColor>;
  /** 'bot' mode names the human "You"; 'local' just uses the colour. */
  vsBot: boolean;
  active: PlayerColor | null;
}

export function playerLabel(color: PlayerColor, controller: Controller, vsBot: boolean): string {
  if (!vsBot) return `${COLOR_NAME[color]} Player`;
  return controller === 'human' ? 'You' : `${COLOR_NAME[color]} Bot`;
}

/** One card per player: who they are, tokens home and in base, and a glowing "turn" tag. */
export function LudoPlayerPanel({ state, controllers, vsBot, active, names, youColor, offline, botColors }: LudoPlayerPanelProps) {
  return (
    <ul
      aria-label="Players"
      className={cn('grid min-w-0 flex-1 gap-2', state.players.length > 2 ? 'grid-cols-2' : 'grid-cols-2', 'lg:grid-cols-1')}
    >
      {state.players.map((p) => {
        const home = p.tokens.filter((t) => t.progress === PROGRESS_FINISHED).length;
        const base = p.tokens.filter((t) => t.progress === PROGRESS_YARD).length;
        const isActive = active === p.color;
        const hex = COLOR_HEX[p.color];
        const controller: Controller = controllers?.[p.color] ?? 'human';
        const isYou = youColor === p.color;
        const label = names ? `${names[p.color] ?? COLOR_NAME[p.color]}${isYou ? ' (You)' : ''}` : playerLabel(p.color, controller, vsBot);
        const isBot = controller === 'bot' || botColors?.has(p.color);
        const isOffline = offline?.has(p.color);
        return (
          <li
            key={p.color}
            className={cn(
              'relative min-w-0 rounded-2xl border px-3 py-2 backdrop-blur-md transition duration-300',
              isActive ? 'bg-white/[0.07]' : 'border-border bg-white/[0.025] opacity-80',
            )}
            style={
              isActive
                ? ({ borderColor: hex, boxShadow: `0 0 22px -6px ${hex}, inset 0 0 0 1px ${hex}55` } as CSSProperties)
                : undefined
            }
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: hex, boxShadow: `0 0 8px ${hex}` }}
              />
              <span className="truncate text-[13px] font-semibold text-foreground">{label}</span>
            </div>
            <p className="mt-0.5 text-[11px] tabular-nums text-muted">
              4 Tokens<span className="max-sm:hidden"> · </span>
              <span className="max-sm:block" />
              <span className="font-semibold text-foreground-soft">{home} Home</span>
              <span className="max-sm:hidden"> · {base} in base</span>
            </p>
            {names && (isOffline || isBot) && (
              <span className="ml-1 text-[9px] font-semibold uppercase tracking-wider text-warning">{isBot ? 'bot' : 'offline'}</span>
            )}
            {isActive && (
              <span
                className="mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-black"
                style={{ background: hex }}
              >
                {names ? (isYou ? 'Your turn' : 'Turn') : isBot ? 'Bot turn' : vsBot ? 'Your turn' : 'Turn'}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
