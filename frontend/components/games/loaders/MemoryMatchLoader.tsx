const FACES = ['♥', '★', '◆'] as const;

/** Memory Match: three cards that flip over one after another, each showing a symbol. */
export function MemoryMatchLoader() {
  return (
    <div className="gl-visual" aria-hidden>
      <div className="gl-cards">
        {FACES.map((face) => (
          <span key={face} className="gl-card">
            <b>?</b>
            <i>{face}</i>
          </span>
        ))}
      </div>
    </div>
  );
}
