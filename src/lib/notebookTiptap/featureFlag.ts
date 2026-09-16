/**
 * TipTap Notebook feature flags — M7.1A production defaults.
 *
 * Precedence (per flag key):
 *   1. Env `true`/`1` or `false`/`0` wins over localStorage
 *   2. Else localStorage `1` / `0`
 *   3. Else the flag's default
 *
 * Body-editor selection precedence:
 *   1. Legacy CE override ON (env/LS notebookLegacyCe) → TipTap inactive
 *   2. Else TipTap enabled (default ON; env OFF; DEV-only LS candidate) → TipTap active
 *   3. Production ignores obsolete localStorage notebookTiptapCandidate=0
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
const LS_ENGINEERING_CHROME_KEY = 'notebookEngineeringChrome';

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
 * TipTap body-editor enable flag (historical "candidate" name kept for M7.1A/D).
 * Default ON.
 *
 * Precedence:
 *   1. Env VITE_NOTEBOOK_TIPTAP_CANDIDATE true/false
 *   2. DEV only: localStorage notebookTiptapCandidate 1/0 (local engineering)
 *   3. Default ON
 *
 * Production ignores obsolete localStorage notebookTiptapCandidate=0 so historical
 * DEV sessions cannot pin ordinary users to CE. Emergency CE is notebookLegacyCe only.
 */
export function isNotebookTiptapCandidateEnabled(
  opts?: { /** Test seam; defaults to import.meta.env.DEV */ isDev?: boolean },
): boolean {
  const envRaw = import.meta.env.VITE_NOTEBOOK_TIPTAP_CANDIDATE;
  if (envRaw === 'true' || envRaw === '1') return true;
  if (envRaw === 'false' || envRaw === '0') return false;
  const isDev = opts?.isDev ?? Boolean(import.meta.env.DEV);
  if (isDev) {
    try {
      if (typeof localStorage !== 'undefined') {
        const ls = localStorage.getItem(LS_CANDIDATE_KEY);
        if (ls === '1') return true;
        if (ls === '0') return false;
      }
    } catch {
      /* private mode */
    }
  }
  return true;
}

/**
 * TipTap is the visible Notebook body editor when enabled and legacy CE is not forced.
 * Independent of `import.meta.env.DEV` for Active (rollback uses legacyCe / env only).
 */
export function isNotebookTiptapCandidateActive(
  opts?: { isDev?: boolean },
): boolean {
  if (isNotebookLegacyCeForced()) return false;
  return isNotebookTiptapCandidateEnabled(opts);
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
 * Independent of `import.meta.env.DEV` for Active (same as TipTap Active).
 */
export function isNotebookTiptapPersistActive(
  opts?: { isDev?: boolean },
): boolean {
  return isNotebookTiptapCandidateActive(opts) && isNotebookTiptapPersistEnabled();
}

/**
 * Explicit opt-in Notebook engineering chrome (QA JSON, status strip, selection diag).
 * DEFAULT OFF — including normal localhost DEV — so product UI stays product-like.
 * Enable only via:
 *   VITE_NOTEBOOK_ENGINEERING_CHROME=true|1
 *   or localStorage.notebookEngineeringChrome = '1'
 * Does not reuse TipTap candidate / persist / legacy-CE flags.
 */
export function isNotebookEngineeringChromeEnabled(): boolean {
  return readFlag(
    import.meta.env.VITE_NOTEBOOK_ENGINEERING_CHROME,
    LS_ENGINEERING_CHROME_KEY,
    false,
  );
}
