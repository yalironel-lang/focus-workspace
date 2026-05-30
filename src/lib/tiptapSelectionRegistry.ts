import type { Editor } from '@tiptap/react';
import type { ToolbarAnchor } from './notebookSelectionToolbar';

/** Active TipTap selection owned by MathZone — not RichEditableLine blocks. */
export interface ActiveTiptapSelection {
  editor: Editor;
  from: number;
  to: number;
  text: string;
  anchor: ToolbarAnchor;
  isBold: boolean;
  isItalic: boolean;
}

let activeTiptapSelection: ActiveTiptapSelection | null = null;
let registeredEditor: Editor | null = null;

export function registerTiptapEditor(editor: Editor | null): void {
  registeredEditor = editor;
  if (!editor) activeTiptapSelection = null;
}

export function getRegisteredTiptapEditor(): Editor | null {
  return registeredEditor;
}

export function setActiveTiptapSelection(selection: ActiveTiptapSelection | null): void {
  activeTiptapSelection = selection;
}

export function getActiveTiptapSelection(): ActiveTiptapSelection | null {
  return activeTiptapSelection;
}

export function isNodeInMathEditor(node: Node | null | undefined): boolean {
  if (!node) return false;
  const el = node instanceof Element ? node : node.parentElement;
  return !!el?.closest('[data-math-editor]');
}

export function isSelectionInMathEditor(): boolean {
  if (typeof window === 'undefined') return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  return isNodeInMathEditor(sel.anchorNode);
}
