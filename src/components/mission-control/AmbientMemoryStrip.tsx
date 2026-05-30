export interface AmbientTrace {
  sectionId: string;
  title: string;
  line: string;
}

interface Props {
  traces: AmbientTrace[];
  onOpenSection: (sectionId: string) => void;
  onCapture?: () => void;
}

/** Borderless typographic memory traces — not a list panel. */
export function AmbientMemoryStrip({ traces, onOpenSection, onCapture }: Props) {
  if (!traces.length && !onCapture) return null;

  return (
    <div className="mc-ambient mc-settle" style={{ animationDelay: '120ms' }}>
      {traces.map(t => (
        <button
          key={t.sectionId}
          type="button"
          className="mc-ambient__line"
          onClick={() => onOpenSection(t.sectionId)}
        >
          <strong>{t.title}</strong>
          {' — '}
          {t.line}
        </button>
      ))}
      {onCapture && (
        <button type="button" className="mc-capture" onClick={onCapture}>
          Capture a thought…
        </button>
      )}
    </div>
  );
}
