/**
 * M7.1B — TipTap production persistence safety (default ON flags).
 *
 * Proves the production write contract at the TipTap editor boundary and the
 * applyNotebookPersist / live-representation page-switch path used by
 * ProjectNotebookBlock (candidateLiveRepresentationRef).
 *
 * @vitest-environment happy-dom
 */
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import {
  isNotebookTiptapPersistActive,
  isNotebookTiptapCandidateActive,
} from './featureFlag';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { REAL_MEDIA_BODY } from './fixtures';
import {
  applyNotebookPersist,
  hydrateNotebookPages,
  migrateLegacyNotebook,
  switchNotebookPage,
  type NotebookContentWithPages,
} from '../notebookPages';
import { serializeNotebookBlocks } from '../notebookDialect';

const { NotebookTiptapCandidateEditor } = await import(
  '../../components/notebook/tiptap/NotebookTiptapCandidateEditor'
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

function stubEmptyLs() {
  const mem = new Map<string, string>();
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

function twoPageNotebook(p1: string, p2: string): NotebookContentWithPages {
  return {
    type: 'notebook',
    schemaVersion: 1,
    activePageId: 'page-1',
    activeSectionId: 'sec-1',
    sections: [{ id: 'sec-1', title: 'Section 1', pageIds: ['page-1', 'page-2'] }],
    pages: [
      {
        id: 'page-1',
        sectionId: 'sec-1',
        title: 'Page 1',
        kind: 'document',
        documentBody: p1,
        documentBodyCodecVersion: 1,
      },
      {
        id: 'page-2',
        sectionId: 'sec-1',
        title: 'Page 2',
        kind: 'document',
        documentBody: p2,
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
 * Mirrors ProjectNotebookBlock page-switch flush:
 * live TipTap body (candidateLiveRepresentationRef) is the currentBody for switch.
 */
function flushLiveThenSwitch(
  content: NotebookContentWithPages,
  live: { body: string; codecVersion: number },
  nextPageId: string,
): NotebookContentWithPages {
  const withLive = applyNotebookPersist(
    { ...content, body: live.body, bodyCodecVersion: live.codecVersion },
    live,
  );
  return switchNotebookPage(withLive, nextPageId, live.body, live.codecVersion);
}

afterEach(() => {
  unmount();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('M7.1B production defaults still enable TipTap persist', () => {
  beforeEach(() => {
    stubEmptyLs();
  });

  it('default: TipTap + persist Active', () => {
    expect(isNotebookTiptapCandidateActive()).toBe(true);
    expect(isNotebookTiptapPersistActive()).toBe(true);
  });

  it('legacy CE force → TipTap persist Active false (no independent TipTap writer)', () => {
    vi.stubEnv('VITE_NOTEBOOK_LEGACY_CE', 'true');
    expect(isNotebookTiptapCandidateActive()).toBe(false);
    expect(isNotebookTiptapPersistActive()).toBe(false);
  });
});

describe('M7.1B zero-write: mount / hydrate / selection / focus', () => {
  beforeEach(() => stubEmptyLs());

  it('A–B. mount + initial hydration → onUserEdit count 0', async () => {
    const onUserEdit = vi.fn();
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Existing notebook body',
        pageKey: 'page-open',
        onReady,
        onUserEdit,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onUserEdit).not.toHaveBeenCalled();
  });

  it('C. external re-hydration (pageSource change) → 0 writes', async () => {
    const onUserEdit = vi.fn();
    const onReady = vi.fn();
    let editor: Editor | null = null;
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Body A',
        pageKey: 'page-a',
        onReady,
        onEditorReady: ed => {
          editor = ed;
        },
        onUserEdit,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onUserEdit).not.toHaveBeenCalled();

    act(() => {
      root!.render(
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: 'Body B external',
          pageKey: 'page-a',
          onReady,
          onEditorReady: ed => {
            editor = ed;
          },
          onUserEdit,
        }),
      );
    });
    await vi.waitFor(() => expect(editor).toBeTruthy());
    await vi.waitFor(() => {
      expect(tiptapDocToBody(editor!.getJSON())).toContain('Body B external');
    });
    expect(onUserEdit).not.toHaveBeenCalled();
  });

  it('D–G. cursor / selection / focus / blur without doc change → 0 writes', async () => {
    const onUserEdit = vi.fn();
    const onReady = vi.fn();
    let editor: Editor | null = null;
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Paragraph one for selection',
        pageKey: 'page-sel',
        onReady,
        onEditorReady: ed => {
          editor = ed;
        },
        onUserEdit,
      }),
    );
    await vi.waitFor(() => expect(editor).toBeTruthy());
    expect(onUserEdit).not.toHaveBeenCalled();

    act(() => {
      editor!.commands.focus();
      editor!.commands.setTextSelection({ from: 1, to: 5 });
      editor!.commands.setTextSelection({ from: 2, to: 8 });
      editor!.commands.blur();
      editor!.commands.focus('start');
    });
    // Allow any async update flush
    await act(async () => {
      await new Promise<void>(r => setTimeout(r, 30));
    });
    expect(onUserEdit).not.toHaveBeenCalled();
  });
});

describe('M7.1B real user edit → canonical persistence boundary', () => {
  beforeEach(() => stubEmptyLs());

  it('typing → onUserEdit with V1 canonical body (not TipTap JSON)', async () => {
    const onUserEdit = vi.fn();
    const onReady = vi.fn();
    let editor: Editor | null = null;
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Start text',
        pageKey: 'page-edit',
        onReady,
        onEditorReady: ed => {
          editor = ed;
        },
        onUserEdit,
      }),
    );
    await vi.waitFor(() => expect(editor).toBeTruthy());
    expect(onUserEdit).not.toHaveBeenCalled();

    act(() => {
      editor!.commands.focus('end');
      editor!.commands.insertContent(' typed');
    });
    await vi.waitFor(() => expect(onUserEdit).toHaveBeenCalled());
    const [body, codec] = onUserEdit.mock.calls.at(-1)!;
    expect(codec).toBe(1);
    expect(typeof body).toBe('string');
    expect(body).toContain('Start text typed');
    expect(body.startsWith('~nb1:') || body.includes('Start text typed')).toBe(true);
    // Not TipTap JSON document
    expect(body).not.toMatch(/^\s*\{[\s\S]*"type"\s*:\s*"doc"/);
    expect(body).not.toContain('"type":"doc"');
  });
});

