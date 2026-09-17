/**
 * M6.4C / M7.7 — Compact table size picker (insert only).
 * Desktop: compact 14px cells. Coarse pointer (iPad): touch-safe hit targets.
 * Portaled + viewport-clamped so it stays visible near screen edges.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  TABLE_SIZE_PICKER_MAX,
  formatTableSizeLabel,
} from '../../../lib/notebookTiptap/candidateTableUi';
import { computeViewportAnchoredMenuPosition } from '../../../lib/notebookTiptap/viewportAnchoredMenu';

function holdSelection(event: React.MouseEvent | React.PointerEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(pointer: coarse)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const onChange = () => setCoarse(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return coarse;
}

type MenuPos = { top: number; left: number; width: number };

export function NotebookTiptapCandidateTableSizePicker({
  open,
  onClose,
  onPick,
  max = TABLE_SIZE_PICKER_MAX,
  borderColor = 'rgba(255,255,255,0.12)',
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  /** cols, rows — matches product label "C × R". */
  onPick: (cols: number, rows: number) => void;
  max?: number;
  borderColor?: string;
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [hoverCols, setHoverCols] = useState(1);
  const [hoverRows, setHoverRows] = useState(1);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const coarse = useCoarsePointer();
  // Compact on fine pointer; touch-safe (~28px) on coarse — not a full 44px grid.
  const cellPx = coarse ? 28 : 14;
  const gapPx = coarse ? 4 : 3;

  const resetHover = useCallback(() => {
    setHoverCols(1);
    setHoverRows(1);
  }, []);

  const reposition = useCallback(() => {
    const width = max * cellPx + (max - 1) * gapPx + 16;
    const height = 28 + max * cellPx + (max - 1) * gapPx + 16;
    const anchor = anchorRef?.current;
    if (!anchor) {
      // Standalone hosts / tests without an anchor — keep picker visible.
      setPos({ top: 8, left: 8, width });
      return;
    }
    const next = computeViewportAnchoredMenuPosition({
      anchor: anchor.getBoundingClientRect(),
      menuWidth: width,
      menuHeight: height,
    });
    setPos({ top: next.top, left: next.left, width });
  }, [anchorRef, cellPx, gapPx, max]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => reposition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    window.visualViewport?.addEventListener('resize', onReposition);
    window.visualViewport?.addEventListener('scroll', onReposition);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      window.visualViewport?.removeEventListener('resize', onReposition);
      window.visualViewport?.removeEventListener('scroll', onReposition);
    };
  }, [open, reposition]);

  if (!open || !pos || typeof document === 'undefined') return null;

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
          data-nb-table-size-cell-px={cellPx}
          aria-label={formatTableSizeLabel(c, r)}
          title={formatTableSizeLabel(c, r)}
          onPointerDownCapture={holdSelection}
          onMouseDownCapture={holdSelection}
          onPointerEnter={() => {
            setHoverCols(c);
            setHoverRows(r);
          }}
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
            width: cellPx,
            height: cellPx,
            minWidth: cellPx,
            minHeight: cellPx,
            padding: 0,
            margin: 0,
            borderRadius: 2,
            border: active
              ? '1px solid rgba(56,189,248,0.95)'
              : '1px solid rgba(148,163,184,0.45)',
            background: active ? 'rgba(56,189,248,0.35)' : 'rgba(30,41,59,0.9)',
            cursor: 'pointer',
            boxSizing: 'border-box',
            touchAction: 'manipulation',
          }}
        />,
      );
    }
  }

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label="Insert table size"
      data-nb-candidate-table-size-picker="1"
      data-nb-table-size-coarse={coarse ? '1' : '0'}
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
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
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        marginTop: 0,
        padding: 8,
        borderRadius: 8,
        background: 'rgba(10,14,24,0.98)',
        border: `1px solid ${borderColor}`,
        zIndex: 10070,
        boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
        boxSizing: 'border-box',
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
          gridTemplateColumns: `repeat(${max}, ${cellPx}px)`,
          gap: gapPx,
        }}
      >
        {cells}
      </div>
    </div>,
    document.body,
  );
}
