/**
 * M6.4B — Notebook-owned table command wrappers.
 *
 * Never call raw TipTap table insert/structure commands from UI without this layer.
 * Always insert with `withHeaderRow: false`. Enforce 20×20 and M6.4A serializability.
 */

import type { Editor, JSONContent } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import { MAX_TABLE_COLS, MAX_TABLE_ROWS } from '../notebookTableCodec';
import { tiptapDocToBody } from './tiptapDocToBody';

export const DEFAULT_INSERT_TABLE_ROWS = 3;
export const DEFAULT_INSERT_TABLE_COLS = 3;

export type CandidateTableCommand =
  | { type: 'insertTable'; rows?: number; cols?: number }
  | { type: 'addRowBefore' }
  | { type: 'addRowAfter' }
  | { type: 'deleteRow' }
  | { type: 'addColumnBefore' }
  | { type: 'addColumnAfter' }
  | { type: 'deleteColumn' }
  | { type: 'deleteTable' };

export type CandidateTableState = {
  inTable: boolean;
  rows: number;
  cols: number;
  canAddRow: boolean;
  canAddColumn: boolean;
  canDeleteRow: boolean;
  canDeleteColumn: boolean;
  canDeleteTable: boolean;
};

function emptyCell(): JSONContent {
  return {
    type: 'nbTableCell',
    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
    content: [
      {
        type: 'nbParagraph',
        attrs: { dir: 'auto', align: null, variant: null },
      },
    ],
  };
}

/** Build a header-free rectangular table JSON (M6.4A-safe). */
export function createNotebookTableJson(rows: number, cols: number): JSONContent {
  return {
    type: 'nbTable',
    content: Array.from({ length: rows }, () => ({
      type: 'nbTableRow',
      content: Array.from({ length: cols }, () => emptyCell()),
    })),
  };
}

export function isValidTableSize(rows: number, cols: number): boolean {
  return (
    Number.isInteger(rows) &&
    Number.isInteger(cols) &&
    rows >= 1 &&
    cols >= 1 &&
    rows <= MAX_TABLE_ROWS &&
    cols <= MAX_TABLE_COLS
  );
}

/** Depth of nearest nbTable ancestor, or null. */
export function findTableDepth($from: { depth: number; node: (d: number) => ProseMirrorNode }): number | null {
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'nbTable') return d;
  }
  return null;
}

export function isSelectionInsideTable(editor: Editor): boolean {
  const { selection } = editor.state;
  if (selection instanceof NodeSelection && selection.node.type.name === 'nbTable') return true;
  return findTableDepth(selection.$from) != null;
}

export function isSelectionInsideTableCell(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name;
    if (name === 'nbTableCell' || name === 'nbTableHeader') return true;
    if (name === 'nbTable') return false;
  }
  return false;
}

/**
 * Depth of nearest nbTableCell / nbTableHeader ancestor, or null.
 * Works for TextSelection ranges that span cell content (goToNextCell residue).
 */
export function findTableCellDepth($from: {
  depth: number;
  node: (d: number) => ProseMirrorNode;
}): number | null {
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name;
    if (name === 'nbTableCell' || name === 'nbTableHeader') return d;
    if (name === 'nbTable') return null;
  }
  return null;
}

/**
 * Place a collapsed TextSelection at the END of the current cell's nbParagraph.
 *
 * prosemirror-tables `goToNextCell` uses TextSelection.between(cellStart, cellEnd),
 * which selects existing cell text. Typing then replaces it (M6.4B TEST 4).
 */
export function collapseSelectionToEndOfTableCell(editor: Editor): boolean {
  if (editor.isDestroyed) return false;
  const { selection } = editor.state;
  const depth = findTableCellDepth(selection.$from);
  if (depth == null) return false;
  const cell = selection.$from.node(depth);
  const para = cell.firstChild;
  if (!para || para.type.name !== 'nbParagraph') return false;
  // before(cell) + enter cell + enter paragraph + content.size → end of paragraph
  const end = selection.$from.before(depth) + 1 + 1 + para.content.size;
  return editor.commands.setTextSelection(end);
}

/**
 * Tab / Shift+Tab navigation for Notebook tables.
 * Moves via TipTap goToNext/PreviousCell, then forces a collapsed caret at the
 * destination paragraph end. Returns false when there is no next/prev cell
 * (caller should still swallow the key — never add a row on final Tab).
 */
export function navigateNotebookTableCell(editor: Editor, direction: 1 | -1): boolean {
  if (editor.isDestroyed || !editor.isEditable || !isSelectionInsideTable(editor)) return false;
  const moved =
    direction === 1 ? editor.commands.goToNextCell() : editor.commands.goToPreviousCell();
  if (!moved) return false;
  collapseSelectionToEndOfTableCell(editor);
  return true;
}

export function readTableContext(editor: Editor): {
  node: ProseMirrorNode;
  pos: number;
  rows: number;
  cols: number;
} | null {
  const { selection } = editor.state;
  if (selection instanceof NodeSelection && selection.node.type.name === 'nbTable') {
    const node = selection.node;
    const rows = node.childCount;
    const cols = node.firstChild?.childCount ?? 0;
    return { node, pos: selection.from, rows, cols };
  }
  const depth = findTableDepth(selection.$from);
  if (depth == null) return null;
  const node = selection.$from.node(depth);
  const pos = selection.$from.before(depth);
  const rows = node.childCount;
  const cols = node.firstChild?.childCount ?? 0;
  return { node, pos, rows, cols };
}

