/**
 * TipTap Notebook feature flags — M7.1A production defaults.
 *
 * Precedence (per flag key):
 *   1. Env `true`/`1` or `false`/`0` wins over localStorage
 *   2. Else localStorage `1` / `0`
 *   3. Else the flag's default
 *
 * Body-editor selection precedence:
 *   1. Legacy CE override ON  → TipTap inactive (CE body)
 *   2. Else TipTap enabled (default ON) → TipTap active
 *   3. Explicit TipTap candidate OFF → TipTap inactive (CE body)
 *
 * Persistence:
 *   Persist Active = TipTap Active AND Persist Enabled (default ON)
 *   Persist cannot be active when TipTap body editor is inactive.
 *
 * No Active helper depends on `import.meta.env.DEV`.
 */

const LS_EDITOR_KEY = 'notebookTiptapEditor';
const LS_CANDIDATE_KEY = 'notebookTiptapCandidate';
const LS_PERSIST_KEY = 'notebookTiptapPersist';
const LS_LEGACY_CE_KEY = 'notebookLegacyCe';

function readFlag(
  envRaw: string | undefined,
  lsKey: string,
  defaultValue: boolean,
): boolean {
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
  return defaultValue;
}

/** Shadow / parity DEV surfaces (Milestone 0–3). Does not replace CE. Default OFF. */
export function isNotebookTiptapEditorEnabled(): boolean {
  return readFlag(import.meta.env.VITE_NOTEBOOK_TIPTAP_EDITOR, LS_EDITOR_KEY, false);
}

/**
 * Emergency rollback: force legacy contentEditable body editor.
 * Default OFF. When ON, TipTap body editor is inactive regardless of TipTap ON flags.
 */
export function isNotebookLegacyCeForced(): boolean {
  return readFlag(import.meta.env.VITE_NOTEBOOK_LEGACY_CE, LS_LEGACY_CE_KEY, false);
}

/**
 * TipTap body-editor enable flag (historical "candidate" name kept for M7.1A).
 * Default ON. Explicit env/LS OFF still disables TipTap (unless testing).
 * Does not alone select the body editor — see isNotebookTiptapCandidateActive.
 */
export function isNotebookTiptapCandidateEnabled(): boolean {
  return readFlag(import.meta.env.VITE_NOTEBOOK_TIPTAP_CANDIDATE, LS_CANDIDATE_KEY, true);
}

/**
 * TipTap is the visible Notebook body editor when enabled and legacy CE is not forced.
 * Independent of `import.meta.env.DEV`.
 */
export function isNotebookTiptapCandidateActive(): boolean {
  if (isNotebookLegacyCeForced()) return false;
  return isNotebookTiptapCandidateEnabled();
}

/**
 * Guarded TipTap → canonical body persistence enable flag.
 * Default ON. Explicit OFF → TipTap may still edit memory-only.
 */
export function isNotebookTiptapPersistEnabled(): boolean {
  return readFlag(import.meta.env.VITE_NOTEBOOK_TIPTAP_PERSIST, LS_PERSIST_KEY, true);
}

/**
 * Real writes through the existing Notebook pipeline.
 * Requires TipTap body Active AND persist Enabled.
 * Independent of `import.meta.env.DEV`.
 */
export function isNotebookTiptapPersistActive(): boolean {
  return isNotebookTiptapCandidateActive() && isNotebookTiptapPersistEnabled();
}
