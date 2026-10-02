/** Ludo: a ring in the four board colours, a tilting die, and four tokens that pulse in turn. */
export function LudoLoader() {
  return (
    <div className="ludo-load" aria-hidden>
      <span className="ludo-load-ring" />
      <span className="ludo-load-ring-inner" />
      <span className="ludo-load-dot ludo-load-dot-y" />
      <span className="ludo-load-dot ludo-load-dot-g" />
      <span className="ludo-load-dot ludo-load-dot-r" />
      <span className="ludo-load-dot ludo-load-dot-b" />
      <span className="ludo-load-die">
        <i />
      </span>
    </div>
  );
}
