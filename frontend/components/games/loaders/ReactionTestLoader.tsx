/** Reaction Test: one light that eases from READY (red) to WAIT... (amber) to GO (green), with slow fades. */
export function ReactionTestLoader() {
  return (
    <div className="gl-visual" aria-hidden>
      <div className="gl-light">
        <span className="gl-light-ring" />
        <span className="gl-light-core r" />
        <span className="gl-light-core a" />
        <span className="gl-light-core g" />
        <span className="gl-light-text r">READY</span>
        <span className="gl-light-text a">WAIT...</span>
        <span className="gl-light-text g">GO</span>
      </div>
    </div>
  );
}
