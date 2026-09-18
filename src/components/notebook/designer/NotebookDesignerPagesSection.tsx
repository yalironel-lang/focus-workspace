/**
 * Notebook Designer — Pages section (notebook-level paperStyle SoT).
 * Blank / Ruled / Grid only — Dotted/Graph deferred.
 */

import {
  NOTEBOOK_PAGE_PAPER_STYLES,
  type NotebookPagePaperStyle,
} from '../../../lib/notebookPages/pagePresentation';
import { TOUCH_TARGET_MIN_PX } from '../../../lib/ui/touchTarget';

type Props = {
  paperStyle: NotebookPagePaperStyle;
  onSelectPaperStyle: (style: NotebookPagePaperStyle) => void;
};

const LABELS: Record<NotebookPagePaperStyle, string> = {
  blank: 'Blank',
  ruled: 'Ruled',
  grid: 'Grid',
};

const HINTS: Record<NotebookPagePaperStyle, string> = {
  blank: 'Clean writing surface',
  ruled: 'Horizontal study lines',
  grid: 'Coordinate grid',
};

export function NotebookDesignerPagesSection({ paperStyle, onSelectPaperStyle }: Props) {
  return (
    <section data-nb-designer-section="pages" aria-label="Pages">
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(148,163,184,0.72)',
          marginBottom: 10,
        }}
      >
        Page Style
      </div>
      <p
        style={{
          margin: '0 0 12px',
          fontSize: 12,
          lineHeight: 1.45,
          color: 'rgba(148,163,184,0.7)',
        }}
      >
        The study paper inside the notebook. Independent of Notebook Design.
      </p>
      <div
        data-nb-designer-paper-grid="1"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {NOTEBOOK_PAGE_PAPER_STYLES.map(style => {
          const selected = paperStyle === style;
          return (
            <button
              key={style}
              type="button"
              data-nb-designer-paper={style}
              data-nb-designer-paper-selected={selected ? '1' : '0'}
              aria-pressed={selected}
              aria-label={`Page style ${LABELS[style]}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => onSelectPaperStyle(style)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: TOUCH_TARGET_MIN_PX,
                padding: '10px 12px',
                borderRadius: 10,
                border: selected
                  ? '1.5px solid rgba(56,189,248,0.55)'
                  : '1px solid rgba(148,163,184,0.16)',
                background: selected ? 'rgba(56,189,248,0.10)' : 'rgba(15,23,42,0.55)',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                color: 'rgba(248,250,252,0.92)',
              }}
            >
              <PaperSwatch style={style} selected={selected} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 650 }}>{LABELS[style]}</span>
                <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.72)' }}>
                  {HINTS[style]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PaperSwatch({
  style,
  selected,
}: {
  style: NotebookPagePaperStyle;
  selected: boolean;
}) {
  const line = 'rgba(28,25,23,0.18)';
  let backgroundImage: string | undefined;
  let backgroundSize: string | undefined;
  if (style === 'ruled') {
    backgroundImage = `repeating-linear-gradient(180deg, transparent, transparent 7px, ${line} 7px, ${line} 8px)`;
  } else if (style === 'grid') {
    backgroundImage = `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`;
    backgroundSize = '8px 8px, 8px 8px';
  }
  return (
    <div
      aria-hidden
      data-nb-designer-paper-swatch={style}
      style={{
        width: 36,
        height: 44,
        borderRadius: 6,
        flexShrink: 0,
        backgroundColor: '#f8f6f0',
        backgroundImage,
        backgroundSize,
        border: selected
          ? '1px solid rgba(56,189,248,0.45)'
          : '1px solid rgba(148,163,184,0.2)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
      }}
    />
  );
}
