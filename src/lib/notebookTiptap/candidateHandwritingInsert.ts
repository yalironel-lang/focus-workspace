/**
 * M7.3A — TipTap Notebook product handwriting insertion helpers.
 * Reuses existing ::hw::{key}:: / nbHandwriting / fw_notebook_handwriting_v1 model.
 */

import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { newHandwritingKey } from '../handwritingTypes';
import {
  resolveNbImageInsertTarget,
  type NbImageInsertTarget,
} from './candidateImageInsert';

/** Product Block menu sentinel — not a dialect morph target. */
export const CANDIDATE_INSERT_HANDWRITING_MENU_VALUE = '__insert_handwriting__';

export type NbHandwritingInsertTarget = NbImageInsertTarget;

export { newHandwritingKey };

export function resolveNbHandwritingInsertTarget(
  state: Parameters<typeof resolveNbImageInsertTarget>[0],
): NbHandwritingInsertTarget {
  return resolveNbImageInsertTarget(state);
}

/**
 * Insert existing canonical nbHandwriting at the current selection / captured target.
 * Uses tr.insert at a doc-level boundary when possible (no synthetic blank paragraph).
 */
export function insertNbHandwritingAtSelection(
  editor: Editor,
  key: string,
  target?: NbHandwritingInsertTarget,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  if (!key.trim()) return false;

  const nodeType = editor.schema.nodes.nbHandwriting;
  if (!nodeType) return false;
  const hwNode = nodeType.create({ key });
  const resolved = target ?? resolveNbHandwritingInsertTarget(editor.state);

  if (resolved.kind === 'pos') {
    const pos = Math.max(0, Math.min(resolved.pos, editor.state.doc.content.size));
    return editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.insert(pos, hwNode);
        try {
          tr.setSelection(NodeSelection.create(tr.doc, pos));
        } catch {
          /* best-effort */
        }
        return true;
      })
      .run();
  }

  return editor
    .chain()
    .focus()
    .insertContent({
      type: 'nbHandwriting',
      attrs: { key },
    })
    .run();
}

/**
 * Remove the currently selected nbHandwriting via NodeSelection deletion.
 * Does not touch the handwriting asset store (Undo / notebook restore must keep assets).
 */
export function removeSelectedNbHandwriting(editor: Editor): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const sel = editor.state.selection;
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'nbHandwriting') {
    return false;
  }

  if (editor.state.doc.childCount <= 1) {
    return editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const pNode = state.schema.nodes.nbParagraph.create({
          variant: null,
          dir: 'auto',
        });
        tr.replaceWith(sel.from, sel.to, pNode);
        tr.setSelection(TextSelection.create(tr.doc, 1));
        return true;
      })
      .run();
  }

  return editor.chain().focus().deleteSelection().run();
}
