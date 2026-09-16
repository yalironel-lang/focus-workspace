/**
 * M7.2A — TipTap Notebook product image insertion helpers.
 * Reuses existing nbImageRef / nbImageSet pipeline (no second representation).
 */

import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection, type EditorState } from '@tiptap/pm/state';
import { GapCursor } from '@tiptap/pm/gapcursor';
import type { ResolvedPos } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { nbImageSet } from '../notebookImageStore';

/** prosemirror-gapcursor marks `valid` @internal; runtime still exposes it (M6.0 uses it). */
function isGapCursorValid($pos: ResolvedPos): boolean {
  return Boolean((GapCursor as unknown as { valid: (p: ResolvedPos) => boolean }).valid($pos));
}

export const NOTEBOOK_IMAGE_FILE_ACCEPT = 'image/*';

/** Product Block menu sentinel — not a dialect morph target. */
export const CANDIDATE_INSERT_IMAGE_MENU_VALUE = '__insert_image__';

export type StoreNotebookImageFileResult =
  | { ok: true; key: string; alt: string }
  | { ok: false; reason: 'not_image' | 'storage_failed' };

/**
 * Where to place a block-level nbImageRef.
 * - `pos`: doc-level index between top-level blocks (GapCursor / block boundary / after atom)
 * - `split`: caret inside a textblock — TipTap insertContent may split the block
 */
export type NbImageInsertTarget =
  | { kind: 'pos'; pos: number }
  | { kind: 'split' };

export function makeNotebookImageKey(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function altFromImageFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim();
}

export function isNotebookImageFile(file: File): boolean {
  return Boolean(file.type && file.type.startsWith('image/'));
}

/** Read file as data URL (in-memory only; never written into canonical body). */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Store image bytes via existing notebook image asset store.
 * On failure: returns ok:false and does not invent a body reference.
 */
export async function storeNotebookImageFile(
  file: File,
  opts?: { key?: string },
): Promise<StoreNotebookImageFileResult> {
  if (!isNotebookImageFile(file)) return { ok: false, reason: 'not_image' };
  const key = opts?.key ?? makeNotebookImageKey();
  const alt = altFromImageFileName(file.name);
  let dataUrl: string;
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch {
    return { ok: false, reason: 'storage_failed' };
  }
  if (!dataUrl) return { ok: false, reason: 'storage_failed' };
  const saved = await nbImageSet(key, dataUrl);
  if (!saved) return { ok: false, reason: 'storage_failed' };
  return { ok: true, key, alt };
}

/**
 * Resolve a block-boundary insertion target from the current selection.
 * Prefer exact top-level positions over inventing empty paragraphs.
 */
export function resolveNbImageInsertTarget(state: EditorState): NbImageInsertTarget {
  const sel = state.selection;
  const { doc } = state;

  if (sel instanceof GapCursor) {
    return { kind: 'pos', pos: sel.$from.pos };
  }

  if (sel instanceof NodeSelection && sel.node.isBlock) {
    return { kind: 'pos', pos: sel.to };
  }

  const $from = sel.$from;
  if ($from.depth < 1) {
    const pos = Math.max(0, Math.min($from.pos, doc.content.size));
    return { kind: 'pos', pos };
  }

  const parent = $from.parent;
  if (!parent.isTextblock) {
    return { kind: 'pos', pos: $from.after(1) };
  }

  const atStart = $from.parentOffset === 0;
  const atEnd = $from.parentOffset === parent.content.size;
  if (atStart) return { kind: 'pos', pos: $from.before(1) };
  if (atEnd) return { kind: 'pos', pos: $from.after(1) };
  return { kind: 'split' };
}

/**
 * Insert existing canonical nbImageRef at the current selection / captured target.
 * Uses tr.insert at a doc-level boundary when possible (no synthetic blank paragraph).
 */
export function insertNbImageRefAtSelection(
  editor: Editor,
  key: string,
  alt = '',
  target?: NbImageInsertTarget,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  if (!key.trim()) return false;

  const nodeType = editor.schema.nodes.nbImageRef;
  if (!nodeType) return false;
  const imageNode = nodeType.create({ key, alt: alt || '', width: null });
  const resolved = target ?? resolveNbImageInsertTarget(editor.state);

  if (resolved.kind === 'pos') {
    const pos = Math.max(0, Math.min(resolved.pos, editor.state.doc.content.size));
    return editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.insert(pos, imageNode);
        try {
          tr.setSelection(NodeSelection.create(tr.doc, pos));
        } catch {
          /* selection best-effort */
        }
        return true;
      })
      .run();
  }

  // Mid-textblock: preserve TipTap split semantics via insertContent.
  return editor
    .chain()
    .focus()
    .insertContent({
      type: 'nbImageRef',
      attrs: { key, alt: alt || '', width: null },
    })
    .run();
}

const BLOCK_BOUNDARY_CLICK_SLOP_PX = 10;

/**
 * If the pointer is in the visual seam between two top-level ProseMirror blocks,
 * return the doc position between them (after block i).
 */
export function findTopLevelBlockBoundaryInsertPos(
  view: EditorView,
  clientX: number,
  clientY: number,
): number | null {
  const { doc } = view.state;
  if (doc.childCount < 2) return null;

  const children = Array.from(view.dom.children) as HTMLElement[];
  if (children.length < 2) return null;

  const editorRect = view.dom.getBoundingClientRect();
  if (clientX < editorRect.left - 4 || clientX > editorRect.right + 4) return null;

  let pos = 0;
  const n = Math.min(children.length, doc.childCount);
  for (let i = 0; i < n - 1; i++) {
    const a = children[i]!.getBoundingClientRect();
    const b = children[i + 1]!.getBoundingClientRect();
    pos += doc.child(i).nodeSize;
    const gapTop = Math.min(a.bottom, b.top);
    const gapBottom = Math.max(a.bottom, b.top);
    const bandTop = gapTop - BLOCK_BOUNDARY_CLICK_SLOP_PX;
    const bandBottom = gapBottom + BLOCK_BOUNDARY_CLICK_SLOP_PX;
    if (clientY >= bandTop && clientY <= bandBottom) {
      return pos;
    }
  }
  return null;
}

/**
 * Place a TipTap selection that represents the boundary at `insertPos`:
 * GapCursor when valid (atom edges); otherwise caret at end of previous textblock
 * or start of next (resolveNbImageInsertTarget then yields the same boundary pos).
 */
export function selectTopLevelBlockBoundary(view: EditorView, insertPos: number): boolean {
  const { doc } = view.state;
  const pos = Math.max(0, Math.min(insertPos, doc.content.size));
  const $pos = doc.resolve(pos);

  if (isGapCursorValid($pos)) {
    view.dispatch(view.state.tr.setSelection(new GapCursor($pos)));
    view.focus();
    return true;
  }

  const nodeBefore = $pos.nodeBefore;
  if (nodeBefore?.isTextblock) {
    const caret = Math.max(1, pos - 1);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, caret)));
    view.focus();
    return true;
  }

  const nodeAfter = $pos.nodeAfter;
  if (nodeAfter?.isTextblock) {
    const caret = pos + 1;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, caret)));
    view.focus();
    return true;
  }

  view.dispatch(view.state.tr.setSelection(TextSelection.near($pos, -1)));
  view.focus();
  return true;
}
