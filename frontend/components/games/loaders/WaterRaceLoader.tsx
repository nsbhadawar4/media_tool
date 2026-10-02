/** Water Race: two buckets filling against each other, with drops falling in. */
export function WaterRaceLoader() {
  return (
    <div className="gl-visual" aria-hidden>
      <div className="gl-buckets">
        <span className="gl-bucket a">
          <span className="gl-water" />
        </span>
        <span className="gl-bucket b">
          <span className="gl-water" />
        </span>
      </div>
      <span className="gl-drop a" />
      <span className="gl-drop b" />
    </div>
  );
}
