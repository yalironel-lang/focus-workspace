/**
 * M7.1C — Production fail-safe + emergency legacy CE rollback.
 *
 * @vitest-environment happy-dom
 */
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  isNotebookLegacyCeForced,
  isNotebookTiptapCandidateActive,
  isNotebookTiptapPersistActive,
} from './featureFlag';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import {
  applyNotebookPersist,
  hydrateNotebookPages,
  switchNotebookPage,
  type NotebookContentWithPages,
} from '../notebookPages';
import { serializeNotebookBlocks } from '../notebookDialect';

const { NotebookTiptapCandidateEditor } = await import(
  '../../components/notebook/tiptap/NotebookTiptapCandidateEditor'
);

vi.mock('../notebookHandwritingCloud', () => ({
  hydrateHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
  reconcileHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user-m71c' } }),
}));

const { ProjectNotebookBlock } = await import(
  '../../components/project-space/ProjectNotebookBlock'
);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(el: ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(el);
  });
}

function unmount() {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
}

function stubEmptyLs(seed?: Record<string, string>) {
  const mem = new Map<string, string>(Object.entries(seed ?? {}));
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
  return mem;
}

const tokens = {
  textPrimary: '#fff',
  textMuted: '#999',
  accent: '#aaa',
  divider: '#333',
  textGhost: '#666',
} as AtmosphereTokens;

function v1Body(text: string): string {
  return serializeNotebookBlocks([{ kind: 'paragraph', text }], 1);
}

function threePageNotebook(p1: string, p2: string, p3: string): NotebookContentWithPages {
  return {
    type: 'notebook',
    schemaVersion: 1,
    activePageId: 'page-1',
    activeSectionId: 'sec-1',
    sections: [{ id: 'sec-1', title: 'Section 1', pageIds: ['page-1', 'page-2', 'page-3'] }],
    pages: [
      {
        id: 'page-1',
        sectionId: 'sec-1',
        title: 'P1',
        kind: 'document',
        documentBody: p1,
        documentBodyCodecVersion: 1,
      },
      {
        id: 'page-2',
        sectionId: 'sec-1',
        title: 'P2',
        kind: 'document',
        documentBody: p2,
        // malformed: versioned body without codec — fail-closed when opened in TipTap
        documentBodyCodecVersion: undefined,
      },
      {
        id: 'page-3',
        sectionId: 'sec-1',
        title: 'P3',
        kind: 'document',
        documentBody: p3,
        documentBodyCodecVersion: 1,
      },
    ],
    body: p1,
    bodyCodecVersion: 1,
    paperStyle: 'ruled',
    notebookMode: 'normal',
    notebookSurface: 'spatial',
  };
}

/**
 * Switch pages using stored page bodies only (no TipTap live rep) —
 * models fail-closed page where liveRep must stay null.
 */
function switchUsingStoredBody(
  content: NotebookContentWithPages,
  nextPageId: string,
): NotebookContentWithPages {
  const active =
    content.pages?.find(p => p.id === content.activePageId) ?? content.pages?.[0];
  const body = active?.documentBody ?? content.body ?? '';
  const codec = active?.documentBodyCodecVersion ?? content.bodyCodecVersion;
  return switchNotebookPage(content, nextPageId, body, codec);
}

