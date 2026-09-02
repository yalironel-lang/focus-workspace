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
  /** Block kind at session open — used for paragraph/H1/H2 active states. */
  blockKind?: string;
  /**
   * `block` (default): single-block range.
   * `document`: multi-block / full-notebook selection.
   */
  scope?: 'block' | 'document';
  /** Ordered rich-editable block ids when scope === 'document'. */
  blockIds?: string[];
  /** Full document plain text (newline-joined) for copy when scope === 'document'. */
  documentPlain?: string;
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

const TOOLBAR_HEIGHT_SINGLE = 44;
/** Default assumes possible two-row wrap so “above” placement clears selection. */
const TOOLBAR_HEIGHT_DEFAULT = 80;
const TOOLBAR_GAP = 10;
const VIEWPORT_PAD = 12;

export function computeToolbarAnchor(
  rect: DOMRect,
  toolbarWidth = 420,
  toolbarHeight = TOOLBAR_HEIGHT_DEFAULT,
): ToolbarAnchor {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const height = Math.max(TOOLBAR_HEIGHT_SINGLE, toolbarHeight);
  const width = Math.max(120, toolbarWidth);

  const aboveTop = rect.top - height - TOOLBAR_GAP;
  const belowTop = rect.bottom + TOOLBAR_GAP;
  const fitsAbove = aboveTop >= VIEWPORT_PAD;
  const fitsBelow = belowTop + height <= vh - VIEWPORT_PAD;

  let top: number;
  if (fitsAbove) {
    top = aboveTop;
  } else if (fitsBelow) {
    top = belowTop;
  } else {
    // Prefer below when both are tight; clamp within viewport without
    // dragging an “above” placement down onto the selection.
    top = Math.min(belowTop, vh - height - VIEWPORT_PAD);
    top = Math.max(VIEWPORT_PAD, top);
  }

  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(VIEWPORT_PAD, Math.min(left, vw - width - VIEWPORT_PAD));

  return { top, left, width };
}

export function anchorFromSelection(
  toolbarWidth = 420,
  toolbarHeight = TOOLBAR_HEIGHT_DEFAULT,
): ToolbarAnchor | null {
  const rect = getSelectionClientRect();
  if (!rect) return null;
  return computeToolbarAnchor(rect, toolbarWidth, toolbarHeight);
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
