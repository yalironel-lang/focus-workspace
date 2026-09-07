/**
 * TipTap editor feature flag — Milestone 0 scaffolding only.
 * Default OFF. Does not switch the CE notebook editor.
 */

const LS_KEY = 'notebookTiptapEditor';

/** When true, TipTap notebook editor may be used (not wired in Milestone 0). */
export function isNotebookTiptapEditorEnabled(): boolean {
  const raw = import.meta.env.VITE_NOTEBOOK_TIPTAP_EDITOR;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  try {
    if (typeof localStorage !== 'undefined') {
      const ls = localStorage.getItem(LS_KEY);
      if (ls === '1') return true;
      if (ls === '0') return false;
    }
  } catch {
    /* private mode */
  }
  return false;
}
