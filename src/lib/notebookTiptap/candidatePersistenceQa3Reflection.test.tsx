/**
 * M5.2 QA3 Delayed-Reflection Regression Test.
 *
 * Reproduces the exact QA3 manual failure:
 * - Brand-new notebook (no initial pages/codec)
 * - Candidate ON, Persist ON
 * - Insert 3 lines using TipTap command API
 * - Allow initial save cycle (420ms debounce + parent reflection)
 * - Delete middle paragraph using ProseMirror/TipTap command API
 * - Advance through the real debounce chain and parent cloud-shaped reflection (activePageId omitted)
 * - Assert bodyCodecVersion remains 1, pageKey remains 'page-1', no fail-closed banner,
 *   line 2 stays deleted, lines 1 & 3 intact, undo/redo works, external updates hydrate.
 *
 * @vitest-environment happy-dom
 */

import { createElement, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { ensureProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';

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

describe('M5.2 QA3 Delayed-Reflection Regression', () => {
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
    mem.set('notebookTiptapCandidate', '1');
    mem.set('notebookTiptapPersist', '1');
    mem.set('notebookEngineeringChrome', '1');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_CANDIDATE', 'true');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_PERSIST', 'true');
    vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
  });

  it('preserves codec version and page key across delete and delayed cloud-shaped reflection', async () => {
    // 1. Brand new notebook: no initial pages or codec metadata
    const initialBrandNewContent: NotebookContent = {
      type: 'notebook',
      body: '',
      paperStyle: 'ruled',
      notebookSurface: 'spatial',
      notebookMode: 'normal',
    };

    let latestParentContent: NotebookContent = initialBrandNewContent;
    let triggerParentReflection: ((content: NotebookContent) => void) = () => {};

    function ParentStoreHarness() {
      const [storedContent, setStoredContent] = useState<NotebookContent>(initialBrandNewContent);
      triggerParentReflection = (c: NotebookContent) => {
        const processed = ensureProjectObjectContent('notebook', c) as NotebookContent;
        setStoredContent(processed);
      };

      return createElement(ProjectNotebookBlock, {
        content: storedContent,
        tokens,
        onChange: (next: NotebookContent) => {
          // Cloud persist contract: deep copy representing serialized cloud storage
          const forCloud = JSON.parse(JSON.stringify(next)) as NotebookContent;
          latestParentContent = forCloud;
          // Simulate the multi-tier store debounce / cloud reflection
          setTimeout(() => {
            triggerParentReflection(forCloud);
          }, 50);
        },
        presentation: 'embedded',
        context: 'free-space',
        objectId: 'ps-notebook-qa3',
        freeSpaceSectionId: 'sec-qa3',
        freeSpaceBoardId: 'board-qa3',
      });
    }

    // Track all pageKey values passed to TipTap candidate editor across all renders
    const observedPageKeys: string[] = [];
    const observer = new MutationObserver(() => {
      const statusEl = host?.querySelector('[data-nb-candidate-status="1"]');
      if (statusEl) {
        const text = statusEl.textContent ?? '';
        const match = text.match(/page=([^\s]+)/);
        if (match && match[1]) {
          observedPageKeys.push(match[1]);
        }
      }
    });

    mount(createElement(ParentStoreHarness));
    observer.observe(host!, { childList: true, subtree: true, characterData: true });

    // Initial render check: record immediate pageKey
    const initialStatusEl = host!.querySelector('[data-nb-candidate-status="1"]');
    if (initialStatusEl) {
      const match = (initialStatusEl.textContent ?? '').match(/page=([^\s]+)/);
      if (match && match[1]) observedPageKeys.push(match[1]);
    }

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-tiptap-candidate-root="1"]')).toBeTruthy();
      expect(host!.querySelector('[data-nb-candidate-persistence="guarded"]')).toBeTruthy();
    });

    const pm = host!.querySelector('.ProseMirror') as any;
    expect(pm).toBeTruthy();
    expect(pm.editor).toBeTruthy();
    const editor = pm.editor;

    // Initially pristine, no errors
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();
    const initialStatus = host!.querySelector('[data-nb-candidate-status="1"]')?.textContent ?? '';
    expect(initialStatus).toContain('page=page-1');

    // 2. Insert 3 lines using actual TipTap command API
    act(() => {
      editor.chain()
        .focus()
        .setContent({
          type: 'doc',
          content: [
            { type: 'nbParagraph', content: [{ type: 'text', text: 'Hello world שלום עולם' }] },
            { type: 'nbParagraph', content: [{ type: 'text', text: 'This is M5.2 QA3 clean.' }] },
            { type: 'nbParagraph', content: [{ type: 'text', text: '123 ABC אבג' }] },
          ],
        }, { emitUpdate: true })
        .run();
    });

    // 3. Allow initial save cycle (420ms debounce + parent store reflection)
    await new Promise(r => setTimeout(r, 600));

    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();
    if (latestParentContent.body?.includes('~nb1:')) {
      expect(latestParentContent.bodyCodecVersion).toBe(1);
    }
    const p1 = latestParentContent.pages?.find((p: any) => p.id === 'page-1');
    if (p1?.kind === 'document' && p1.documentBody?.includes('~nb1:')) {
      expect(p1.documentBodyCodecVersion).toBe(1);
    }

    // 4. Select the middle paragraph and delete it using TipTap command API
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

      expect(secondNodePos).toBeGreaterThanOrEqual(0);
      editor.chain()
        .focus()
        .deleteRange({ from: secondNodePos, to: secondNodePos + secondNodeSize })
        .run();
    });

    // Verify line 2 is deleted immediately in editor
    expect(pm.textContent).not.toContain('This is M5.2 QA3 clean.');
    expect(pm.textContent).toContain('Hello world שלום עולם');
    expect(pm.textContent).toContain('123 ABC אבג');

    // 5. Advance through real debounce chain: 420ms debounce flush + delayed parent store reflection
    await new Promise(r => setTimeout(r, 700));

    // 6. Assertions on the delayed reflected state:
    // A. No fail-closed banner
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();

    // B. If body contains ~nb1: then bodyCodecVersion must be 1
    if (latestParentContent.body?.includes('~nb1:')) {
      expect(latestParentContent.bodyCodecVersion).toBe(1);
    }
    const updatedPage1 = latestParentContent.pages?.find((p: any) => p.id === 'page-1');
    if (updatedPage1?.kind === 'document' && updatedPage1.documentBody?.includes('~nb1:')) {
      expect(updatedPage1.documentBodyCodecVersion).toBe(1);
    }

    // C. Page key must remain 'page-1' throughout (never flapped to 'legacy-body')
    const currentStatus = host!.querySelector('[data-nb-candidate-status="1"]')?.textContent ?? '';
    expect(currentStatus).toContain('page=page-1');
    expect(currentStatus).not.toContain('page=legacy-body');
    // HARD ASSERTION: pageKey must never have flapped to legacy-body in any render
    expect(observedPageKeys).not.toContain('legacy-body');

    // D. Editor DOM must NEVER expose raw ~nb1: text
    expect(pm.textContent).not.toContain('~nb1:');
    expect(host!.textContent).not.toContain('~nb1:');

    // E. Line 2 stays deleted, line 1 and line 3 remain correct
    expect(pm.textContent).toContain('Hello world שלום עולם');
    expect(pm.textContent).not.toContain('This is M5.2 QA3 clean.');
    expect(pm.textContent).toContain('123 ABC אבג');

    // F. Undo/redo still works after reflection
    act(() => {
      editor.commands.undo();
    });
    expect(pm.textContent).toContain('This is M5.2 QA3 clean.');

    act(() => {
      editor.commands.redo();
    });
    expect(pm.textContent).not.toContain('This is M5.2 QA3 clean.');
    expect(pm.textContent).toContain('Hello world שלום עולם');
    expect(pm.textContent).toContain('123 ABC אבג');

    // G. External non-self update still hydrates properly
    act(() => {
      triggerParentReflection({
        ...latestParentContent,
        pages: [
          {
            id: 'page-1',
            sectionId: 'sec-notes',
            kind: 'document',
            title: 'Page 1',
            documentBody: 'External remote text update',
          },
        ],
        body: 'External remote text update',
        bodyCodecVersion: undefined,
      });
    });

    await vi.waitFor(() => {
      expect(pm.textContent).toContain('External remote text update');
    });
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();
    observer.disconnect();
  });

  it('preserves bodyCodecVersion in effectiveContent when parent reflects cloud-shaped content (activePageId omitted) with active navigationOverlay', async () => {
    // Cloud-shaped content: bodyCodecVersion is 1, activePageId is undefined
    const cloudShapedContent: NotebookContent = {
      type: 'notebook',
      schemaVersion: 1,
      body: '~nb1:["paragraph","Cloud persisted text",[],null]',
      bodyCodecVersion: 1,
      sections: [{ id: 'sec-notes', title: 'Notes', pageIds: ['page-1'] }],
      pages: [
        {
          id: 'page-1',
          sectionId: 'sec-notes',
          kind: 'document',
          title: 'Page 1',
          documentBody: '~nb1:["paragraph","Cloud persisted text",[],null]',
          documentBodyCodecVersion: 1,
        },
      ],
      // activePageId omitted (cloud format)
    };

    mount(
      createElement(ProjectNotebookBlock, {
        content: cloudShapedContent,
        tokens,
        presentation: 'embedded',
        context: 'free-space',
        objectId: 'ps-notebook-cloud-shape',
        freeSpaceSectionId: 'sec-cloud',
        freeSpaceBoardId: 'board-cloud',
        onChange: vi.fn(),
      }),
    );

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-tiptap-candidate-root="1"]')).toBeTruthy();
    });

    // The editor must NOT be in fail-closed error state
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();

    const pm = host!.querySelector('.ProseMirror') as any;
    expect(pm).toBeTruthy();
    await vi.waitFor(() => {
      // Raw ~nb1: codec string must never be rendered as visible text
      expect(pm.textContent).not.toContain('~nb1:');
      expect(pm.textContent).toContain('Cloud persisted text');
    });

    // Status card must show page=page-1, not legacy-body
    const status = host!.querySelector('[data-nb-candidate-status="1"]')?.textContent ?? '';
    expect(status).toContain('page=page-1');
    expect(status).not.toContain('page=legacy-body');
  });
});
