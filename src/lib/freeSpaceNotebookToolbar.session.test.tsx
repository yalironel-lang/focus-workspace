/**
 * Free Space TipTap toolbar selection-session stability.
 *
 * @vitest-environment happy-dom
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { AtmosphereTokens } from '../hooks/useAtmosphere';
import {
  DEFAULT_NOTEBOOK_FONT_SIZE,
  FONT_SIZE_OPTIONS,
  fontSizeAtSelection,
  applyMarkToggle,
  isMarkActiveOnRange,
} from './notebookInlineMarks';
import { tiptapDocToBody } from './notebookTiptap/tiptapDocToBody';
import {
  CANDIDATE_FONT_SIZE_PRESETS,
  runCandidateFormatCommand,
} from './notebookTiptap/candidateFormatCommands';

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
const { FreeSpaceNotebookSurface } = await import('../components/notebook/FreeSpaceNotebookSurface');

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

const SAMPLE = 'This is some example text for toolbar testing';
const SEL_START = SAMPLE.indexOf('example text');
const SEL_END = SEL_START + 'example text'.length;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let editor: Editor | null = null;

function mountEditor() {
  host = document.createElement('div');
  host.style.width = '620px';
  host.style.height = '520px';
  document.body.appendChild(host);
  root = createRoot(host);
  editor = null;
  act(() => {
    root!.render(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: SAMPLE,
        pageKey: 'fs-tb-page',
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

/** Select plain-text offsets within the first paragraph (TipTap positions). */
function selectPlainRange(ed: Editor, start: number, end: number) {
  act(() => {
    ed.chain()
      .focus()
      .setTextSelection({ from: 1 + start, to: 1 + end })
      .run();
  });
}

function fireFmt(testId: string) {
  const btn = document.querySelector(`[data-nb-candidate-fmt="${testId}"]`);
  if (!(btn instanceof HTMLElement)) throw new Error(`toolbar control missing: ${testId}`);
  act(() => {
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document
    .querySelectorAll(
      '[data-nb-candidate-selection-toolbar], [data-nb-format-toolbar="1"], [data-nb-toolbar-backdrop="1"]',
    )
    .forEach(el => el.remove());
  root = null;
  host = null;
  editor = null;
});

describe('font-size canonical mapping', () => {
  it('default toolbar size matches DEFAULT_NOTEBOOK_FONT_SIZE (18)', () => {
    expect(DEFAULT_NOTEBOOK_FONT_SIZE).toBe(18);
    const fs = fontSizeAtSelection([], 0, 5);
    expect(fs).toEqual({ value: '18', mixed: false });
  });

  it('maps every FONT_SIZE_OPTIONS value as stored string → CSS px', () => {
    for (const px of FONT_SIZE_OPTIONS) {
      const marks = applyMarkToggle([], 0, 7, 'fs', String(px));
      expect(isMarkActiveOnRange(marks, 0, 7, 'fs', String(px))).toBe(true);
      expect(fontSizeAtSelection(marks, 0, 7)).toEqual({ value: String(px), mixed: false });
    }
  });

  it('mixed sizes report mixed, not a false exact size', () => {
    const mixed = [
      { s: 0, e: 3, t: 'fs' as const, v: '14' },
      { s: 3, e: 6, t: 'fs' as const, v: '20' },
    ];
    expect(fontSizeAtSelection(mixed, 0, 6).mixed).toBe(true);
  });

  it('TipTap candidate font-size presets remain product-supported', () => {
    expect(CANDIDATE_FONT_SIZE_PRESETS).toContain(20);
    expect(CANDIDATE_FONT_SIZE_PRESETS).toContain(DEFAULT_NOTEBOOK_FONT_SIZE);
  });
});

describe('Free Space TipTap toolbar selection session', () => {
  it('A/B: select phrase → TipTap toolbar opens → live editor present', async () => {
    mountEditor();
    const ed = await waitEditor();
    selectPlainRange(ed, SEL_START, SEL_END);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy();
    });
    expect(ed.state.selection.from).toBe(1 + SEL_START);
    expect(ed.state.selection.to).toBe(1 + SEL_END);
    expect(document.querySelector('[data-nb-tiptap-candidate="1"]')).toBeTruthy();
  });

  it('Bold then Italic keep exact logical selection range', async () => {
    mountEditor();
    const ed = await waitEditor();
    selectPlainRange(ed, SEL_START, SEL_END);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-fmt="bold"]')).toBeTruthy();
    });
    const from = ed.state.selection.from;
    const to = ed.state.selection.to;
    fireFmt('bold');
    expect(ed.state.selection.from).toBe(from);
    expect(ed.state.selection.to).toBe(to);
    expect(ed.isActive('bold')).toBe(true);
    expect(ed.state.doc.textBetween(from, to)).toBe('example text');

    fireFmt('italic');
    expect(ed.state.selection.from).toBe(from);
    expect(ed.state.selection.to).toBe(to);
    expect(ed.isActive('italic')).toBe(true);
    expect(to - from).toBe('example text'.length);
    const body = tiptapDocToBody(ed.getJSON(), 1);
    expect(body).toContain('example text');
    expect(body).toContain('"t":"b"');
    expect(body).toContain('"t":"i"');
  });

  it('font size change keeps exact range and stores px in canonical body', async () => {
    mountEditor();
    const ed = await waitEditor();
    selectPlainRange(ed, SEL_START, SEL_END);
    const from = ed.state.selection.from;
    const to = ed.state.selection.to;
    expect(runCandidateFormatCommand(ed, { type: 'setFontSize', px: 20 })).toBe(true);
    expect(ed.state.selection.from).toBe(from);
    expect(ed.state.selection.to).toBe(to);
    const body = tiptapDocToBody(ed.getJSON(), 1);
    expect(body).toMatch(/"t":"fs"/);
    expect(body).toMatch(/"v":"20"/);
  });

  it('H: callout / block convert control is wired on selection toolbar', async () => {
    mountEditor();
    const ed = await waitEditor();
    selectPlainRange(ed, SEL_START, SEL_END);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy();
    });
    // TipTap product: Turn into / block convert replaces legacy CE "callout" morph button.
    expect(document.querySelector('[data-nb-candidate-block-convert="1"]')).toBeTruthy();
  });

  it('text color and highlight controls are distinct', async () => {
    mountEditor();
    const ed = await waitEditor();
    selectPlainRange(ed, SEL_START, SEL_END);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-nb-candidate-fmt="color"]')).toBeTruthy();
    expect(document.querySelector('[data-nb-candidate-fmt="highlight"]')).toBeTruthy();
    expect(document.querySelector('[title^="Text color"]')).toBeTruthy();
    expect(document.querySelector('[title^="Highlight"]')).toBeTruthy();
  });
});

describe('Free Space embedded surface uses TipTap toolbar contract', () => {
  it('surface mounts TipTap candidate (not legacy CE toolbar DOM)', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const content = {
      type: 'notebook' as const,
      body: SAMPLE,
      notebookMode: 'normal' as const,
    };
    const object: ProjectSpaceObject = {
      id: 'fs-tb-1',
      type: 'notebook',
      title: 'Toolbar QA',
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    act(() => {
      root!.render(
        createElement(FreeSpaceNotebookSurface, {
          content,
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
    expect(document.querySelector('[data-nb-format-toolbar="1"]')).toBeNull();
  });
});
