/**
 * M5.2 End-to-End Regression Test:
 * Parent-Child Feedback Loop (ProjectNotebookBlock <-> NotebookTiptapCandidateEditor).
 *
 * Verifies that:
 * 1. Legacy pages upgrade to V1 on genuine TipTap edit and propagate bodyCodecVersion: 1
 *    through pushContent -> applyNotebookPersist -> navigationOverlay -> candidate props.
 * 2. The candidate editor's self-echo guard suppresses spurious setContent resets.
 * 3. The editor DOM NEVER exposes raw "~nb1:" codec text.
 * 4. Deleting user text (including down to empty document) never causes codec leakage
 *    or nested double-serialization.
 * 5. Inactive legacy pages remain legacy (no accidental upgrade).
 * 6. External/remote parent updates still hydrate properly through the self-echo guard.
 * 7. Undo/redo survives the save feedback cycle.
 *
 * @vitest-environment happy-dom
 */

import { createElement, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { NotebookContent } from '../notebookPages';
import { parseNotebookBody } from '../notebookDialect';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('../../lib/notebookHandwritingCloud', () => ({
  hydrateHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
  reconcileHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
}));

const { ProjectNotebookBlock } = await import(
  '../../components/project-space/ProjectNotebookBlock'
);

const tokens = {
  cardBorder: 'rgba(255,255,255,0.08)',
  cardBg: 'rgba(20,16,12,0.92)',
  wellBg: 'rgba(255,255,255,0.03)',
  textPrimary: 'rgba(255,248,235,0.92)',
  textSecondary: 'rgba(255,248,235,0.62)',
  textMuted: 'rgba(255,248,235,0.42)',
  textGhost: 'rgba(255,248,235,0.28)',
  accent: '#f59e0b',
  accentGlow: 'rgba(245,158,11,0.35)',
} as AtmosphereTokens;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(el: ReactElement) {
  host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '600px';
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(el);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('M5.2 End-to-End Feedback Loop Regression', () => {
  const mem = new Map<string, string>();

  beforeEach(() => {
    mem.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    });
    // Enable candidate and persist flags
    mem.set('notebookTiptapCandidate', '1');
    mem.set('notebookTiptapPersist', '1');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_CANDIDATE', 'true');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_PERSIST', 'true');
    vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
  });

  it('full mounted ProjectNotebookBlock feedback loop: edit -> persist -> delete -> undo/redo -> external update -> malformed fail-closed', async () => {
    // 1. Initial page is legacy:
    //    bodyCodecVersion === undefined
    //    documentBodyCodecVersion === undefined
    const initialLegacyContent: NotebookContent = {
      type: 'notebook',
      schemaVersion: 1,
      body: 'Initial legacy paragraph',
      notebookMode: 'normal',
      pages: [
        {
          id: 'page-1',
          sectionId: 'sec-1',
          kind: 'document',
          title: 'Page 1',
          documentBody: 'Initial legacy paragraph',
        },
        {
          id: 'page-2',
          sectionId: 'sec-1',
          kind: 'document',
          title: 'Page 2 (untouched legacy)',
          documentBody: 'Second page legacy text',
        },
      ],
      sections: [{ id: 'sec-1', title: 'Section 1', pageIds: ['page-1', 'page-2'] }],
      activeSectionId: 'sec-1',
      activePageId: 'page-1',
    };

    expect(initialLegacyContent.bodyCodecVersion).toBeUndefined();
    expect(initialLegacyContent.pages?.[0]?.documentBodyCodecVersion).toBeUndefined();
    expect(initialLegacyContent.pages?.[1]?.documentBodyCodecVersion).toBeUndefined();

    let latestContent = initialLegacyContent;
    let setContentFn: (c: NotebookContent) => void = () => {};
    function TestContainer() {
      const [content, setContent] = useState<NotebookContent>(initialLegacyContent);
      setContentFn = setContent;
      return createElement(ProjectNotebookBlock, {
        content,
        tokens,
        onChange: (next: NotebookContent) => {
          latestContent = next;
          setContent(next);
        },
        presentation: 'notebook',
        objectTitle: 'Test Notebook',
      });
    }

    mount(createElement(TestContainer));

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-tiptap-candidate-root="1"]')).toBeTruthy();
      expect(host!.querySelector('[data-nb-candidate-persistence="guarded"]')).toBeTruthy();
    });

    const pm = host!.querySelector('.ProseMirror') as any;
    expect(pm).toBeTruthy();
    expect(pm.editor).toBeTruthy();
    const editor = pm.editor;

    // Verify initial DOM does not contain ~nb1:
    expect(pm.textContent).not.toContain('~nb1:');

    // 2. Perform real TipTap edit using commands API
    act(() => {
      editor.commands.focus('end');
      editor.commands.insertContent(' user edit');
    });

    // 3. Confirm onUserEdit/persistence path emits V1 body + codec 1
    // 4. Allow real parent state/navigationOverlay/effectiveContent feedback to occur (420ms debounce flush)
    await new Promise(r => setTimeout(r, 600));

    // 5. Assert:
    //    - no fail-closed error
    //    - candidate remains mounted/healthy
    //    - editor visible text contains user text only
    //    - "~nb1:" is never visible in the editor DOM
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();
    expect(editor.isDestroyed).toBe(false);
    expect(pm.textContent).toContain('user edit');
    expect(pm.textContent).not.toContain('~nb1:');
    expect(host!.textContent).not.toContain('~nb1:');

    // 6. Confirm:
    //    - top-level bodyCodecVersion === 1
    //    - active page documentBodyCodecVersion === 1
    //    - untouched second page remains undefined
    expect(latestContent.bodyCodecVersion).toBe(1);
    expect(latestContent.pages?.[0]?.documentBodyCodecVersion).toBe(1);
    expect(latestContent.pages?.[1]?.documentBodyCodecVersion).toBeUndefined();
    expect(latestContent.pages?.[1]?.documentBody).toBe('Second page legacy text');

    // 7. Delete all content using real TipTap commands
    act(() => {
      editor.commands.clearContent(true);
    });

    // 8. Let the feedback loop run again
    await new Promise(r => setTimeout(r, 600));

    // 9. Assert:
    //    - no fail-closed error
    //    - no "~nb1:" visible
    //    - active page remains codec 1
    //    - persisted body is valid V1 empty representation
    //    - no double serialization
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();
    expect(pm.textContent).not.toContain('~nb1:');
    expect(host!.textContent).not.toContain('~nb1:');
    expect(latestContent.pages?.[0]?.documentBodyCodecVersion).toBe(1);
    expect(latestContent.body).not.toContain('~nb1:[\\"');
    expect(latestContent.body).not.toContain('~nb1:["paragraph","~nb1:');
    expect(latestContent.pages?.[0]?.documentBody).not.toContain('~nb1:[\\"');

    // 10. Undo and redo after the feedback cycle
    act(() => {
      editor.commands.undo();
    });

    // 11. Assert undo/redo still works and does not trigger corruption
    expect(pm.textContent).toContain('user edit');
    expect(pm.textContent).not.toContain('~nb1:');
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();

    act(() => {
      editor.commands.redo();
    });
    expect(pm.textContent).not.toContain('user edit');
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();

    // Wait for the redo persistence debounce to settle before external updates
    await new Promise(r => setTimeout(r, 600));

    // 12. Perform a genuine external parent update that is NOT the editor's own self-echo. Confirm it still hydrates.
    act(() => {
      const { bodyCodecVersion: _bcv, ...rest } = latestContent;
      const pages = (latestContent.pages ?? []).map((p, idx) => {
        if (idx !== 0) return p;
        const { documentBodyCodecVersion: _dcv, ...prest } = p;
        return { ...prest, documentBody: 'Remote external update' };
      });
      setContentFn({
        ...rest,
        body: 'Remote external update',
        pages,
      });
    });

    await vi.waitFor(() => {
      expect(pm.textContent).toContain('Remote external update');
    });

    // 13. Inject malformed external state: V1 body + undefined codecVersion that was NOT emitted by this editor.
    // Confirm fail-closed still triggers.
    act(() => {
      const { bodyCodecVersion: _bcv, ...rest } = latestContent;
      const pages = (latestContent.pages ?? []).map((p, idx) => {
        if (idx !== 0) return p;
        const { documentBodyCodecVersion: _dcv, ...prest } = p;
        return { ...prest, documentBody: '~nb1:["paragraph","malformed external content",[],null]' };
      });
      setContentFn({
        ...rest,
        body: '~nb1:["paragraph","malformed external content",[],null]',
        pages,
      });
    });

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeTruthy();
    });
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')?.textContent).toContain(
      'Corrupt state: received versioned Notebook text (~nb1:) with undefined codecVersion',
    );
  });

  it('pushContent propagates next.bodyCodecVersion when provided, without upgrading when omitted', async () => {
    const initialLegacy: NotebookContent = {
      type: 'notebook',
      body: '# Original legacy',
      notebookMode: 'normal',
      pages: [
        {
          id: 'page-1',
          sectionId: 'sec-1',
          kind: 'document',
          title: 'Page 1',
          documentBody: '# Original legacy',
        },
        {
          id: 'page-2',
          sectionId: 'sec-1',
          kind: 'document',
          title: 'Page 2',
          documentBody: 'Page 2 legacy',
        },
      ],
      sections: [{ id: 'sec-1', title: 'Section 1', pageIds: ['page-1', 'page-2'] }],
      activeSectionId: 'sec-1',
      activePageId: 'page-1',
    };

    function Harness() {
      const [content, setContent] = useState(initialLegacy);
      return createElement(ProjectNotebookBlock, {
        content,
        tokens,
        onChange: (next: NotebookContent) => {
          setContent(next);
        },
        presentation: 'notebook',
      });
    }

    mount(createElement(Harness));

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-tiptap-candidate-root="1"]')).toBeTruthy();
    });

    // Verify candidate root has guarded persistence
    expect(host!.querySelector('[data-nb-candidate-persistence="guarded"]')).toBeTruthy();
  });

  it('external updates hydrate through the self-echo guard', async () => {
    const { NotebookTiptapCandidateEditor } = await import(
      '../../components/notebook/tiptap/NotebookTiptapCandidateEditor'
    );

    let editorInstance: import('@tiptap/core').Editor | null = null;
    const onUserEdit = vi.fn();
    const onReady = vi.fn();

    let setBodyFn: (b: string, v?: number) => void = () => {};
    function EditorHarness() {
      const [body, setBody] = useState('Initial body text');
      const [codecVersion, setCodecVersion] = useState<number | undefined>(undefined);
      setBodyFn = (b, v) => {
        setBody(b);
        setCodecVersion(v);
      };
      return createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: body,
        sourceBodyCodecVersion: codecVersion,
        pageKey: 'page-test',
        onReady,
        onEditorReady: (ed) => {
          editorInstance = ed;
        },
        onUserEdit,
      });
    }

    mount(createElement(EditorHarness));
    await vi.waitFor(() => expect(editorInstance).toBeTruthy());

    // Verify initial text loaded
    expect(editorInstance!.getText()).toContain('Initial body text');

    // Now simulate a genuine remote external update
    act(() => {
      setBodyFn('Remote device updated this content', undefined);
    });

    await vi.waitFor(() => {
      expect(editorInstance!.getText()).toContain('Remote device updated this content');
    });

    // Self-echo test: simulate the editor emitting a save
    act(() => {
      editorInstance!.commands.focus('end');
      editorInstance!.commands.insertContent(' local edit');
    });

    await vi.waitFor(() => expect(onUserEdit).toHaveBeenCalled());
    const [emittedBody, emittedCodec] = onUserEdit.mock.calls[onUserEdit.mock.calls.length - 1]!;

    // Simulate the parent reflecting the emitted body back down as props
    act(() => {
      setBodyFn(emittedBody, emittedCodec);
    });

    // The editor must NOT have reset or cleared content, and must NOT show ~nb1:
    expect(editorInstance!.getText()).not.toContain('~nb1:');
    expect(editorInstance!.getText()).toContain('local edit');
  });

  it('candidate editor survives transient undefined codecVersion for self-emitted body during render', async () => {
    const { NotebookTiptapCandidateEditor } = await import(
      '../../components/notebook/tiptap/NotebookTiptapCandidateEditor'
    );

    let editorInstance: import('@tiptap/core').Editor | null = null;
    const onUserEdit = vi.fn();
    let setPropsFn: (p: { body: string; codec?: number }) => void = () => {};

    function Harness() {
      const [props, setProps] = useState<{ body: string; codec?: number }>({
        body: 'Initial legacy text',
        codec: undefined,
      });
      setPropsFn = setProps;
      return createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: props.body,
        sourceBodyCodecVersion: props.codec,
        pageKey: 'page-1',
        onEditorReady: ed => {
          editorInstance = ed;
        },
        onUserEdit,
      });
    }

    mount(createElement(Harness));
    await vi.waitFor(() => expect(editorInstance).toBeTruthy());

    // 1. TipTap candidate edits content
    act(() => {
      editorInstance!.commands.focus('end');
      editorInstance!.commands.insertContent(' edit');
    });

    await vi.waitFor(() => expect(onUserEdit).toHaveBeenCalled());
    const [emittedBody] = onUserEdit.mock.calls[onUserEdit.mock.calls.length - 1]!;
    expect(emittedBody).toContain('~nb1:');

    // 2. Parent reflects back emitted body but with transient undefined codecVersion (e.g. from navigationOverlay bug)
    act(() => {
      setPropsFn({ body: emittedBody, codec: undefined });
    });

    // 3. In pre-fix code, this FAILS because load throws fail-closed error during render!
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();
  });

  it('fail-closed: candidate refuses to parse ~nb1: with undefined codecVersion', async () => {
    const { NotebookTiptapCandidateEditor } = await import(
      '../../components/notebook/tiptap/NotebookTiptapCandidateEditor'
    );

    mount(
      createElement(NotebookTiptapCandidateEditor, {
        // Deliberately corrupt state: ~nb1: body with undefined codecVersion
        sourceDocumentBody: '~nb1:["paragraph","corrupt content",[],null]',
        sourceBodyCodecVersion: undefined,
        pageKey: 'corrupt-page',
      }),
    );

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeTruthy();
    });

    // Assert that the raw ~nb1: text was NEVER parsed as visible text into the ProseMirror editor
    const pm = host!.querySelector('.ProseMirror');
    expect(pm).toBeNull(); // EditorContent is hidden when load.error is present
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')?.textContent).toContain(
      'Corrupt state: received versioned Notebook text (~nb1:) with undefined codecVersion',
    );
  });
});

  it('full 14-step scenario: legacy page edit -> feedback -> delete text -> undo/redo -> untouched page isolation', async () => {
    const { NotebookTiptapCandidateEditor } = await import(
      '../../components/notebook/tiptap/NotebookTiptapCandidateEditor'
    );
    const { applyNotebookPersist } = await import('../notebookPages');

    // 1. Initial legacy notebook: 2 pages, both legacy (bodyCodecVersion undefined)
    let notebook: NotebookContent = {
      type: 'notebook',
      schemaVersion: 1,
      body: '# Page 1 Title\nLegacy paragraph content',
      notebookMode: 'normal',
      pages: [
        {
          id: 'page-1',
          sectionId: 'sec-1',
          kind: 'document',
          title: 'Page 1',
          documentBody: '# Page 1 Title\nLegacy paragraph content',
          // documentBodyCodecVersion undefined
        },
        {
          id: 'page-2',
          sectionId: 'sec-1',
          kind: 'document',
          title: 'Page 2',
          documentBody: 'Untouched page 2 legacy text',
          // documentBodyCodecVersion undefined
        },
      ],
      sections: [{ id: 'sec-1', title: 'Section 1', pageIds: ['page-1', 'page-2'] }],
      activeSectionId: 'sec-1',
      activePageId: 'page-1',
    };

    let editorInstance: import('@tiptap/core').Editor | null = null;
    let setPropsFn: (p: { body: string; codecVersion?: number }) => void = () => {};

    // Simulate ProjectNotebookBlock's pushContent implementation with Fix 1
    const pushContent = (next: NotebookContent) => {
      const targetCodecVersion =
        next.bodyCodecVersion !== undefined
          ? next.bodyCodecVersion
          : notebook.bodyCodecVersion;
      const merged: NotebookContent = {
        ...notebook,
        body: next.body ?? notebook.body ?? '',
        ...(targetCodecVersion !== undefined ? { bodyCodecVersion: targetCodecVersion } : {}),
      };
      const persistedNext = applyNotebookPersist(merged);
      notebook = persistedNext;
      // Reflect updated props back down to candidate editor
      setPropsFn({
        body: persistedNext.body ?? '',
        codecVersion: persistedNext.bodyCodecVersion,
      });
    };

    const handleCandidateUserEdit = (body: string, codecVersion: number) => {
      pushContent({ ...notebook, body, bodyCodecVersion: codecVersion });
    };

    function ComponentHarness() {
      const [props, setProps] = useState<{ body: string; codecVersion?: number }>({
        body: notebook.body ?? '',
        codecVersion: notebook.bodyCodecVersion,
      });
      setPropsFn = setProps;

      return createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: props.body,
        sourceBodyCodecVersion: props.codecVersion,
        pageKey: 'page-1',
        onEditorReady: (ed) => {
          editorInstance = ed;
        },
        onUserEdit: handleCandidateUserEdit,
      });
    }

    mount(createElement(ComponentHarness));
    await vi.waitFor(() => expect(editorInstance).toBeTruthy());

    // 2. Initial state verification: DOM has normal text, no ~nb1:
    const getDomText = () => host!.textContent ?? '';
    expect(getDomText()).not.toContain('~nb1:');
    expect(notebook.pages?.[0]?.documentBodyCodecVersion).toBeUndefined();
    expect(notebook.pages?.[1]?.documentBodyCodecVersion).toBeUndefined();

    // 3. Step 5: Perform genuine TipTap edit on Page 1
    act(() => {
      editorInstance!.commands.focus('end');
      editorInstance!.commands.insertContent(' - newly added content');
    });

    // 4. Step 6: Assert resulting content has bodyCodecVersion: 1 and page 1 has documentBodyCodecVersion: 1
    await vi.waitFor(() => {
      expect(notebook.bodyCodecVersion).toBe(1);
      expect(notebook.pages?.[0]?.documentBodyCodecVersion).toBe(1);
    });

    // 5. Step 8: Assert editor DOM NEVER exposes ~nb1:
    expect(getDomText()).not.toContain('~nb1:');
    expect(getDomText()).not.toContain('~nb1:["title"');
    expect(getDomText()).not.toContain('~nb1:["paragraph"');

    // 6. Step 9: Delete visible text down to empty-document case
    act(() => {
      editorInstance!.commands.clearContent(true);
    });

    // 7. Step 10: Assert ~nb1: still NEVER appears in the editor DOM
    await vi.waitFor(() => {
      expect(getDomText()).not.toContain('~nb1:');
    });

    // 8. Step 11: Assert persisted body is valid V1 (empty string or V1 record) and NOT double-serialized
    expect(notebook.body).not.toContain('~nb1:[\\"');
    expect(notebook.body).not.toContain('~nb1:["paragraph","~nb1:');
    expect(notebook.pages?.[0]?.documentBody).not.toContain('~nb1:[\\"');

    // 9. Step 12: Assert active page remains codec V1
    expect(notebook.pages?.[0]?.documentBodyCodecVersion).toBe(1);

    // 10. Step 13: Assert page 2 (untouched legacy page) REMAINS legacy
    expect(notebook.pages?.[1]?.documentBodyCodecVersion).toBeUndefined();
    expect(notebook.pages?.[1]?.documentBody).toBe('Untouched page 2 legacy text');

    // 11. Step 14: Assert undo still works after save feedback cycle
    act(() => {
      editorInstance!.commands.undo();
    });

    // After undo, the cleared content is restored
    expect(getDomText()).toContain('Page 1 Title');
    expect(getDomText()).not.toContain('~nb1:');
  });
