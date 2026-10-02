/**
 * Full-cover "3… 2… 1… GO!" overlay. Pointer events pass through nothing: while it shows the
 * round has not started, so the board underneath should not be playable.
 */
export function GameCountdown({ value, color = '#7c5cff' }: { value: string | number; color?: string }) {
  return (
    <div
      aria-live="assertive"
      className="game-safe-top game-safe-bottom animate-fade-in flex items-center justify-center bg-background/60 backdrop-blur-sm max-md:fixed max-md:inset-0 max-md:z-50 md:absolute md:inset-0 md:z-20"
    >
      <div key={value} className="anim-pop text-center">
        <p
          className="text-8xl font-bold tracking-tight tabular-nums text-foreground"
          style={{ textShadow: `0 0 48px ${color}` }}
        >
          {value}
        </p>
        {typeof value === 'number' && <p className="mt-2 text-xs font-medium uppercase tracking-[0.3em] text-muted">Get ready</p>}
      </div>
    </div>
  );
}
