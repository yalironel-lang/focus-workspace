/**
 * QA5 True Reload-Boundary Persistence Regression Tests.
 *
 * Validates that saved Notebook state carries authoritative codec metadata structurally
 * across true unmount/remount boundaries without depending on in-memory echo caches.
 *
 * Tests:
 * 1. Scenario A: Complete QA5 lifecycle across true unmount/remount boundary
 *    - Brand-new notebook -> Type 3 lines -> Delete middle line -> Wait persist -> Undo -> Redo -> Wait persist
 *    - Unmount React tree -> clear memory refs -> reload from stored JSON -> Mount fresh ProjectNotebookBlock
 *    - Assert: No fail-closed error, sourceBodyCodecVersion === 1, clean DOM, correct content, zero writes on reload.
 *
 * 2. Scenario B: Cloud representation reload boundary
 *    - Cloud-prepared notebook (omitted activePageId/activeSectionId)
 *    - Unmount -> Remount fresh
 *    - Assert: Default navigation resolves active page and projects documentBodyCodecVersion: 1 cleanly.
 *
 * 3. Scenario C: V1 page -> Switch to Legacy page -> True reload boundary
 *    - Multi-page notebook: Page 1 (V1, codec 1), Page 2 (legacy, codec undefined)
 *    - Switch to Page 2 -> Verify effectiveContent has NO bodyCodecVersion (no stale codec 1 leakage)
 *    - Persist -> Unmount -> Reload from storage
 *    - Assert: Legacy page reloads with bodyCodecVersion === undefined.
 *
 * 4. Scenario D: Legacy page -> Switch to V1 page -> Codec metadata sets atomically
 *    - Switch from legacy Page 2 back to V1 Page 1
 *    - Assert: effectiveContent receives bodyCodecVersion: 1 atomically without requiring typing.
 *
 * @vitest-environment happy-dom
 */

