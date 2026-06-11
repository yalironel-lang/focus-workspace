import { useEffect, useState } from 'react';

function getCollapsedCaretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rects = range.getClientRects();
  if (rects.length > 0) {
    const r = rects[0]!;
    if (r.width > 0 || r.height > 0) return r;
  }
  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) return rect;
  return null;
}

export function useCaretAnchorRect(
  active: boolean,
  blockId: string | null,
  editorRoot: HTMLElement | null,
  chipReservePx = 56,
): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!active || !blockId || !editorRoot) {
      setRect(null);
      return;
    }

    const measure = () => {
      const caret = getCollapsedCaretRect();
      const el = editorRoot.querySelector<HTMLElement>(`[data-editable-id="${blockId}"]`);
      const fallback = el?.getBoundingClientRect() ?? null;
      const base = caret ?? fallback;
      if (!base) {
        setRect(null);
        return;
      }
      const rootRect = editorRoot.getBoundingClientRect();
      const maxRight = rootRect.right - chipReservePx;
      const left = Math.min(Math.max(base.left, rootRect.left + 4), maxRight - 120);
      setRect(
        new DOMRect(left, base.top, Math.min(base.width || 1, maxRight - left), base.height || 18),
      );
    };

    measure();
    const onScroll = () => measure();
    editorRoot.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll);
    document.addEventListener('selectionchange', onScroll);

    const id = window.setInterval(measure, 120);
    return () => {
      editorRoot.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('selectionchange', onScroll);
      window.clearInterval(id);
    };
  }, [active, blockId, editorRoot, chipReservePx]);

  return rect;
}