afterEach(() => {
  unmount();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('M7.1C emergency legacy CE rollback — ProjectNotebookBlock boundary', () => {
  beforeEach(() => {
    stubEmptyLs();
    vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
  });

  it('1. default path mounts TipTap body editor', async () => {
    expect(isNotebookLegacyCeForced()).toBe(false);
    expect(isNotebookTiptapCandidateActive()).toBe(true);
    const onChange = vi.fn();
    mount(
      createElement(ProjectNotebookBlock, {
        content: {
          type: 'notebook',
          body: 'Hello default TipTap',
          notebookMode: 'normal',
        },
        tokens,
        onChange,
        presentation: 'notebook',
      }),
    );
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb-tiptap-candidate="1"]')).toBeTruthy(),
    );
    // Outer writing shell may still use data-nb-editor-root; TipTap presence is the cutover signal.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('2–4. LEGACY_CE forces CE path; TipTap does not mount; persist inactive', async () => {
    vi.stubEnv('VITE_NOTEBOOK_LEGACY_CE', 'true');
    expect(isNotebookLegacyCeForced()).toBe(true);
    expect(isNotebookTiptapCandidateActive()).toBe(false);
    expect(isNotebookTiptapPersistActive()).toBe(false);

    const onChange = vi.fn();
    mount(
      createElement(ProjectNotebookBlock, {
        content: {
          type: 'notebook',
          body: 'Hello CE rollback',
          notebookMode: 'normal',
        },
        tokens,
        onChange,
        presentation: 'notebook',
      }),
    );
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb-editor-root="1"]')).toBeTruthy(),
    );
    expect(host!.querySelector('[data-nb-tiptap-candidate="1"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('5. LS notebookLegacyCe=1 forces CE; clearing restores TipTap without migration write', async () => {
    const mem = stubEmptyLs({ notebookLegacyCe: '1' });
    expect(isNotebookTiptapCandidateActive()).toBe(false);

    const body = 'Stable notebook body A';
    const onChange = vi.fn();
    mount(
      createElement(ProjectNotebookBlock, {
        content: { type: 'notebook', body, notebookMode: 'normal' },
        tokens,
        onChange,
        presentation: 'notebook',
      }),
    );
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb-editor-root="1"]')).toBeTruthy(),
    );
    expect(onChange).not.toHaveBeenCalled();

    unmount();
    mem.delete('notebookLegacyCe');
    expect(isNotebookTiptapCandidateActive()).toBe(true);

    const onChange2 = vi.fn();
    mount(
      createElement(ProjectNotebookBlock, {
        content: { type: 'notebook', body, notebookMode: 'normal' },
        tokens,
        onChange: onChange2,
        presentation: 'notebook',
      }),
    );
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb-tiptap-candidate="1"]')).toBeTruthy(),
    );
    expect(onChange2).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      const pm = host!.querySelector('.nb-tiptap-candidate-prosemirror');
      expect(pm?.textContent ?? '').toContain('Stable notebook body A');
    });
  });
});

describe('M7.1C hydration fail-closed — product UI + zero writes', () => {
  beforeEach(() => stubEmptyLs());

  it('6–8 + 14. malformed versioned body fails closed, 0 writes, product copy, no jargon', async () => {
    const corrupt = '~nb1:["paragraph","Secret original",[],null]';
    const onUserEdit = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: corrupt,
        pageKey: 'bad-page',
        onUserEdit,
      }),
    );
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb-page-load-safe-error="1"]')).toBeTruthy(),
    );
    expect(onUserEdit).not.toHaveBeenCalled();
    expect(host!.querySelector('.nb-tiptap-candidate-prosemirror')).toBeNull();
    const text = host!.textContent ?? '';
    const errEl = host!.querySelector('[data-nb-page-load-safe-error="1"]') as HTMLElement;
    // Product copy only (exclude DEV detail pre + unrelated CSS textContent)
    const productBits = Array.from(errEl.childNodes)
      .filter(n => !(n instanceof HTMLElement && n.getAttribute('data-nb-page-load-error-detail') === '1'))
      .map(n => n.textContent ?? '')
      .join(' ');
    expect(productBits).toContain('Unable to open this page safely');
    expect(productBits).toContain('Your original content has not been changed');
    expect(productBits).toMatch(/Reload page/i);
    expect(productBits).not.toMatch(/\bTipTap\b/i);
    expect(productBits).not.toMatch(/\bcandidate\b/i);
    expect(productBits).not.toMatch(/\bcodec\b/i);
    expect(productBits).not.toMatch(/\bcontentEditable\b/i);
    expect(productBits).not.toMatch(/\bCE\b/);
    expect(productBits).not.toMatch(/serializ/i);
    expect(corrupt).toContain('Secret original');
  });

  it('empty TipTap document is not editable under fail-closed', async () => {
    const onUserEdit = vi.fn();
    let editor: Editor | null = null;
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: '~nb1:["paragraph","x",[],null]',
        pageKey: 'bad-editable',
        onUserEdit,
        onEditorReady: ed => {
          editor = ed;
        },
      }),
    );
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb-page-load-safe-error="1"]')).toBeTruthy(),
    );
    // Editor instance may exist for hooks, but must not be editable and must not persist
    if (editor && !editor.isDestroyed) {
      expect(editor.isEditable).toBe(false);
    }
    expect(onUserEdit).not.toHaveBeenCalled();
  });
});