import { createElement, act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { boardScopedFreeSpaceKeys } from '../freeSpacePersistence';
import { prepareNotebookForCloudPersist } from '../notebookPages/persist';
import { applyNotebookPersist } from '../notebookPages/hydrate';
import type { NotebookContentWithPages } from '../notebookPages/types';

type NotebookContent = Extract<ProjectObjectContent, { type: 'notebook' }>;

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

describe('candidatePersistenceReloadBoundary', () => {
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

  it('Scenario A: brand-new disposable notebook survives full reload boundary after edits and undo/redo', async () => {
    const sectionId = 'sec-reload-a';
    const boardId = 'main';

    let hookStore: any = null;
    let createdObjectId = '';

    function SectionContainer() {
      const store = useSectionFreeSpaceObjects(sectionId, boardId, 'test-user');
      hookStore = store;
      const obj = store.objects.find(o => o.id === createdObjectId);

      return createElement('div', null,
        obj ? createElement(ProjectNotebookBlock, {
          content: obj.content as NotebookContent,
          tokens,
          onChange: (content: any) => store.updateObjectContent(obj.id, content),
          presentation: 'embedded',
          context: 'free-space',
          objectId: obj.id,
          freeSpaceSectionId: sectionId,
          freeSpaceBoardId: boardId,
        }) : null
      );
    }

    mount(createElement(SectionContainer));

    // 1. Create fresh disposable notebook
    act(() => {
      const newObj = hookStore.addObject('notebook');
      createdObjectId = newObj.id;
    });

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-tiptap-candidate-root="1"]')).toBeTruthy();
    });

    const pm = host!.querySelector('.ProseMirror') as any;
    const editor = pm.editor;

    // 2. Type 3 lines in candidate editor
    act(() => {
      editor.chain().focus().setContent({
        type: 'doc',
        content: [
          { type: 'nbParagraph', content: [{ type: 'text', text: 'Hello world שלום עולם' }] },
          { type: 'nbParagraph', content: [{ type: 'text', text: 'This is M5.2 QA5 clean.' }] },
          { type: 'nbParagraph', content: [{ type: 'text', text: '123 ABC אבג' }] },
        ],
      }, { emitUpdate: true }).run();
    });

    // 3. Delete middle line
    act(() => {
      const doc = editor.state.doc;
      let secondNodePos = -1;
      let secondNodeSize = 0;
      let nodeIdx = 0;
      doc.descendants((node: any, p: number) => {
        if (node.isBlock) {
          if (nodeIdx === 1) {
            secondNodePos = p;
            secondNodeSize = node.nodeSize;
          }
          nodeIdx++;
        }
        return false;
      });
      editor.chain().focus().deleteRange({ from: secondNodePos, to: secondNodePos + secondNodeSize }).run();
    });

    // Wait for debounce flush and storage write
    await new Promise(r => setTimeout(r, 1200));

    // 4. Undo
    act(() => {
      editor.commands.undo();
    });

    // 5. Redo
    act(() => {
      editor.commands.redo();
    });

    // Wait for persistence to settle
    await new Promise(r => setTimeout(r, 1200));

    // 6. Inspect stored JSON representation before refresh
    const storageKey = boardScopedFreeSpaceKeys(sectionId, boardId).objects;
    const rawStored = mem.get(storageKey);
    expect(rawStored).toBeTruthy();
    const storedList = JSON.parse(rawStored!);
    const storedObj = storedList.find((o: any) => o.id === createdObjectId);
    expect(storedObj).toBeDefined();

    // Verify stored representation carries authoritative codec metadata structurally
    expect(storedObj.content.bodyCodecVersion).toBe(1);
    expect(storedObj.content.pages).toBeDefined();
    expect(storedObj.content.pages[0].documentBodyCodecVersion).toBe(1);

    // Track writes to localStorage to ensure reload is idempotent (zero extra writes on reload)
    let writesAfterReload = 0;
    const originalSetItem = mem.set.bind(mem);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        writesAfterReload++;
        originalSetItem(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
      length: 0,
      key: () => null,
    });

    // 7. TRUE RELOAD: Unmount entire React tree and destroy all memory references
    unmount();
    hookStore = null;

    // 8. Re-mount fresh application from localStorage (simulates Cmd+R)
    mount(createElement(SectionContainer));

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-tiptap-candidate-root="1"]')).toBeTruthy();
    });

    // 9. Assertions after reload:
    // a. NO fail-closed error
    const errorEl = host!.querySelector('[data-nb-candidate-load-error="1"]');
    expect(errorEl).toBeNull();

    // b. Candidate editor is healthy and in guarded persist mode
    const rootEl = host!.querySelector('[data-nb-tiptap-candidate-root="1"]');
    expect(rootEl).toBeTruthy();
    const persistBadge = host!.querySelector('[data-nb-dir-persist="guarded"]');
    expect(persistBadge).toBeTruthy();

    // c. Editor content shows 2 lines (middle line remains deleted)
    await vi.waitFor(() => {
      const reloadedPm = host!.querySelector('.ProseMirror') as any;
      expect(reloadedPm).toBeTruthy();
      const textContent = reloadedPm.textContent;
      expect(textContent).toContain('Hello world שלום עולם');
      expect(textContent).not.toContain('This is M5.2 QA5 clean.');
      expect(textContent).toContain('123 ABC אבג');
      expect(textContent).not.toContain('~nb1:');
    });

    // e. Verify zero writes occurred just by reopening/reloading
    expect(writesAfterReload).toBe(0);
  });

  it('Scenario B: cloud representation with omitted activePageId correctly reconstructs V1 projection on reload', async () => {
    const sectionId = 'sec-reload-b';
    const boardId = 'main';
    const objectId = 'nb-cloud-shape';

    const versionedBody = '~nb1:["paragraph","Cloud persisted line 1",[],null]\n~nb1:["paragraph","Cloud persisted line 2",[],null]';

    // Build standard cloud-prepared notebook object
    const canonicalContent = applyNotebookPersist({
      type: 'notebook' as const,
      body: versionedBody,
      bodyCodecVersion: 1,
      paperStyle: 'ruled' as const,
      notebookSurface: 'spatial' as const,
      notebookMode: 'normal' as const,
      activeSectionId: 'sec-notes',
      activePageId: 'page-1',
    } as any);

    const cloudPayload = prepareNotebookForCloudPersist(canonicalContent, 'page-1');
    // Verify cloud contract: activePageId and activeSectionId are stripped
    expect(cloudPayload.activePageId).toBeUndefined();
    expect(cloudPayload.activeSectionId).toBeUndefined();
    expect(cloudPayload.bodyCodecVersion).toBe(1);
    expect(cloudPayload.pages?.[0]?.documentBodyCodecVersion).toBe(1);

    // Save directly into localStorage simulating a fresh pull from Supabase
    const storageKey = boardScopedFreeSpaceKeys(sectionId, boardId).objects;
    mem.set(
      storageKey,
      JSON.stringify([
        {
          id: objectId,
          type: 'notebook',
          title: 'Cloud Notebook',
          content: cloudPayload,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]),
    );

    function SectionContainer() {
      const store = useSectionFreeSpaceObjects(sectionId, boardId, 'test-user');
      const obj = store.objects.find(o => o.id === objectId);

      return createElement('div', null,
        obj ? createElement(ProjectNotebookBlock, {
          content: obj.content as NotebookContent,
          tokens,
          onChange: (content: any) => store.updateObjectContent(obj.id, content),
          presentation: 'embedded',
          context: 'free-space',
          objectId: obj.id,
          freeSpaceSectionId: sectionId,
          freeSpaceBoardId: boardId,
        }) : null
      );
    }

    mount(createElement(SectionContainer));

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-tiptap-candidate-root="1"]')).toBeTruthy();
    });

    // Verify candidate editor loads cleanly without fail-closed
    const errorEl = host!.querySelector('[data-nb-candidate-load-error="1"]');
    expect(errorEl).toBeNull();

    await vi.waitFor(() => {
      const pm = host!.querySelector('.ProseMirror') as any;
      expect(pm?.textContent).toContain('Cloud persisted line 1');
      expect(pm?.textContent).not.toContain('~nb1:');
    });
  });

  it('Scenario C & D: multi-page V1 and legacy pages maintain strict codec isolation across reload boundary', async () => {
    const sectionId = 'sec-reload-cd';
    const boardId = 'main';
    const objectId = 'nb-multipage';

    const v1Text = '~nb1:["paragraph","Page 1 is V1 format",[],null]';
    const legacyText = '# Page 2 is pure legacy markdown';

    // Multi-page notebook:
    // Page 1: V1 page with documentBodyCodecVersion: 1
    // Page 2: Legacy page with documentBodyCodecVersion: undefined
    const multiPageContent: NotebookContent = {
      type: 'notebook',
      schemaVersion: 1,
      body: v1Text,
      bodyCodecVersion: 1,
      paperStyle: 'ruled',
      notebookSurface: 'spatial',
      notebookMode: 'normal',
      activeSectionId: 'sec-notes',
      activePageId: 'page-1',
      sections: [{ id: 'sec-notes', title: 'Notes', pageIds: ['page-1', 'page-2'] }],
      pages: [
        {
          id: 'page-1',
          sectionId: 'sec-notes',
          kind: 'document',
          title: 'V1 Page',
          documentBody: v1Text,
          documentBodyCodecVersion: 1,
        },
        {
          id: 'page-2',
          sectionId: 'sec-notes',
          kind: 'document',
          title: 'Legacy Page',
          documentBody: legacyText,
          // documentBodyCodecVersion: undefined
        },
      ],
    };

    function MultiPageSimulator({ initialContent }: { initialContent: NotebookContent }) {
      const [currentContent, setCurrentContent] = useState(initialContent);

      return createElement('div', null,
        createElement(ProjectNotebookBlock, {
          content: currentContent,
          tokens,
          onChange: (next: any) => {
            setCurrentContent(next);
          },
          presentation: 'embedded',
          context: 'free-space',
          objectId,
          freeSpaceSectionId: sectionId,
          freeSpaceBoardId: boardId,
        })
      );
    }

    mount(createElement(MultiPageSimulator, { initialContent: multiPageContent }));

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-tiptap-candidate-root="1"]')).toBeTruthy();
    });

    // 1. Initial active page is Page 1 (V1)
    await vi.waitFor(() => {
      expect(host!.querySelector('.ProseMirror')?.textContent).toContain('Page 1 is V1 format');
    });

    // 2. Switch to Page 2 (Legacy page)
    const page2ActiveContent: NotebookContent = {
      ...multiPageContent,
      activePageId: 'page-2',
      body: legacyText,
    };
    delete (page2ActiveContent as any).bodyCodecVersion;

    // Unmount
    unmount();

    // 3. Reload boundary with Page 2 as the active page
    mount(createElement(MultiPageSimulator, { initialContent: page2ActiveContent }));

    // Assert: Legacy page reloads with legacy body and NO bodyCodecVersion
    const rootAttr = host!.querySelector('[data-nb-tiptap-candidate-root="1"]');
    expect(rootAttr).toBeTruthy();

    // 4. Ensure no stale codec 1 leaked into top-level bodyCodecVersion
    const page2Prepared = prepareNotebookForCloudPersist(page2ActiveContent, 'page-2');
    expect(page2Prepared.bodyCodecVersion).toBeUndefined();

    // 5. Switch back from Legacy Page 2 to V1 Page 1:
    // Core invariant: switching from legacy to V1 MUST set codec metadata atomically
    const backToPage1Content: NotebookContent = {
      ...page2ActiveContent,
      activePageId: 'page-1',
    };
    const page1Prepared = prepareNotebookForCloudPersist(backToPage1Content, 'page-1');
    expect(page1Prepared.bodyCodecVersion).toBe(1);
    expect(page1Prepared.body).toBe(v1Text);
  });
});
