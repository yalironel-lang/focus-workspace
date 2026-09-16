/**
 * M7.5A — Page-boundary TipTap history isolation helpers.
 *
 * ProseMirror remaps prior undo steps across `setContent` even when the
 * replace is marked `addToHistory: false`. After a Notebook page switch those
 * remapped steps can restore the previous page into the active page.
 *
 * Resetting the history plugin state to its init value drops both stacks while
 * leaving the current document, selection, and React node views intact.
 */

import type { Editor } from '@tiptap/core';
import { undoDepth, redoDepth } from '@tiptap/pm/history';

function findHistoryPlugin(editor: Editor) {
  return editor.state.plugins.find(plugin => {
    // ProseMirror Plugin.key is a runtime string (e.g. "history$"); typings omit it.
    const key = (plugin as { key?: string }).key;
    return typeof key === 'string' && key.startsWith('history$');
  });
}

/** Drop undo/redo stacks without changing the current document or selection. */
export function resetCandidateEditorHistory(editor: Editor): void {
  if (editor.isDestroyed) return;
  const historyPlugin = findHistoryPlugin(editor);
  const key = historyPlugin?.spec.key;
  const init = historyPlugin?.spec.state?.init;
  if (!historyPlugin || !key || typeof init !== 'function') return;

  const emptyHist = init.call(
    historyPlugin.spec.state,
    historyPlugin.spec.config ?? {},
    editor.state,
  );
  editor.view.dispatch(editor.state.tr.setMeta(key, { historyState: emptyHist }));
}

export function candidateEditorHistoryDepth(editor: Editor): {
  undo: number;
  redo: number;
} {
  if (editor.isDestroyed) return { undo: 0, redo: 0 };
  return {
    undo: undoDepth(editor.state),
    redo: redoDepth(editor.state),
  };
}
