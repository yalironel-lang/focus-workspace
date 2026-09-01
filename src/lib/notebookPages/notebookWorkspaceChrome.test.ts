/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_NOTEBOOK_WORKSPACE_CHROME,
  NOTEBOOK_WORKSPACE_CHROME_KEY,
  createFocusSnapshot,
  createInitialWorkspaceChromeState,
  enterWorkspaceFocus,
  exitWorkspaceFocus,
  loadNotebookWorkspaceChrome,
  normalizeNotebookWorkspaceChrome,
  parsePersistedChromeJson,
  saveNotebookWorkspaceChrome,
} from './notebookWorkspaceChrome';

function createMockStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

describe('notebookWorkspaceChrome', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMockStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('A: both open → focus → exit restores both open', () => {
    const initial = { topicsOpen: true, contextOpen: true, focusMode: false };
    const { next, snapshot } = enterWorkspaceFocus(initial);
    expect(next.focusMode).toBe(true);
    expect(next.topicsOpen).toBe(true);
    expect(next.contextOpen).toBe(true);

    const restored = exitWorkspaceFocus(snapshot);
    expect(restored).toEqual({ topicsOpen: true, contextOpen: true, focusMode: false });
  });

  it('B: topics open + context closed → focus → exit restores exact state', () => {
    const initial = { topicsOpen: true, contextOpen: false, focusMode: false };
    const { snapshot } = enterWorkspaceFocus(initial);
    const restored = exitWorkspaceFocus(snapshot);
    expect(restored).toEqual({ topicsOpen: true, contextOpen: false, focusMode: false });
  });

  it('C: both collapsed → focus → exit keeps both collapsed', () => {
    const initial = { topicsOpen: false, contextOpen: false, focusMode: false };
    const { snapshot } = enterWorkspaceFocus(initial);
    const restored = exitWorkspaceFocus(snapshot);
    expect(restored).toEqual({ topicsOpen: false, contextOpen: false, focusMode: false });
  });

  it('D: persistence round-trip for topicsOpen/contextOpen', () => {
    saveNotebookWorkspaceChrome({ topicsOpen: false, contextOpen: true });
    expect(loadNotebookWorkspaceChrome()).toEqual({ topicsOpen: false, contextOpen: true });
  });

  it('E: corrupt localStorage falls back to defaults', () => {
    window.localStorage.setItem(NOTEBOOK_WORKSPACE_CHROME_KEY, '{not json');
    expect(loadNotebookWorkspaceChrome()).toEqual(DEFAULT_NOTEBOOK_WORKSPACE_CHROME);
    expect(parsePersistedChromeJson('{"topicsOpen":"yes"}')).toEqual(DEFAULT_NOTEBOOK_WORKSPACE_CHROME);
    expect(normalizeNotebookWorkspaceChrome(null)).toEqual(DEFAULT_NOTEBOOK_WORKSPACE_CHROME);
  });

  it('F: focusMode is never persisted', () => {
    const initial = createInitialWorkspaceChromeState();
    const { next } = enterWorkspaceFocus(initial);
    expect(next.focusMode).toBe(true);
    saveNotebookWorkspaceChrome(next);
    const raw = window.localStorage.getItem(NOTEBOOK_WORKSPACE_CHROME_KEY);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('focusMode');
    expect(loadNotebookWorkspaceChrome()).toEqual({
      topicsOpen: initial.topicsOpen,
      contextOpen: initial.contextOpen,
    });
  });

  it('createFocusSnapshot captures pre-focus sidebar state', () => {
    expect(createFocusSnapshot({ topicsOpen: true, contextOpen: false })).toEqual({
      topicsOpen: true,
      contextOpen: false,
    });
  });

  it('saveNotebookWorkspaceChrome fails safely when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveNotebookWorkspaceChrome({ topicsOpen: false, contextOpen: false })).not.toThrow();
    spy.mockRestore();
  });
});
