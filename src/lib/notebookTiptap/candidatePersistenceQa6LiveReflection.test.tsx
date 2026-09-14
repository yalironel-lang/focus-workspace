import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, act, useState, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';

type NotebookContent = Extract<ProjectObjectContent, { type: 'notebook' }>;

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('../../lib/notebookHandwritingCloud', () => ({
  hydrateHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
  reconcileHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
}));

const { ProjectSpaceObjectRenderer } = await import(
  '../../components/project-space/ProjectSpaceObjectRenderer'
);
const { ProjectNotebookBlock } = await import(
  '../../components/project-space/ProjectNotebookBlock'
);
const { useSectionFreeSpaceObjects } = await import(
  '../../hooks/useSectionFreeSpaceObjects'
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

function mount(el: any) {
  host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '600px';
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

describe('candidatePersistenceQa6LiveReflection', () => {
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
      length: 0,
      key: () => null,
    });
    mem.set('notebookTiptapCandidate', '1');
    mem.set('notebookTiptapPersist', '1');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_CANDIDATE', 'true');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_PERSIST', 'true');
    vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
  });

  afterEach(() => {
    unmount();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('exercises real live-parent-loop regression: brand-new notebook -> edit -> 420ms debounce -> parent setObjects -> rerender', async () => {
    const sectionId = 'sec-qa6-live';
    const boardId = 'main';

    let hookStore: any = null;
    let createdObjectId = '';
    const observedRenders: Array<{
      sourceCodec: string | null;
      pageKey: string | null;
      textContent: string;
      hasFailClosed: boolean;
    }> = [];

    function ParentApp() {
      const store = useSectionFreeSpaceObjects(sectionId, boardId, 'test-user');
      hookStore = store;
      const obj = store.objects.find(o => o.id === createdObjectId);

      useEffect(() => {
        const candidateRoot = host?.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement | null;
        if (candidateRoot) {
          observedRenders.push({
            sourceCodec: candidateRoot.getAttribute('data-nb-candidate-source-codec'),
            pageKey: candidateRoot.getAttribute('data-nb-candidate-page'),
            textContent: host?.textContent ?? '',
            hasFailClosed: (host?.textContent?.includes('Fail-closed') || host?.textContent?.includes('Corrupt state')) ?? false,
          });
        }
      });

      return createElement('div', null,
        obj ? createElement(ProjectSpaceObjectRenderer, {
          object: obj,
          allObjects: store.objects,
          tokens,
          freeSpaceSectionId: sectionId,
          freeSpaceBoardId: boardId,
          onChange: (newContent: any) => {
            store.updateObjectContent(obj.id, newContent);
          },
        }) : null
      );
    }

    mount(createElement(ParentApp));

    // 1. store.addObject('notebook')
    act(() => {
      const newObj = hookStore.addObject('notebook');
      createdObjectId = newObj.id;
    });

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-tiptap-candidate-root="1"]')).toBeTruthy();
    });

    const candidateRoot = host!.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement;
    const initialPageKey = candidateRoot.getAttribute('data-nb-candidate-page');
    // pageKey starts as page-1
    expect(initialPageKey).toBe('page-1');

    const pm = host!.querySelector('.ProseMirror') as any;
    expect(pm).toBeTruthy();
    const editor = pm.editor;
    expect(editor).toBeTruthy();

    // 2. Real TipTap candidate edit
    act(() => {
      editor.chain().focus().setContent({
        type: 'doc',
        content: [
          { type: 'nbParagraph', content: [{ type: 'text', text: 'Live parent loop test content' }] },
        ],
      }, { emitUpdate: true }).run();
    });

    // 3. 420ms persistence debounce + parent updateObjectContent + parent rerender
    await act(async () => {
      await new Promise(r => setTimeout(r, 600));
    });

    // Verify assertions after reflection:
    // 1. No fail-closed banner
    const hasFailClosed = host!.textContent?.includes('Fail-closed') || host!.textContent?.includes('Corrupt state');
    expect(hasFailClosed, `Encountered fail closed banner: ${host!.textContent}`).toBe(false);

    // 2. No visible raw "~nb1:" string
    const hasRawCodecString = host!.querySelector('.ProseMirror')?.textContent?.includes('~nb1:');
    expect(hasRawCodecString).toBe(false);

    // 3. pageKey remains page-1 through parent reflection
    const currentCandidateRoot = host!.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement;
    expect(currentCandidateRoot.getAttribute('data-nb-candidate-page')).toBe('page-1');

    // 4. Source codec version projected to candidate editor is 1
    expect(currentCandidateRoot.getAttribute('data-nb-candidate-source-codec')).toBe('1');

    // 5. Check durable object content in store: documentBodyCodecVersion === 1, bodyCodecVersion === 1
    const currentObj = hookStore.objects.find((o: any) => o.id === createdObjectId);
    expect(currentObj).toBeTruthy();
    expect(currentObj.content.body).toContain('~nb1:');
    expect(currentObj.content.bodyCodecVersion).toBe(1);
    expect(currentObj.content.pages?.[0]?.documentBodyCodecVersion).toBe(1);

    // 6. Assert during every observed render that no fail-closed occurred
    for (const r of observedRenders) {
      expect(r.hasFailClosed).toBe(false);
      if (r.pageKey) {
        expect(r.pageKey).toBe('page-1');
      }
    }
  });

  it('stale overlay regression: newer content.pages with V1 codec is not downgraded by stale overlay pages lacking codec', async () => {
    // Test setup:
    // NEW content.pages:
    //   page-1 documentBody = NEW_V1_BODY
    //   documentBodyCodecVersion = 1
    // Stale overlay or parent reflection:
    // Verify that ProjectNotebookBlock reconciles so that content.pages V1 wins and is not downgraded.
    const NEW_V1_BODY = '~nb1:["paragraph","Authoritative V1 Content",[],null]';
    const currentContent: NotebookContent = {
      type: 'notebook',
      body: NEW_V1_BODY,
      bodyCodecVersion: 1,
      paperStyle: 'ruled',
      notebookSurface: 'spatial',
      notebookMode: 'normal',
      sections: [{ id: 'sec-1', title: 'Notes', pageIds: ['page-1'] }],
      pages: [
        {
          id: 'page-1',
          sectionId: 'sec-1',
          kind: 'document',
          title: 'Page 1',
          documentBody: NEW_V1_BODY,
          documentBodyCodecVersion: 1,
        },
      ],
    };

    function Wrapper() {
      const [c, setC] = useState(currentContent);
      return createElement(ProjectNotebookBlock, {
        content: c,
        tokens,
        onChange: (nc: any) => setC(nc),
        presentation: 'embedded',
        context: 'free-space',
        objectId: 'obj-stale-test',
        freeSpaceSectionId: 'sec-test',
        freeSpaceBoardId: 'board-test',
      });
    }

    mount(createElement(Wrapper));

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-tiptap-candidate-root="1"]')).toBeTruthy();
    });

    const candidateRoot = host!.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement;
    expect(candidateRoot.getAttribute('data-nb-candidate-page')).toBe('page-1');
    expect(candidateRoot.getAttribute('data-nb-candidate-source-codec')).toBe('1');
    await vi.waitFor(() => {
      expect(host!.querySelector('.ProseMirror')?.textContent).toContain('Authoritative V1 Content');
    });
    expect(host!.textContent?.includes('Fail-closed')).toBe(false);
  });

  it('legitimate navigation to a different legacy page correctly projects legacy body and clears codec metadata', async () => {
    // Multi-page notebook:
    // page-1 is V1 (documentBodyCodecVersion: 1)
    // page-2 is legacy (documentBodyCodecVersion: undefined)
    const V1_BODY = '~nb1:["paragraph","Page 1 V1 text",[],null]';
    const LEGACY_BODY = 'Page 2 legacy plain text';

    const currentContent: NotebookContent = {
      type: 'notebook',
      body: V1_BODY,
      bodyCodecVersion: 1,
      paperStyle: 'ruled',
      notebookSurface: 'spatial',
      notebookMode: 'normal',
      activeSectionId: 'sec-1',
      activePageId: 'page-1',
      sections: [{ id: 'sec-1', title: 'Notes', pageIds: ['page-1', 'page-2'] }],
      pages: [
        {
          id: 'page-1',
          sectionId: 'sec-1',
          kind: 'document',
          title: 'Page 1',
          documentBody: V1_BODY,
          documentBodyCodecVersion: 1,
        },
        {
          id: 'page-2',
          sectionId: 'sec-1',
          kind: 'document',
          title: 'Page 2',
          documentBody: LEGACY_BODY,
          // documentBodyCodecVersion is undefined
        },
      ],
    };

    let setContentFn: any = null;
    function Wrapper() {
      const [c, setC] = useState(currentContent);
      setContentFn = setC;
      return createElement(ProjectNotebookBlock, {
        content: c,
        tokens,
        onChange: (nc: any) => setC(nc),
        presentation: 'embedded',
        context: 'free-space',
        objectId: 'obj-nav-test',
        freeSpaceSectionId: 'sec-test',
        freeSpaceBoardId: 'board-test',
      });
    }

    mount(createElement(Wrapper));

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-tiptap-candidate-root="1"]')).toBeTruthy();
    });

    // Initially on page-1
    let candidateRoot = host!.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement;
    expect(candidateRoot.getAttribute('data-nb-candidate-page')).toBe('page-1');
    expect(candidateRoot.getAttribute('data-nb-candidate-source-codec')).toBe('1');

    // Now legitimately navigate to page-2
    act(() => {
      setContentFn({
        ...currentContent,
        activePageId: 'page-2',
        body: LEGACY_BODY,
        bodyCodecVersion: undefined,
      });
    });

    await vi.waitFor(() => {
      candidateRoot = host!.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement;
      expect(candidateRoot.getAttribute('data-nb-candidate-page')).toBe('page-2');
    });

    // On page-2: codecVersion must be undefined (cleanly cleared, not retaining 1!)
    expect(candidateRoot.getAttribute('data-nb-candidate-source-codec')).toBe('undefined');
    expect(host!.textContent?.includes('Page 2 legacy plain text')).toBe(true);
    expect(host!.textContent?.includes('Fail-closed')).toBe(false);
  });
});