describe('M7.1B refresh / reopen', () => {
  beforeEach(() => stubEmptyLs());

  it('edit B → reopen with B → render B → 0 additional writes on open', async () => {
    const onUserEdit = vi.fn();
    let editor: Editor | null = null;
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'body A',
        pageKey: 'reopen',
        onEditorReady: ed => {
          editor = ed;
        },
        onUserEdit,
      }),
    );
    await vi.waitFor(() => expect(editor).toBeTruthy());

    act(() => {
      editor!.commands.focus('end');
      editor!.commands.insertContent(' → B');
    });
    await vi.waitFor(() => expect(onUserEdit).toHaveBeenCalled());
    const [persistedB] = onUserEdit.mock.calls.at(-1)! as [string, number];
    expect(persistedB).toContain('B');

    unmount();
    const onUserEditReopen = vi.fn();
    let editor2: Editor | null = null;
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: persistedB,
        sourceBodyCodecVersion: 1,
        pageKey: 'reopen',
        onEditorReady: ed => {
          editor2 = ed;
        },
        onUserEdit: onUserEditReopen,
      }),
    );
    await vi.waitFor(() => expect(editor2).toBeTruthy());
    await vi.waitFor(() => {
      expect(tiptapDocToBody(editor2!.getJSON(), 1)).toBe(persistedB);
    });
    expect(onUserEditReopen).not.toHaveBeenCalled();
  });
});

