/**
 * M6.4C — Compact 10×10 table size picker (insert only).
 * Hover highlights a rectangle; click inserts cols×rows via parent callback.
 */

import { useCallback, useId, useState, type ReactNode } from 'react';
import {
  TABLE_SIZE_PICKER_MAX,
  formatTableSizeLabel,
} from '../../../lib/notebookTiptap/candidateTableUi';

function holdSelection(event: React.MouseEvent | React.PointerEvent) {
  event.preventDefault();
  event.stopPropagation();
}

export function NotebookTiptapCandidateTableSizePicker({
  open,
  onClose,
  onPick,
  max = TABLE_SIZE_PICKER_MAX,
  borderColor = 'rgba(255,255,255,0.12)',
}: {
  open: boolean;
  onClose: () => void;
  /** cols, rows — matches product label "C × R". */
  onPick: (cols: number, rows: number) => void;
  max?: number;
  borderColor?: string;
}) {
  const id = useId();
  const [hoverCols, setHoverCols] = useState(1);
  const [hoverRows, setHoverRows] = useState(1);

  const resetHover = useCallback(() => {
    setHoverCols(1);
    setHoverRows(1);
  }, []);

  if (!open) return null;

  const cells: ReactNode[] = [];
  for (let r = 1; r <= max; r++) {
    for (let c = 1; c <= max; c++) {
      const active = c <= hoverCols && r <= hoverRows;
      cells.push(
        <button
          key={`${c}-${r}`}
          type="button"
          tabIndex={-1}
          data-nb-candidate-table-size-cell="1"
          data-nb-table-size-col={c}
          data-nb-table-size-row={r}
          data-nb-table-size-active={active ? '1' : '0'}
          aria-label={formatTableSizeLabel(c, r)}
          title={formatTableSizeLabel(c, r)}
          onPointerDownCapture={holdSelection}
          onMouseDownCapture={holdSelection}
          onMouseEnter={() => {
            setHoverCols(c);
            setHoverRows(r);
          }}
          onMouseOver={() => {
            setHoverCols(c);
            setHoverRows(r);
          }}
          onFocus={() => {
            setHoverCols(c);
            setHoverRows(r);
          }}
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            onPick(c, r);
            resetHover();
          }}
          style={{
            width: 14,
            height: 14,
            padding: 0,
            margin: 0,
            borderRadius: 2,
            border: active
              ? '1px solid rgba(56,189,248,0.95)'
              : '1px solid rgba(148,163,184,0.45)',
            background: active ? 'rgba(56,189,248,0.35)' : 'rgba(30,41,59,0.9)',
            cursor: 'pointer',
            boxSizing: 'border-box',
          }}
        />,
      );
    }
  }

  return (
    <div
      id={id}
      role="dialog"
      aria-label="Insert table size"
      data-nb-candidate-table-size-picker="1"
      onMouseDown={e => e.stopPropagation()}
      onMouseLeave={resetHover}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
          return;
        }
        let nextC = hoverCols;
        let nextR = hoverRows;
        if (e.key === 'ArrowRight') nextC = Math.min(max, hoverCols + 1);
        else if (e.key === 'ArrowLeft') nextC = Math.max(1, hoverCols - 1);
        else if (e.key === 'ArrowDown') nextR = Math.min(max, hoverRows + 1);
        else if (e.key === 'ArrowUp') nextR = Math.max(1, hoverRows - 1);
        else if (e.key === 'Enter') {
          e.preventDefault();
          onPick(hoverCols, hoverRows);
          resetHover();
          return;
        } else return;
        e.preventDefault();
        setHoverCols(nextC);
        setHoverRows(nextR);
      }}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 6,
        padding: 8,
        borderRadius: 8,
        background: 'rgba(10,14,24,0.98)',
        border: `1px solid ${borderColor}`,
        zIndex: 3,
        minWidth: 168,
        boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
      }}
    >
      <div
        data-nb-candidate-table-size-label="1"
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#e2e8f0',
          marginBottom: 6,
          letterSpacing: '0.02em',
        }}
      >
        {formatTableSizeLabel(hoverCols, hoverRows)}
      </div>
      <div
        data-nb-candidate-table-size-grid="1"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${max}, 14px)`,
          gap: 3,
        }}
      >
        {cells}
      </div>
    </div>
  );
}