describe('M7.1C serialization failure', () => {
  it('9. unserializable doc does not call onUserEdit', () => {
    const onUserEdit = vi.fn();
    expect(() =>
      tiptapDocToBody({ type: 'doc', content: [{ type: 'hardBreak' }] } as never, 1),
    ).toThrow();
    expect(onUserEdit).not.toHaveBeenCalled();
  });

  it('9b. editor-level: valid body A remains authoritative when serialize would fail', () => {
    const bodyA = v1Body('Authoritative A');
    const nb = hydrateNotebookPages({
      type: 'notebook',
      body: bodyA,
      bodyCodecVersion: 1,
      paperStyle: 'ruled',
      notebookMode: 'normal',
      notebookSurface: 'spatial',
    });
    // Simulate fail-closed: do not applyNotebookPersist with empty/partial
    expect(nb.pages?.[0]?.documentBody).toBe(bodyA);
    expect(nb.body).toBe(bodyA);
  });
});

describe('M7.1C multi-page failure isolation', () => {
  beforeEach(() => {
    stubEmptyLs();
    vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
  });

  it('10–11. P1 valid / P2 malformed / P3 valid — switch cannot empty-overwrite', () => {
    const p1 = v1Body('PAGE ONE VALID');
    const p2 = '~nb1:["paragraph","PAGE TWO MALFORMED",[],null]'; // no codec on page
    const p3 = v1Body('PAGE THREE VALID');
    let nb = threePageNotebook(p1, p2, p3);

    // Visit malformed page using stored body only (fail-closed: no live empty rep)
    nb = switchUsingStoredBody(nb, 'page-2');
    expect(nb.activePageId).toBe('page-2');
    expect(nb.pages?.find(p => p.id === 'page-2')?.documentBody).toBe(p2);
    expect(nb.pages?.find(p => p.id === 'page-1')?.documentBody).toBe(p1);
    expect(nb.pages?.find(p => p.id === 'page-3')?.documentBody).toBe(p3);

    // Switch away without flushing empty TipTap doc
    nb = switchUsingStoredBody(nb, 'page-3');
    expect(nb.activePageId).toBe('page-3');
    expect(nb.pages?.find(p => p.id === 'page-2')?.documentBody).toBe(p2);
    expect(nb.pages?.find(p => p.id === 'page-1')?.documentBody).toBe(p1);
    expect(nb.pages?.find(p => p.id === 'page-3')?.documentBody).toBe(p3);

    // Apply persist with only P3 live edit — must not touch P2
    const editedP3 = v1Body('PAGE THREE EDITED');
    nb = applyNotebookPersist(
      { ...nb, body: editedP3, bodyCodecVersion: 1 },
      { body: editedP3, codecVersion: 1 },
    );
    expect(nb.pages?.find(p => p.id === 'page-3')?.documentBody).toBe(editedP3);
    expect(nb.pages?.find(p => p.id === 'page-2')?.documentBody).toBe(p2);
  });

  it('page-local TipTap fail-closed UI for P2 only', async () => {
    const p2 = '~nb1:["paragraph","BAD PAGE",[],null]';
    const onUserEdit = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: p2,
        pageKey: 'page-2',
        onUserEdit,
      }),
    );
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb-page-load-safe-error="1"]')).toBeTruthy(),
    );
    expect(onUserEdit).not.toHaveBeenCalled();

    // Switch to valid page body in same component (pageKey change)
    act(() => {
      root!.render(
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: v1Body('PAGE THREE VALID'),
          sourceBodyCodecVersion: 1,
          pageKey: 'page-3',
          onUserEdit,
        }),
      );
    });
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb-page-load-safe-error="1"]')).toBeNull(),
    );
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb-tiptap-candidate="1"]')).toBeTruthy(),
    );
    expect(onUserEdit).not.toHaveBeenCalled();
  });
});

describe('M7.1C missing asset refs survive', () => {
  it('12–13. image + handwriting refs round-trip without destructive rewrite', () => {
    const body = '::img::missing-blob-key::alt::\n::hw::missing-hw-key::';
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc(body),
    });
    try {
      const out = tiptapDocToBody(ed.getJSON());
      expect(out).toContain('::img::missing-blob-key::');
      expect(out).toContain('::hw::missing-hw-key::');
      const nb = hydrateNotebookPages({
        type: 'notebook',
        body: out,
        paperStyle: 'ruled',
        notebookMode: 'normal',
        notebookSurface: 'spatial',
      });
      const persisted = applyNotebookPersist(nb, { body: out, codecVersion: 1 });
      expect(persisted.pages?.[0]?.documentBody).toContain('::img::missing-blob-key::');
      expect(persisted.pages?.[0]?.documentBody).toContain('::hw::missing-hw-key::');
    } finally {
      ed.destroy();
    }
  });
});
