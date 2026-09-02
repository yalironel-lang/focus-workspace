/**
 * Multi-click / Cmd+A selection helpers for notebook rich-editables.
 * Triple-click = logical block; quadruple / Cmd+A = full document.
 */

import { findTextPointIn, setSelectionOffsetsIn } from './notebookCaret';
import type { CopyableNotebookBlock } from './notebookCopySelection';

export type MultiClickKind = 'caret' | 'word' | 'block' | 'document';

export function classifyClickDetail(detail: number): MultiClickKind {
  if (detail >= 4) return 'document';
  if (detail === 3) return 'block';
  if (detail === 2) return 'word';
  return 'caret';
}

export function isCopyableTextBlockKind(kind: string): boolean {
  return !(
    kind === 'divider' ||
    kind === 'image-ref' ||
    kind === 'handwriting'
  );
}

/** Plain document text matching buildNotebookCopyText join rules. */
export function buildDocumentPlainFromBlocks(blocks: CopyableNotebookBlock[]): string {
  const slices: string[] = [];
  for (const b of blocks) {
    if (!isCopyableTextBlockKind(b.kind)) continue;
    if (typeof b.text !== 'string') continue;
    if (b.text.length === 0) continue;
    slices.push(b.text);
  }
  return slices.join('\n');
}

export function listRichEditables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-rich-editable="1"]'));
}

/** Select the full plain-text of one contenteditable block (logical paragraph). */
export function selectLogicalBlock(el: HTMLElement, plainLength: number): { start: number; end: number } {
  const end = Math.max(0, plainLength);
  el.focus({ preventScroll: true });
  setSelectionOffsetsIn(el, 0, end);
  return { start: 0, end };
}

function setRangeAcrossEditables(first: HTMLElement, last: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel) return false;

  const startPoint = findTextPointIn(first, 0);
  const lastLen = last.textContent?.length ?? 0;
  const endPoint = findTextPointIn(last, lastLen);

  const range = document.createRange();
  try {
    if (startPoint) {
      range.setStart(startPoint.node, startPoint.offset);
    } else {
      range.setStart(first, 0);
    }
    if (endPoint) {
      range.setEnd(endPoint.node, endPoint.offset);
    } else if (last.lastChild) {
      range.setEndAfter(last.lastChild);
    } else {
      range.setEnd(last, last.childNodes.length);
    }
  } catch {
    return false;
  }

  first.focus({ preventScroll: true });
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

export interface DocumentSelectionResult {
  blockIds: string[];
  firstBlockId: string;
  lastBlockId: string;
  documentPlain: string;
}

/** Select from first rich-editable start through last rich-editable end. */
export function selectNotebookDocument(
  root: HTMLElement,
  blocks: CopyableNotebookBlock[],
): DocumentSelectionResult | null {
  const editables = listRichEditables(root);
  if (editables.length === 0) return null;

  const first = editables[0]!;
  const last = editables[editables.length - 1]!;
  if (!setRangeAcrossEditables(first, last)) return null;

  const blockIds = editables
    .map(el => el.getAttribute('data-block-id'))
    .filter((id): id is string => !!id);

  return {
    blockIds,
    firstBlockId: blockIds[0] ?? first.getAttribute('data-block-id') ?? '',
    lastBlockId: blockIds[blockIds.length - 1] ?? last.getAttribute('data-block-id') ?? '',
    documentPlain: buildDocumentPlainFromBlocks(blocks),
  };
}

/** True when the live DOM selection spans more than one rich-editable. */
export function isMultiBlockDomSelection(root: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return false;
  const editables = listRichEditables(root);
  let hits = 0;
  for (const el of editables) {
    try {
      if (range.intersectsNode(el)) hits += 1;
      if (hits > 1) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}
