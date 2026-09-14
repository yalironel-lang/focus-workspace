/**
 * M5.2 QA4 Undo/Redo In-Flight Reflection Regression & Stress Tests.
 *
 * Covers:
 * 1. Exact QA4 manual failure reproduction:
 *    - Brand-new notebook (no initial pages/codec)
 *    - Candidate ON, Persist ON
 *    - Type 3 lines -> wait 600ms
 *    - Delete middle line -> wait 600ms
 *    - Undo once (restores middle line)
 *    - Redo (deletes middle line again) while Undo's reflection is in-flight
 *    - Assert: No fail-closed error, Redo state preserved, no raw ~nb1:, undo/redo intact.
 *
 * 2. Rapid alternating history operations with out-of-order parent reflections:
 *    - Rapid Edit -> Undo -> Redo -> Undo -> Redo
 *    - Out-of-order parent reflection echoes arriving late
 *    - Verify newest local generation always wins and history is not wiped
 *    - Verify genuine external updates still hydrate properly
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

describe('M5.2 QA4 Undo/Redo In-Flight Reflection Regression', () => {
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
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_CANDIDATE', 'true');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_PERSIST', 'true');
    vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
  });

  it('preserves Redo state and prevents fail-closed corrupt state when Undo reflection arrives late', async () => {
    const initialContent: NotebookContent = {
      type: 'notebook',
      body: '',
      paperStyle: 'ruled',
      notebookSurface: 'spatial',
      notebookMode: 'normal',
    };

    let triggerParentReflection: ((content: NotebookContent) => void) = () => {};

    function Harness() {
      const [storedContent, setStoredContent] = useState<NotebookContent>(initialContent);
      triggerParentReflection = (c: NotebookContent) => {
        const processed = ensureProjectObjectContent('notebook', c) as NotebookContent;
        setStoredContent(processed);
      };

      return createElement(ProjectNotebookBlock, {
        content: storedContent,
        tokens,
        onChange: (next: NotebookContent) => {
          const forCloud = JSON.parse(JSON.stringify(next)) as NotebookContent;
          setTimeout(() => {
            triggerParentReflection(forCloud);
          }, 60);
        },
        presentation: 'embedded',
        context: 'free-space',
        objectId: 'ps-notebook-qa4',
        freeSpaceSectionId: 'sec-qa4',
        freeSpaceBoardId: 'board-qa4',
      });
    }

    mount(createElement(Harness));

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-tiptap-candidate-root="1"]')).toBeTruthy();
      expect(host!.querySelector('[data-nb-candidate-persistence="guarded"]')).toBeTruthy();
    });

    const pm = host!.querySelector('.ProseMirror') as any;
    expect(pm).toBeTruthy();
    expect(pm.editor).toBeTruthy();
    const editor = pm.editor;

    // 1. Initial 3 lines
    act(() => {
      editor.chain()
        .focus()
        .setContent({
          type: 'doc',
          content: [
            { type: 'nbParagraph', content: [{ type: 'text', text: 'Hello world שלום עולם' }] },
            { type: 'nbParagraph', content: [{ type: 'text', text: 'This is M5.2 QA4 clean.' }] },
            { type: 'nbParagraph', content: [{ type: 'text', text: '123 ABC אבג' }] },
          ],
        }, { emitUpdate: true })
        .run();
    });

    // Wait for initial persist
    await new Promise(r => setTimeout(r, 650));
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();
    expect(pm.textContent).toContain('This is M5.2 QA4 clean.');

    // 2. Delete middle line
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

    // Wait for delete persist
    await new Promise(r => setTimeout(r, 650));
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();
    expect(pm.textContent).not.toContain('This is M5.2 QA4 clean.');

    // 3. Undo once (brings back middle line)
    act(() => {
      editor.commands.undo();
    });
    expect(pm.textContent).toContain('This is M5.2 QA4 clean.');

    // 4. Wait 100ms (Undo's 420ms debounce is now ticking and will emit soon)
    await new Promise(r => setTimeout(r, 100));

    // 5. Redo before Undo's reflection finishes
    act(() => {
      editor.commands.redo();
    });
    // Immediately after Redo, middle line must be gone
    expect(pm.textContent).not.toContain('This is M5.2 QA4 clean.');

    // 6. Wait for all debounces and parent reflections to flush completely
    await new Promise(r => setTimeout(r, 800));

    // 7. Verify post-reflection state:
    // A. No fail-closed corrupt state error
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();

    // B. Middle line is still deleted (Redo state won, Undo reflection did NOT clobber it)
    expect(pm.textContent).not.toContain('This is M5.2 QA4 clean.');
    expect(pm.textContent).toContain('Hello world שלום עולם');
    expect(pm.textContent).toContain('123 ABC אבג');

    // C. No raw ~nb1: in DOM
    expect(pm.textContent).not.toContain('~nb1:');
    expect(host!.textContent).not.toContain('~nb1:');

    // D. Undo is still functional (history was NOT wiped by setContent)
    expect(editor.can().undo()).toBe(true);
    act(() => {
      editor.commands.undo();
    });
    expect(pm.textContent).toContain('This is M5.2 QA4 clean.');

    act(() => {
      editor.commands.redo();
    });
    expect(pm.textContent).not.toContain('This is M5.2 QA4 clean.');
  });

  it('handles rapid alternating history operations and out-of-order echoes, while still accepting genuine external updates', async () => {
    const initialContent: NotebookContent = {
      type: 'notebook',
      body: '',
      paperStyle: 'ruled',
      notebookSurface: 'spatial',
      notebookMode: 'normal',
    };

    let triggerParentReflection: ((content: NotebookContent) => void) = () => {};
    const pendingEchoes: NotebookContent[] = [];

    function Harness() {
      const [storedContent, setStoredContent] = useState<NotebookContent>(initialContent);
      triggerParentReflection = (c: NotebookContent) => {
        const processed = ensureProjectObjectContent('notebook', c) as NotebookContent;
        setStoredContent(processed);
      };

      return createElement(ProjectNotebookBlock, {
        content: storedContent,
        tokens,
        onChange: (next: NotebookContent) => {
          const forCloud = JSON.parse(JSON.stringify(next)) as NotebookContent;
          pendingEchoes.push(forCloud);
        },
        presentation: 'embedded',
        context: 'free-space',
        objectId: 'ps-notebook-stress',
        freeSpaceSectionId: 'sec-stress',
        freeSpaceBoardId: 'board-stress',
      });
    }

    mount(createElement(Harness));

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-tiptap-candidate-root="1"]')).toBeTruthy();
    });

    const pm = host!.querySelector('.ProseMirror') as any;
    const editor = pm.editor;

    // Step A: Set initial base text
    act(() => {
      editor.chain().focus().setContent({
        type: 'doc',
        content: [
          { type: 'nbParagraph', content: [{ type: 'text', text: 'Base Line' }] },
        ],
      }, { emitUpdate: true }).run();
    });
    await new Promise(r => setTimeout(r, 500));

    // Flush base echo
    while (pendingEchoes.length > 0) {
      const echo = pendingEchoes.shift()!;
      act(() => triggerParentReflection(echo));
    }
    await new Promise(r => setTimeout(r, 100));

    // Step B: Rapid series: Edit -> Undo -> Redo -> Undo -> Redo
    // 1. Edit (append text)
    act(() => {
      editor.chain().focus().insertContent(' + Edit 1').run();
    });
    expect(pm.textContent).toContain('Base Line + Edit 1');

    // 2. Undo (back to Base Line)
    act(() => {
      editor.commands.undo();
    });
    expect(pm.textContent).toBe('Base Line');

    // 3. Redo (back to Base Line + Edit 1)
    act(() => {
      editor.commands.redo();
    });
    expect(pm.textContent).toContain('Base Line + Edit 1');

    // 4. Undo (back to Base Line)
    act(() => {
      editor.commands.undo();
    });
    expect(pm.textContent).toBe('Base Line');

    // 5. Redo (back to Base Line + Edit 1)
    act(() => {
      editor.commands.redo();
    });
    expect(pm.textContent).toContain('Base Line + Edit 1');

    // Step C: Wait for debounces to fire and collect echoes
    await new Promise(r => setTimeout(r, 500));

    // Now replay pending echoes in REVERSE order (out-of-order network arrival)
    const reversed = [...pendingEchoes].reverse();
    pendingEchoes.length = 0;
    for (const echo of reversed) {
      act(() => triggerParentReflection(echo));
    }
    await new Promise(r => setTimeout(r, 100));

    // Verify:
    // 1. No fail-closed corrupt state error
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();
    // 2. Latest local Redo state is preserved
    expect(pm.textContent).toContain('Base Line + Edit 1');
    // 3. History is still working
    expect(editor.can().undo()).toBe(true);
    act(() => {
      editor.commands.undo();
    });
    expect(pm.textContent).toBe('Base Line');
    act(() => {
      editor.commands.redo();
    });
    expect(pm.textContent).toContain('Base Line + Edit 1');

    // Step D: Verify genuine external updates still hydrate
    act(() => {
      triggerParentReflection(ensureProjectObjectContent('notebook', {
        type: 'notebook',
        body: 'Remote collaborator change',
        schemaVersion: 1,
        sections: [{ id: 'sec-notes', title: 'Notes', pageIds: ['page-1'] }],
        pages: [
          {
            id: 'page-1',
            sectionId: 'sec-notes',
            kind: 'document',
            title: 'Page 1',
            documentBody: 'Remote collaborator change',
          },
        ],
      }) as NotebookContent);
    });

    await vi.waitFor(() => {
      expect(pm.textContent).toContain('Remote collaborator change');
    });
    expect(host!.querySelector('[data-nb-candidate-load-error="1"]')).toBeNull();
  });
});
