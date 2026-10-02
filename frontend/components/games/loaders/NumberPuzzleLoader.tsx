/** Number Puzzle: eight numbered tiles; the 8 and the 6 take turns sliding into the empty square. */
export function NumberPuzzleLoader() {
  return (
    <div className="gl-visual" aria-hidden>
      <div className="gl-tiles">
        <span className="gl-tile">1</span>
        <span className="gl-tile">2</span>
        <span className="gl-tile">3</span>
        <span className="gl-tile">4</span>
        <span className="gl-tile">5</span>
        <span className="gl-tile gl-tile-slide-y">6</span>
        <span className="gl-tile">7</span>
        <span className="gl-tile gl-tile-slide-x">8</span>
        <span />
      </div>
    </div>
  );
}
