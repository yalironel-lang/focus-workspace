/** Free Space object as text row (in-section Mission Control flanks) */

interface Props {
  title: string;
  trace: string;
  accent: string;
  onOpen: () => void;
  settleDelay?: number;
}

export function SpatialObjectMass({ title, trace, onOpen, settleDelay = 0 }: Props) {
  return (
    <button
      type="button"
      className="mc-world mc-world--object mc-settle"
      style={{
        animationDelay: settleDelay ? `${Math.min(settleDelay, 80)}ms` : undefined,
        width: '100%',
      }}
      onClick={onOpen}
    >
      <p className="mc-world__title">{title}</p>
      <p className="mc-world__trace">{trace}</p>
    </button>
  );
}
