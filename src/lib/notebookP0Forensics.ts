/**
 * Temporary P0 Page-Unresponsive forensic counters.
 * Enabled only when `globalThis.__NB_P0_FORENSICS__ === true` (tests / DEV soak).
 * Never writes Notebook persistence data.
 */

export type NotebookP0ForensicsSnapshot = {
  projectNotebookBlockRenders: number;
  tipTapCandidateRenders: number;
  selectionToolbarSyncs: number;
  selectionToolbarScrollSyncs: number;
  tipTapTransactions: number;
  tipTapDocChangedTransactions: number;
  tipTapOnUpdate: number;
  tipTapOnUserEdit: number;
  tipTapExternalSetContent: number;
  notebookPersistCommits: number;
  appearancePersists: number;
  shellResizeObserverCallbacks: number;
  shellSurfaceWidthStateChanges: number;
  handwritingRedraws: number;
  handwritingResizeObserverCallbacks: number;
  bodyScrollHandlerCalls: number;
};

const EMPTY: NotebookP0ForensicsSnapshot = {
  projectNotebookBlockRenders: 0,
  tipTapCandidateRenders: 0,
  selectionToolbarSyncs: 0,
  selectionToolbarScrollSyncs: 0,
  tipTapTransactions: 0,
  tipTapDocChangedTransactions: 0,
  tipTapOnUpdate: 0,
  tipTapOnUserEdit: 0,
  tipTapExternalSetContent: 0,
  notebookPersistCommits: 0,
  appearancePersists: 0,
  shellResizeObserverCallbacks: 0,
  shellSurfaceWidthStateChanges: 0,
  handwritingRedraws: 0,
  handwritingResizeObserverCallbacks: 0,
  bodyScrollHandlerCalls: 0,
};

let counts: NotebookP0ForensicsSnapshot = { ...EMPTY };

export function nbP0ForensicsEnabled(): boolean {
  return (globalThis as { __NB_P0_FORENSICS__?: boolean }).__NB_P0_FORENSICS__ === true;
}

export function nbP0ForensicsReset(): void {
  counts = { ...EMPTY };
}

export function nbP0ForensicsSnapshot(): NotebookP0ForensicsSnapshot {
  return { ...counts };
}

export function nbP0Bump(key: keyof NotebookP0ForensicsSnapshot, by = 1): void {
  if (!nbP0ForensicsEnabled()) return;
  counts[key] += by;
}
