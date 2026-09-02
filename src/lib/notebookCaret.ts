/** Caret and selection helpers for notebook contenteditable lines. */

export interface SelectionOffsets {
  start: number;
  end: number;
  collapsed: boolean;
}

type TextPoint = { node: Text; offset: number };

/** Map a plain-text offset to a DOM text node + offset (depth-first). */
export function findTextPointIn(root: HTMLElement, offset: number): TextPoint | null {
  let remaining = Math.max(0, offset);
  const walk = (node: Node): TextPoint | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      const len = textNode.textContent?.length ?? 0;
      if (remaining <= len) {
        return { node: textNode, offset: remaining };
      }
      remaining -= len;
      return null;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      for (let i = 0; i < node.childNodes.length; i += 1) {
        const found = walk(node.childNodes[i]!);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(root);
}

export function getCaretOffsetIn(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
    return el.textContent?.length ?? 0;
  }
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

export function setCaretOffsetIn(el: HTMLElement, offset: number): void {
  const point = findTextPointIn(el, offset);
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (point) {
    range.setStart(point.node, point.offset);
    range.collapse(true);
  } else {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

export function setSelectionOffsetsIn(el: HTMLElement, start: number, end: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const s = Math.max(0, Math.min(start, end));
  const e = Math.max(s, Math.max(start, end));
  const startPoint = findTextPointIn(el, s);
  const endPoint = findTextPointIn(el, e);
  const range = document.createRange();
  if (startPoint && endPoint) {
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
  } else if (startPoint) {
    range.setStart(startPoint.node, startPoint.offset);
    range.collapse(true);
  } else {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

export function getSelectionOffsetsIn(el: HTMLElement): SelectionOffsets | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;

  const startRange = range.cloneRange();
  startRange.selectNodeContents(el);
  startRange.setEnd(range.startContainer, range.startOffset);
  const start = startRange.toString().length;

  const endRange = range.cloneRange();
  endRange.selectNodeContents(el);
  endRange.setEnd(range.endContainer, range.endOffset);
  const end = endRange.toString().length;

  return { start, end, collapsed: start === end };
}

export function getSelectionClientRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    const rects = range.getClientRects();
    if (rects.length === 0) return null;
    let top = rects[0]!.top;
    let bottom = rects[0]!.bottom;
    let left = rects[0]!.left;
    let right = rects[0]!.right;
    for (let i = 1; i < rects.length; i += 1) {
      const r = rects[i]!;
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }
    return new DOMRect(left, top, right - left, bottom - top);
  }
  return rect;
}

export function rangeHeightFromStartToCaret(editable: HTMLElement): number {
  const sel = window.getSelection();
  const an = sel?.anchorNode;
  if (!sel?.rangeCount || !an || !editable.contains(an)) return 0;
  const range = document.createRange();
  try {
    range.selectNodeContents(editable);
    range.setEnd(an, sel.anchorOffset);
  } catch {
    return 0;
  }
  const h = range.getBoundingClientRect().height;
  return Number.isFinite(h) ? h : 0;
}

export function rangeHeightFromCaretToEnd(editable: HTMLElement): number {
  const sel = window.getSelection();
  const an = sel?.anchorNode;
  if (!sel?.rangeCount || !an || !editable.contains(an)) return 0;
  const range = document.createRange();
  try {
    range.selectNodeContents(editable);
    range.setStart(an, sel.anchorOffset);
  } catch {
    return 0;
  }
  return range.getBoundingClientRect().height;
}

export function lineHeightOf(el: HTMLElement): number {
  const lh = parseFloat(getComputedStyle(el).lineHeight);
  if (!Number.isNaN(lh) && lh > 0) return lh;
  const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
  return fs * 1.5;
}

export function caretInFirstVisualLine(el: HTMLElement): boolean {
  return rangeHeightFromStartToCaret(el) <= lineHeightOf(el) * 1.35;
}

export function caretInLastVisualLine(el: HTMLElement): boolean {
  return rangeHeightFromCaretToEnd(el) <= lineHeightOf(el) * 1.35;
}

export function caretAtVisualLineStart(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !el.contains(sel.anchorNode)) return getCaretOffsetIn(el) === 0;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(true);
  const cr = r.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  if (cr.width === 0 && cr.height === 0) return getCaretOffsetIn(el) === 0;
  return cr.left <= er.left + 10;
}

export function caretAtVisualLineEnd(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !el.contains(sel.anchorNode)) return true;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(true);
  const cr = r.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  if (cr.width === 0 && cr.height === 0) return true;
  return cr.right >= er.right - 10;
}
