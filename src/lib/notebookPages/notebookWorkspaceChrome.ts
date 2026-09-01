/**
 * Device-local workspace chrome preferences (Topics / Context visibility).
 * Not notebook content — not synced to cloud.
 */

export const NOTEBOOK_WORKSPACE_CHROME_KEY = 'fw_nb_workspace_chrome_v1';

export type NotebookWorkspaceChromePersisted = {
  topicsOpen: boolean;
  contextOpen: boolean;
};

export type NotebookWorkspaceChromeState = NotebookWorkspaceChromePersisted & {
  focusMode: boolean;
};

export type FocusRestoreSnapshot = NotebookWorkspaceChromePersisted;

export const DEFAULT_NOTEBOOK_WORKSPACE_CHROME: NotebookWorkspaceChromePersisted = {
  topicsOpen: true,
  contextOpen: true,
};

export function normalizeNotebookWorkspaceChrome(
  raw: unknown,
): NotebookWorkspaceChromePersisted {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NOTEBOOK_WORKSPACE_CHROME };
  const o = raw as Record<string, unknown>;
  return {
    topicsOpen:
      typeof o.topicsOpen === 'boolean'
        ? o.topicsOpen
        : DEFAULT_NOTEBOOK_WORKSPACE_CHROME.topicsOpen,
    contextOpen:
      typeof o.contextOpen === 'boolean'
        ? o.contextOpen
        : DEFAULT_NOTEBOOK_WORKSPACE_CHROME.contextOpen,
  };
}

export function loadNotebookWorkspaceChrome(): NotebookWorkspaceChromePersisted {
  if (typeof window === 'undefined') return { ...DEFAULT_NOTEBOOK_WORKSPACE_CHROME };
  try {
    const raw = window.localStorage.getItem(NOTEBOOK_WORKSPACE_CHROME_KEY);
    if (!raw) return { ...DEFAULT_NOTEBOOK_WORKSPACE_CHROME };
    return normalizeNotebookWorkspaceChrome(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_NOTEBOOK_WORKSPACE_CHROME };
  }
}

export function saveNotebookWorkspaceChrome(persisted: NotebookWorkspaceChromePersisted): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      NOTEBOOK_WORKSPACE_CHROME_KEY,
      JSON.stringify({
        topicsOpen: persisted.topicsOpen,
        contextOpen: persisted.contextOpen,
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function createInitialWorkspaceChromeState(): NotebookWorkspaceChromeState {
  return { ...loadNotebookWorkspaceChrome(), focusMode: false };
}

export function createFocusSnapshot(
  state: NotebookWorkspaceChromePersisted,
): FocusRestoreSnapshot {
  return { topicsOpen: state.topicsOpen, contextOpen: state.contextOpen };
}

export function enterWorkspaceFocus(
  state: NotebookWorkspaceChromeState,
): { next: NotebookWorkspaceChromeState; snapshot: FocusRestoreSnapshot } {
  return {
    snapshot: createFocusSnapshot(state),
    next: { ...state, focusMode: true },
  };
}

export function exitWorkspaceFocus(
  snapshot: FocusRestoreSnapshot,
): NotebookWorkspaceChromeState {
  return {
    topicsOpen: snapshot.topicsOpen,
    contextOpen: snapshot.contextOpen,
    focusMode: false,
  };
}

/** Serialized shape must never include focusMode. */
export function parsePersistedChromeJson(json: string): NotebookWorkspaceChromePersisted {
  try {
    return normalizeNotebookWorkspaceChrome(JSON.parse(json));
  } catch {
    return { ...DEFAULT_NOTEBOOK_WORKSPACE_CHROME };
  }
}