export function readCandidateTableState(editor: Editor): CandidateTableState {
  const ctx = readTableContext(editor);
  if (!ctx) {
    return {
      inTable: false,
      rows: 0,
      cols: 0,
      canAddRow: false,
      canAddColumn: false,
      canDeleteRow: false,
      canDeleteColumn: false,
      canDeleteTable: false,
    };
  }
  return {
    inTable: true,
    rows: ctx.rows,
    cols: ctx.cols,
    canAddRow: ctx.rows < MAX_TABLE_ROWS,
    canAddColumn: ctx.cols < MAX_TABLE_COLS,
    canDeleteRow: ctx.rows >= 1,
    canDeleteColumn: ctx.cols >= 1,
    canDeleteTable: true,
  };
}

/** True when editor JSON round-trips through M6.4A canonical serialization. */
export function isEditorTableDocSerializable(editor: Editor): boolean {
  try {
    tiptapDocToBody(editor.getJSON(), 1);
    return true;
  } catch {
    return false;
  }
}

/**
 * Assert post-command doc is M6.4A-serializable.
 * Commands are pre-validated so failure here is unexpected; we undo once to restore
 * the previous valid document (single undo step, not a destructive multi-step hack).
 */
function assertSerializableOrUndo(editor: Editor): boolean {
  if (isEditorTableDocSerializable(editor)) {
    // Isolate each structural command as its own undo step.
    editor.view.dispatch(closeHistory(editor.state.tr));
    return true;
  }
  if (editor.can().undo()) {
    editor.commands.undo();
  }
  return false;
}

function requireEditable(editor: Editor): boolean {
  return !editor.isDestroyed && editor.isEditable;
}

/**
 * Top-level insert position for a new nbTable: immediately AFTER the current
 * top-level block that contains the selection/caret.
 *
 * Table is a block insertion — never replace/split selected inline text.
 * If selection is already a whole-table NodeSelection, insert after that table.
 */
export function resolveNotebookTableInsertPos(editor: Editor): number {
  const { selection, doc } = editor.state;
  if (selection instanceof NodeSelection && selection.node.type.name === 'nbTable') {
    return selection.to;
  }
  const { $from } = selection;
  if ($from.depth >= 1) {
    return $from.after(1);
  }
  // Gapcursor / doc-level: insert at the gap position (clamped).
  return Math.max(0, Math.min($from.pos, doc.content.size));
}

/**
 * Run a Notebook table command. Returns false on no-op / invalid context.
 * Insert always uses header-free cells (never TipTap withHeaderRow default).
 */
export function runCandidateTableCommand(editor: Editor, cmd: CandidateTableCommand): boolean {
  if (!requireEditable(editor)) return false;

  switch (cmd.type) {
    case 'insertTable': {
      const rows = cmd.rows ?? DEFAULT_INSERT_TABLE_ROWS;
      const cols = cmd.cols ?? DEFAULT_INSERT_TABLE_COLS;
      if (!isValidTableSize(rows, cols)) return false;
      // Insert AFTER the current top-level block — never replace a text selection.
      const insertPos = resolveNotebookTableInsertPos(editor);
      const ok = editor
        .chain()
        .focus()
        .insertContentAt(insertPos, createNotebookTableJson(rows, cols))
        .run();
      if (!ok) return false;
      return assertSerializableOrUndo(editor);
    }

    case 'addRowBefore':
    case 'addRowAfter': {
      const ctx = readTableContext(editor);
      if (!ctx || ctx.rows >= MAX_TABLE_ROWS) return false;
      const ok =
        cmd.type === 'addRowBefore'
          ? editor.chain().focus().addRowBefore().run()
          : editor.chain().focus().addRowAfter().run();
      if (!ok) return false;
      return assertSerializableOrUndo(editor);
    }

    case 'addColumnBefore':
    case 'addColumnAfter': {
      const ctx = readTableContext(editor);
      if (!ctx || ctx.cols >= MAX_TABLE_COLS) return false;
      const ok =
        cmd.type === 'addColumnBefore'
          ? editor.chain().focus().addColumnBefore().run()
          : editor.chain().focus().addColumnAfter().run();
      if (!ok) return false;
      return assertSerializableOrUndo(editor);
    }

    case 'deleteRow': {
      const ctx = readTableContext(editor);
      if (!ctx) return false;
      if (ctx.rows <= 1) {
        const ok = editor.chain().focus().deleteTable().run();
        if (!ok) return false;
        return assertSerializableOrUndo(editor);
      }
      const ok = editor.chain().focus().deleteRow().run();
      if (!ok) return false;
      return assertSerializableOrUndo(editor);
    }

    case 'deleteColumn': {
      const ctx = readTableContext(editor);
      if (!ctx) return false;
      if (ctx.cols <= 1) {
        const ok = editor.chain().focus().deleteTable().run();
        if (!ok) return false;
        return assertSerializableOrUndo(editor);
      }
      const ok = editor.chain().focus().deleteColumn().run();
      if (!ok) return false;
      return assertSerializableOrUndo(editor);
    }

    case 'deleteTable': {
      const ctx = readTableContext(editor);
      if (!ctx) return false;
      const ok = editor.chain().focus().deleteTable().run();
      if (!ok) return false;
      return assertSerializableOrUndo(editor);
    }

    default:
      return false;
  }
}
