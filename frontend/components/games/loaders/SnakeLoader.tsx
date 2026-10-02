/** Snake: a small grid, a four-segment snake walking round its edge, and a pulsing food dot. */
export function SnakeLoader() {
  return (
    <div className="gl-visual" aria-hidden>
      <span className="gl-snake-grid" />
      <span className="gl-snake-food" />
      <span className="gl-snake-seg" />
      <span className="gl-snake-seg" />
      <span className="gl-snake-seg" />
      <span className="gl-snake-seg head" />
    </div>
  );
}
