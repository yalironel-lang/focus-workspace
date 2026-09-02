import type { StoredNotebookSelection } from './notebookSelectionToolbar';
import type { ToolbarAnchor } from './notebookSelectionToolbar';

/** One undo/redo step for inline formatting (not persistence/autosave). */
export type NotebookFormatHistoryEntry = {
  body: string;
  session: StoredNotebookSelection | null;
  toolbarOpen: boolean;
  toolbarAnchor: ToolbarAnchor | null;
};

const MAX_ENTRIES = 100;

export type NotebookFormatHistory = {
  pushBeforeFormat: (current: NotebookFormatHistoryEntry) => void;
  undo: (current: NotebookFormatHistoryEntry) => NotebookFormatHistoryEntry | null;
  redo: (current: NotebookFormatHistoryEntry) => NotebookFormatHistoryEntry | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
  undoDepth: () => number;
  redoDepth: () => number;
};

export function createNotebookFormatHistory(): NotebookFormatHistory {
  let undoStack: NotebookFormatHistoryEntry[] = [];
  let redoStack: NotebookFormatHistoryEntry[] = [];

  return {
    pushBeforeFormat(current) {
      undoStack = [...undoStack.slice(-(MAX_ENTRIES - 1)), current];
      redoStack = [];
    },
    undo(current) {
      if (undoStack.length === 0) return null;
      redoStack = [...redoStack.slice(-(MAX_ENTRIES - 1)), current];
      return undoStack.pop() ?? null;
    },
    redo(current) {
      if (redoStack.length === 0) return null;
      undoStack = [...undoStack.slice(-(MAX_ENTRIES - 1)), current];
      return redoStack.pop() ?? null;
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    clear() {
      undoStack = [];
      redoStack = [];
    },
    undoDepth: () => undoStack.length,
    redoDepth: () => redoStack.length,
  };
}
