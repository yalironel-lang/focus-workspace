import type { CSSProperties } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { PdfStudyMarksChrome } from '../../lib/pdfStudyMarks/usePdfStudyMarks';

type Props = {
  tokens: AtmosphereTokens;
  marks: PdfStudyMarksChrome;
  currentPage: number;
};

function btnStyle(tokens: AtmosphereTokens, active: boolean): CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: 6,
    border: `1px solid ${active ? `${tokens.accent}66` : tokens.cardBorder}`,
    background: active ? `${tokens.accent}22` : tokens.wellBg,
    color: active ? tokens.accent : tokens.textSecondary,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

export function StudySessionPdfMarksBar({ tokens, marks, currentPage }: Props) {
  const { markedPages, isCurrentPageMarked, highlightMode, toggleMarkPage, jumpToPage, setHighlightMode } =
    marks;

  return (
    <div
      role="toolbar"
      aria-label="PDF study marks"
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
        padding: '5px 12px',
        borderBottom: `1px solid ${tokens.cardBorder}`,
        background: `${tokens.wellBg}ee`,
      }}
    >
      <button
        type="button"
        title={isCurrentPageMarked ? 'Unmark page' : 'Mark page for later'}
        aria-pressed={isCurrentPageMarked}
        style={btnStyle(tokens, isCurrentPageMarked)}
        onClick={toggleMarkPage}
      >
        {isCurrentPageMarked ? 'Marked' : 'Mark page'}
      </button>
      <button
        type="button"
        title="Drag on the PDF to highlight a region"
        aria-pressed={highlightMode}
        style={btnStyle(tokens, highlightMode)}
        onClick={() => setHighlightMode(!highlightMode)}
      >
        {highlightMode ? 'Highlighting…' : 'Highlight'}
      </button>
      {highlightMode ? (
        <span style={{ fontSize: 10, color: tokens.textMuted }}>Drag over the exam to highlight</span>
      ) : null}
      {markedPages.length > 0 ? (
        <>
          <span style={{ fontSize: 10, color: tokens.textGhost }}>|</span>
          <span style={{ fontSize: 10, color: tokens.textMuted }}>Marked:</span>
          {markedPages.map(p => (
            <button
              key={p}
              type="button"
              style={btnStyle(tokens, p === currentPage)}
              onClick={() => jumpToPage(p)}
            >
              p.{p}
            </button>
          ))}
        </>
      ) : null}
    </div>
  );
}