describe('M7.1B multi-page stale-write safety (live representation)', () => {
  beforeEach(() => {
    stubEmptyLs();
    vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
  });

  it('edit page 1 → switch page 2 → page 1 keeps edit; page 2 unchanged', () => {
    const p1 = serializeNotebookBlocks([{ kind: 'paragraph', text: 'PAGE ONE ORIGINAL' }], 1);
    const p2 = serializeNotebookBlocks([{ kind: 'paragraph', text: 'PAGE TWO ORIGINAL' }], 1);
    let nb = twoPageNotebook(p1, p2);

    const editedP1 = serializeNotebookBlocks([{ kind: 'paragraph', text: 'PAGE ONE EDITED' }], 1);
    const live = { body: editedP1, codecVersion: 1 as const };

    nb = flushLiveThenSwitch(nb, live, 'page-2');
    expect(nb.activePageId).toBe('page-2');
    expect(nb.pages?.find(p => p.id === 'page-1')?.documentBody).toBe(editedP1);
    expect(nb.pages?.find(p => p.id === 'page-2')?.documentBody).toBe(p2);
    expect(nb.body).toBe(p2);
  });

  it('edit both pages with switches → each retains its own edit', () => {
    const p1 = serializeNotebookBlocks([{ kind: 'paragraph', text: 'PAGE ONE ORIGINAL' }], 1);
    const p2 = serializeNotebookBlocks([{ kind: 'paragraph', text: 'PAGE TWO ORIGINAL' }], 1);
    let nb = twoPageNotebook(p1, p2);

    const editedP1 = serializeNotebookBlocks([{ kind: 'paragraph', text: 'PAGE ONE EDITED' }], 1);
    nb = flushLiveThenSwitch(nb, { body: editedP1, codecVersion: 1 }, 'page-2');

    const editedP2 = serializeNotebookBlocks([{ kind: 'paragraph', text: 'PAGE TWO EDITED' }], 1);
    nb = flushLiveThenSwitch(nb, { body: editedP2, codecVersion: 1 }, 'page-1');

    expect(nb.activePageId).toBe('page-1');
    expect(nb.pages?.find(p => p.id === 'page-1')?.documentBody).toBe(editedP1);
    expect(nb.pages?.find(p => p.id === 'page-2')?.documentBody).toBe(editedP2);
  });

  it('rapid switch after edit does not copy page-1 into page-2', () => {
    const p1 = serializeNotebookBlocks([{ kind: 'paragraph', text: 'PAGE ONE ORIGINAL' }], 1);
    const p2 = serializeNotebookBlocks([{ kind: 'paragraph', text: 'PAGE TWO ORIGINAL' }], 1);
    let nb = twoPageNotebook(p1, p2);
    const editedP1 = serializeNotebookBlocks([{ kind: 'paragraph', text: 'RAPID EDIT' }], 1);

    nb = flushLiveThenSwitch(nb, { body: editedP1, codecVersion: 1 }, 'page-2');
    nb = switchNotebookPage(nb, 'page-1', nb.body ?? '', nb.bodyCodecVersion);
    nb = switchNotebookPage(nb, 'page-2', nb.body ?? '', nb.bodyCodecVersion);

    expect(nb.pages?.find(p => p.id === 'page-1')?.documentBody).toBe(editedP1);
    expect(nb.pages?.find(p => p.id === 'page-2')?.documentBody).toBe(p2);
  });
});

