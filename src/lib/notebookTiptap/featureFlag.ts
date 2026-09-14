/**
 * TipTap Notebook feature flags — DEV scaffolding / candidate modes.
 * Default OFF. Never enable TipTap as production default from these helpers.
 */

const LS_EDITOR_KEY = 'notebookTiptapEditor';
const LS_CANDIDATE_KEY = 'notebookTiptapCandidate';
const LS_PERSIST_KEY = 'notebookTiptapPersist';

function readFlag(envRaw: string | undefined, lsKey: string): boolean {
  if (envRaw === 'true' || envRaw === '1') return true;
  if (envRaw === 'false' || envRaw === '0') return false;
  try {
    if (typeof localStorage !== 'undefined') {
      const ls = localStorage.getItem(lsKey);
      if (ls === '1') return true;
      if (ls === '0') return false;
    }
  } catch {
    /* private mode */
  }
  return false;
}

/** Shadow / parity DEV surfaces (Milestone 0–3). Does not replace CE. */
export function isNotebookTiptapEditorEnabled(): boolean {
  return readFlag(import.meta.env.VITE_NOTEBOOK_TIPTAP_EDITOR, LS_EDITOR_KEY);
}

/**
 * Milestone 4 production-editor candidate.
 * When true (DEV only at call sites): TipTap is the visible Notebook body editor,
 * memory-only — never persists. Default OFF.
 */
export function isNotebookTiptapCandidateEnabled(): boolean {
  return readFlag(import.meta.env.VITE_NOTEBOOK_TIPTAP_CANDIDATE, LS_CANDIDATE_KEY);
}

/** True only in DEV builds with the candidate flag on. */
export function isNotebookTiptapCandidateActive(): boolean {
  return Boolean(import.meta.env.DEV) && isNotebookTiptapCandidateEnabled();
}

/**
 * Milestone 5.2 — guarded real persistence for the TipTap candidate.
 * SEPARATE from the candidate flag. Both must be ON for real writes to occur.
 * Default OFF. Never enable in production.
 *
 * Possible states:
 *   Candidate OFF                → legacy CE behavior (this flag irrelevant)
 *   Candidate ON + Persist OFF  → memory-only TipTap candidate (M4 behavior)
 *   Candidate ON + Persist ON   → guarded M5.2 real persistence path
 */
export function isNotebookTiptapPersistEnabled(): boolean {
  return readFlag(import.meta.env.VITE_NOTEBOOK_TIPTAP_PERSIST, LS_PERSIST_KEY);
}

/**
 * True only in DEV builds with BOTH the candidate AND persist flags on.
 * This is the guard that enables real writes through the existing pipeline.
 */
export function isNotebookTiptapPersistActive(): boolean {
  return Boolean(import.meta.env.DEV) &&
    isNotebookTiptapCandidateEnabled() &&
    isNotebookTiptapPersistEnabled();
}
