import type { InlineMark, InlineMarkType } from './notebookInlineMarks';
import { getSelectionClientRect } from './notebookCaret';

export interface ToolbarAnchor {
  top: number;
  left: number;
  width: number;
}

/** Stored selection for toolbar commands — survives selectionchange collapse. */
export interface StoredNotebookSelection {
  blockId: string;
  start: number;
  end: number;
  plain: string;
  marks: InlineMark[];
}

export interface NotebookSelectionState extends StoredNotebookSelection {
  anchor: ToolbarAnchor;
}

export function findRichEditable(root: HTMLElement, blockId: string): HTMLElement | null {
  return root.querySelector(
    `[data-rich-editable="1"][data-block-id="${CSS.escape(blockId)}"]`,
  );
}

export type BlockMorphTarget =
  | 'paragraph'
  | 'title'
  | 'section'
  | 'quote'
  | 'callout'
  | 'bullet'
  | 'ordered'
  | 'task';

export type ToolbarCommand =
  | { type: 'toggleMark'; mark: InlineMarkType; value?: string }
  | { type: 'setFontSize'; px: number }
  | { type: 'setTextColor'; color: string }
  | { type: 'setHighlight'; color: string }
  | { type: 'morphBlock'; target: BlockMorphTarget }
  | { type: 'copy' }
  | { type: 'duplicate' }
  | { type: 'clearFormatting' };

const TOOLBAR_HEIGHT = 44;
const TOOLBAR_GAP = 8;
const VIEWPORT_PAD = 12;

export function computeToolbarAnchor(rect: DOMRect, toolbarWidth = 420): ToolbarAnchor {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  let top = rect.top - TOOLBAR_HEIGHT - TOOLBAR_GAP;
  if (top < VIEWPORT_PAD) {
    top = rect.bottom + TOOLBAR_GAP;
  }
  top = Math.max(VIEWPORT_PAD, Math.min(top, vh - TOOLBAR_HEIGHT - VIEWPORT_PAD));
  let left = rect.left + rect.width / 2 - toolbarWidth / 2;
  left = Math.max(VIEWPORT_PAD, Math.min(left, vw - toolbarWidth - VIEWPORT_PAD));
  return { top, left, width: toolbarWidth };
}

export function anchorFromSelection(): ToolbarAnchor | null {
  const rect = getSelectionClientRect();
  if (!rect) return null;
  return computeToolbarAnchor(rect);
}

export function selectionPlainSlice(plain: string, start: number, end: number): string {
  return plain.slice(start, end);
}

export async function copyRichSlice(plain: string, start: number, end: number): Promise<void> {
  const text = plain.slice(start, end);
  if (!text) return;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === 'undefined') return;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', 'true');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}