describe('M7.1B legacy open → first edit only', () => {
  beforeEach(() => {
    stubEmptyLs();
    vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
  });

  it('open legacy without codec → 0 stamp; content visible via hydrate', () => {
    const legacy: NotebookContentWithPages = {
      type: 'notebook',
      body: '# Legacy Title\n\nLegacy prose',
      paperStyle: 'ruled',
      notebookMode: 'normal',
      notebookSurface: 'spatial',
    };
    const before = JSON.stringify(legacy);
    const hydrated = hydrateNotebookPages(legacy);
    expect(JSON.stringify(legacy)).toBe(before);
    expect(hydrated.pages?.[0]?.documentBodyCodecVersion).toBeUndefined();
    expect(hydrated.pages?.[0]?.documentBody).toContain('Legacy prose');
  });

  it('first real TipTap edit stamps V1 on active page only', () => {
    const migrated = migrateLegacyNotebook({
      type: 'notebook',
      body: 'Page one legacy',
      paperStyle: 'ruled',
      notebookMode: 'normal',
      notebookSurface: 'spatial',
    });
    // Add second page without codec
    const two: NotebookContentWithPages = {
      ...migrated,
      pages: [
        ...(migrated.pages ?? []),
        {
          id: 'page-extra',
          sectionId: migrated.activeSectionId ?? 'sec',
          title: 'Extra',
          kind: 'document',
          documentBody: 'UNTOUCHED OTHER PAGE',
        },
      ],
    };
    const sections = two.sections?.map(s =>
      s.id === (two.activeSectionId ?? s.id)
        ? { ...s, pageIds: [...(s.pageIds ?? []), 'page-extra'] }
        : s,
    );
    const withExtra = { ...two, sections };

    const edited = serializeNotebookBlocks([{ kind: 'paragraph', text: 'First tip-tap edit' }], 1);
    const persisted = applyNotebookPersist(
      { ...withExtra, body: edited, bodyCodecVersion: 1 },
      { body: edited, codecVersion: 1 },
    );

    const activeId = persisted.activePageId!;
    expect(persisted.pages?.find(p => p.id === activeId)?.documentBodyCodecVersion).toBe(1);
    expect(persisted.pages?.find(p => p.id === activeId)?.documentBody).toBe(edited);
    expect(persisted.pages?.find(p => p.id === 'page-extra')?.documentBody).toBe('UNTOUCHED OTHER PAGE');
    expect(persisted.pages?.find(p => p.id === 'page-extra')?.documentBodyCodecVersion).toBeUndefined();
  });
});

describe('M7.1B fail-closed hydrate / serialize', () => {
  beforeEach(() => stubEmptyLs());

  it('versioned ~nb1: with undefined codec → fail-closed, 0 writes, no empty overwrite of source prop', async () => {
    const corrupt = '~nb1:["paragraph","Secret content",[],null]';
    const onUserEdit = vi.fn();
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: corrupt,
        // intentionally omit sourceBodyCodecVersion
        pageKey: 'fail-closed',
        onReady,
        onUserEdit,
      }),
    );
    await vi.waitFor(() => expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeTruthy());
    expect(onUserEdit).not.toHaveBeenCalled();
    // Source prop not mutated by editor
    expect(corrupt).toContain('Secret content');
  });

  it('serialization failure path does not invoke onUserEdit with empty body', () => {
    const onUserEdit = vi.fn();
    const badDoc = { type: 'doc', content: [{ type: 'hardBreak' }] };
    expect(() => tiptapDocToBody(badDoc as never, 1)).toThrow();
    expect(onUserEdit).not.toHaveBeenCalled();
  });
});

describe('M7.1B representative object survival (adapter + persist)', () => {
  beforeEach(() => {
    stubEmptyLs();
    vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
  });

  it('RTL / math / link / image / hw / table survive edit-boundary round-trip', () => {
    const tableBody = `~nb1:${JSON.stringify(['table', '', [], { v: 1, rows: [[{ t: 'A' }, { t: 'B' }]] }])}`;
    const samples: Array<[string, string]> = [
      ['hebrew', 'שלום עולם'],
      ['inline_math', 'Value $x^2$ here'],
      ['block_math', '$$\nE=mc^2\n$$'],
      ['linkish', 'See https://example.com/docs'],
      ['media', REAL_MEDIA_BODY],
      ['table', tableBody],
    ];

    for (const [, body] of samples) {
      const codec = body.startsWith('~nb1:') ? 1 : undefined;
      const ed = new Editor({
        extensions: createNotebookTiptapSandboxExtensions(),
        content: bodyToTiptapDoc(body, codec),
      });
      try {
        const out = tiptapDocToBody(ed.getJSON(), codec);
        const nb = hydrateNotebookPages({
          type: 'notebook',
          body: out,
          ...(codec !== undefined ? { bodyCodecVersion: 1 } : {}),
          paperStyle: 'ruled',
          notebookMode: 'normal',
          notebookSurface: 'spatial',
        });
        const persisted = applyNotebookPersist(nb, {
          body: out,
          codecVersion: 1,
        });
        expect(persisted.pages?.[0]?.documentBody).toBe(out);
        expect(JSON.stringify(persisted)).not.toContain('"type":"doc"');
      } finally {
        ed.destroy();
      }
    }
  });
});
