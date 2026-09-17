/**
 * Free Space TipTap multi-click / native selection session integration.
 *
 * @vitest-environment happy-dom
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { AtmosphereTokens } from '../hooks/useAtmosphere';
import type { ProjectObjectContent, ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('./notebookHandwritingCloud', () => ({
  hydrateHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
  reconcileHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
}));

const { NotebookTiptapCandidateEditor } = await import(
  '../components/notebook/tiptap/NotebookTiptapCandidateEditor'
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

const LONG =
  'This is a very long paragraph that visually wraps onto three screen lines.';
const BODY = `${LONG}\nSecond block here`;

const notebookContent: Extract<ProjectObjectContent, { type: 'notebook' }> = {
  type: 'notebook',
  body: BODY,
  notebookMode: 'normal',
};

void tokens;
void notebookContent;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let editor: Editor | null = null;

function mountEditor(body: string = BODY) {
  host = document.createElement('div');
  host.style.width = '320px';
  host.style.height = '520px';
  document.body.appendChild(host);
  root = createRoot(host);
  editor = null;
  act(() => {
    root!.render(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: body,
        pageKey: 'fs-mc-page',
        onEditorReady: ed => {
          editor = ed;
        },
      }),
    );
  });
}

async function waitEditor(): Promise<Editor> {
  await vi.waitFor(() => expect(editor).toBeTruthy());
  return editor!;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document
    .querySelectorAll(
      '[data-nb-candidate-selection-toolbar], [data-nb-candidate-link-popover], [data-nb-format-toolbar="1"]',
    )
    .forEach(el => el.remove());
  root = null;
  host = null;
  editor = null;
});

describe('Free Space TipTap multi-click / selection', () => {
  it('A: collapsed caret alone does not open selection toolbar', async () => {
    mountEditor();
    const ed = await waitEditor();
    act(() => {
      ed.chain().focus().setTextSelection(1).run();
    });
    expect(ed.state.selection.empty).toBe(true);
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
  });

  it('C/D: non-empty text selection opens TipTap floating toolbar', async () => {
    mountEditor();
    const ed = await waitEditor();
    act(() => {
      ed.chain().focus().setTextSelection({ from: 1, to: 1 + LONG.length }).run();
    });
    expect(ed.state.selection.empty).toBe(false);
    expect(ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to, '\n')).toBe(
      LONG,
    );
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy();
    });
  });

  it('E: toolbar exposes format controls (no legacy CE morph/document session)', async () => {
    mountEditor();
    const ed = await waitEditor();
    act(() => {
      ed.chain().focus().setTextSelection({ from: 1, to: 8 }).run();
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-nb-candidate-fmt="bold"]')).toBeTruthy();
    expect(document.querySelector('[data-nb-candidate-fmt="italic"]')).toBeTruthy();
    // Legacy CE document-morph toolbar selectors are intentionally gone.
    expect(document.querySelector('[data-nb-format-toolbar="1"]')).toBeNull();
    expect(document.querySelector('[data-nb-toolbar-btn="h1"]')).toBeNull();
    expect(document.querySelector('[data-nb-toolbar-btn="duplicate"]')).toBeNull();
  });

  it('J: collapsing selection dismisses toolbar; new range reopens format session', async () => {
    mountEditor();
    const ed = await waitEditor();
    act(() => {
      ed.chain().focus().setTextSelection({ from: 1, to: 12 }).run();
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy();
    });

    act(() => {
      ed.chain().focus().setTextSelection(ed.state.selection.to).run();
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
    });

    act(() => {
      ed.chain().focus().setTextSelection({ from: 1, to: 5 }).run();
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy();
      expect(document.querySelector('[data-nb-candidate-fmt="bold"]')).toBeTruthy();
    });
  });
});

/** Keep Free Space surface smoke: TipTap mounts in embedded product path. */
describe('Free Space surface uses TipTap (no legacy rich-editable)', () => {
  it('embedded surface mounts TipTap candidate, not CE rich-editable', async () => {
    const { FreeSpaceNotebookSurface } = await import('../components/notebook/FreeSpaceNotebookSurface');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const object: ProjectSpaceObject = {
      id: 'fs-mc-1',
      type: 'notebook',
      title: 'Multi-click QA',
      content: notebookContent,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    act(() => {
      root!.render(
        createElement(FreeSpaceNotebookSurface, {
          content: notebookContent,
          tokens,
          object,
          onChange: vi.fn(),
        }),
      );
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-tiptap-candidate="1"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-rich-editable="1"]')).toBeNull();
  });
});
