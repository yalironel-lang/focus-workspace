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
  const {
    markedPages,
    isCurrentPageMarked,
    highlightMode,
    annotateMode,
    eraserMode,
    toggleMarkPage,
    jumpToPage,
    setHighlightMode,
    setAnnotateMode,
    setEraserMode,
    clearCurrentPageInk,
  } = marks;

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
        title="View mode — scroll PDF"
        aria-pressed={!highlightMode && !annotateMode && !eraserMode}
        style={btnStyle(tokens, !highlightMode && !annotateMode && !eraserMode)}
        onClick={() => {
          setHighlightMode(false);
          setAnnotateMode(false);
        }}
      >
        View
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
      <button
        type="button"
        title="Annotate — Apple Pencil draws; finger scrolls"
        aria-pressed={annotateMode}
        style={btnStyle(tokens, annotateMode)}
        onClick={() => setAnnotateMode(!annotateMode)}
      >
        {annotateMode ? 'Annotating…' : 'Annotate'}
      </button>
      {annotateMode || eraserMode ? (
        <>
          <button
            type="button"
            title="Eraser — tap a stroke to remove"
            aria-pressed={eraserMode}
            style={btnStyle(tokens, eraserMode)}
            onClick={() => setEraserMode(!eraserMode)}
          >
            Eraser
          </button>
          <button
            type="button"
            title="Clear ink on this page"
            style={btnStyle(tokens, false)}
            onClick={clearCurrentPageInk}
          >
            Clear page
          </button>
        </>
      ) : null}
      {highlightMode ? (
        <span style={{ fontSize: 10, color: tokens.textMuted }}>Drag over the exam to highlight</span>
      ) : null}
      {annotateMode ? (
        <span style={{ fontSize: 10, color: tokens.textMuted }}>
          Pencil writes · finger scrolls · local only
        </span>
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
