/**
 * M7.1D — Production chrome cleanup + TipTap promotion release gate.
 * Engineering chrome is explicit opt-in (not import.meta.env.DEV).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import {
  isNotebookEngineeringChromeEnabled,
  isNotebookLegacyCeForced,
  isNotebookTiptapCandidateActive,
  isNotebookTiptapCandidateEnabled,
  isNotebookTiptapPersistActive,
} from './featureFlag';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';

function stubLocalStorage(mem: Map<string, string>) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  });
}

describe('M7.1D historical notebookTiptapCandidate=0 production semantics', () => {
  const mem = new Map<string, string>();

  beforeEach(() => {
    mem.clear();
    stubLocalStorage(mem);
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('production ignores obsolete LS candidate OFF; TipTap stays default ON', () => {
    mem.set('notebookTiptapCandidate', '0');
    expect(isNotebookTiptapCandidateEnabled({ isDev: false })).toBe(true);
    expect(isNotebookTiptapCandidateActive({ isDev: false })).toBe(true);
    expect(isNotebookTiptapPersistActive({ isDev: false })).toBe(true);
  });

  it('DEV still honors LS candidate OFF for local engineering', () => {
    mem.set('notebookTiptapCandidate', '0');
    expect(isNotebookTiptapCandidateEnabled({ isDev: true })).toBe(false);
    expect(isNotebookTiptapCandidateActive({ isDev: true })).toBe(false);
  });

  it('emergency notebookLegacyCe remains the supported production CE rollback', () => {
    mem.set('notebookTiptapCandidate', '0');
    mem.set('notebookLegacyCe', '1');
    expect(isNotebookLegacyCeForced()).toBe(true);
    expect(isNotebookTiptapCandidateActive({ isDev: false })).toBe(false);
  });

  it('env TipTap OFF still works in production (explicit, not obsolete LS)', () => {
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_CANDIDATE', 'false');
    mem.set('notebookTiptapCandidate', '1');
    expect(isNotebookTiptapCandidateEnabled({ isDev: false })).toBe(false);
    expect(isNotebookTiptapCandidateActive({ isDev: false })).toBe(false);
  });
});

describe('M7.1D engineering chrome opt-in (not DEV-auto)', () => {
  const mem = new Map<string, string>();

  beforeEach(() => {
    mem.clear();
    stubLocalStorage(mem);
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('1. engineering chrome is OFF by default even in DEV', () => {
    expect(import.meta.env.DEV).toBe(true);
    expect(isNotebookEngineeringChromeEnabled()).toBe(false);
  });

  it('2a. explicit env opt-in enables engineering chrome', () => {
    vi.stubEnv('VITE_NOTEBOOK_ENGINEERING_CHROME', 'true');
    expect(isNotebookEngineeringChromeEnabled()).toBe(true);
  });

  it('2b. explicit localStorage opt-in enables engineering chrome', () => {
    mem.set('notebookEngineeringChrome', '1');
    expect(isNotebookEngineeringChromeEnabled()).toBe(true);
  });

  it('2c. env false wins over LS on', () => {
    vi.stubEnv('VITE_NOTEBOOK_ENGINEERING_CHROME', 'false');
    mem.set('notebookEngineeringChrome', '1');
    expect(isNotebookEngineeringChromeEnabled()).toBe(false);
  });
});

describe('M7.1D production-default TipTap chrome contract', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;
  const mem = new Map<string, string>();

  beforeEach(() => {
    mem.clear();
    stubLocalStorage(mem);
    vi.unstubAllEnvs();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    host = null;
    root = null;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function mount(el: ReactElement) {
    act(() => {
      root!.render(el);
    });
  }

  function assertNoEngineeringChromeStrings(text: string) {
    expect(text).not.toMatch(/COPY NOTEBOOK QA JSON/i);
    expect(text).not.toMatch(/\bPRISTINE\b/);
    expect(text).not.toMatch(/\bEDITED\b/);
    expect(text).not.toMatch(/serialize=/i);
    expect(text).not.toMatch(/persist:\s*guarded/i);
    expect(text).not.toMatch(/candidate toolbar · M4\.2/i);
    expect(text).not.toMatch(/lastCmd=/i);
  }

  it('DEFAULT (DEV): TipTap + product controls; no QA/status/selection diag', async () => {
    expect(import.meta.env.DEV).toBe(true);
    expect(isNotebookEngineeringChromeEnabled()).toBe(false);

    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Product notebook body',
        pageKey: 'prod-page',
        onReady,
        onUserEdit: vi.fn(),
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());

    expect(host!.querySelector('.nb-tiptap-candidate-prosemirror')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-toolbar="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-undo="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-redo="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-block="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-dir="1"]')).toBeTruthy();

    expect(host!.querySelector('[data-nb-candidate-badge="1"]')).toBeNull();
    expect(host!.querySelector('[data-nb-candidate-qa-panel]')).toBeNull();
    expect(host!.querySelector('[data-nb-candidate-status="1"]')).toBeNull();
    expect(host!.querySelector('[data-nb-candidate-toolbar-temp="1"]')).toBeNull();
    expect(document.querySelector('[data-nb-candidate-sel-diag="1"]')).toBeNull();

    const text = host!.textContent ?? '';
    expect(text).not.toMatch(/TIPTAP CANDIDATE/i);
    expect(text).not.toMatch(/Temp DEV tools/i);
    assertNoEngineeringChromeStrings(text);
  });

  it('explicit opt-in renders engineering QA/status chrome; product controls remain', async () => {
    mem.set('notebookEngineeringChrome', '1');
    expect(isNotebookEngineeringChromeEnabled()).toBe(true);

    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Engineering chrome on',
        pageKey: 'eng-page',
        onReady,
        onUserEdit: vi.fn(),
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());

    expect(host!.querySelector('[data-nb-product-toolbar="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-undo="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-candidate-qa-panel="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-candidate-status="1"]')).toBeTruthy();
    expect(host!.textContent).toMatch(/COPY NOTEBOOK QA JSON/i);
    expect(host!.querySelector('[data-nb-candidate-dirty="PRISTINE"]')).toBeTruthy();
  });

  it('fail-closed remains product-safe with no engineering chrome by default', async () => {
    const corrupt = '~nb1:["paragraph","Secret original",[],null]';
    const onUserEdit = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: corrupt,
        pageKey: 'bad',
        onUserEdit,
      }),
    );
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb-page-load-safe-error="1"]')).toBeTruthy(),
    );
    expect(onUserEdit).not.toHaveBeenCalled();
    const text = host!.textContent ?? '';
    expect(text).toContain('Unable to open this page safely');
    expect(text).toContain('Your original content has not been changed');
    expect(host!.querySelector('[data-nb-page-load-error-detail="1"]')).toBeNull();
    assertNoEngineeringChromeStrings(text);
    expect(host!.querySelector('[data-nb-product-toolbar="1"]')).toBeNull();
    expect(host!.querySelector('[data-nb-candidate-badge="1"]')).toBeNull();
  });
});
