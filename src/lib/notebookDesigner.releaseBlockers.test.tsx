/**
 * Final release blockers — presentation-aware default ink + sticky toolbar.
 *
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appearanceFromNotebookDesignPreset,
  type NotebookProductDesignPresetId,
} from './notebookAppearance';
import {
  notebookAppearanceStudyPageStyle,
  notebookAppearanceVisualTokensToCssVars,
  resolveNotebookAppearanceVisualTokens,
} from './notebookAppearanceVisualTokens';
import {
  defaultHandwritingInkColor,
  isAutomaticHandwritingInkColor,
  resolveHandwritingDisplayColor,
  strokeForDisplay,
  strokesForDisplay,
  STUDY_INK_COLOR,
  STUDY_INK_COLOR_ON_DARK,
} from './handwritingInk';
import type { HandwritingStroke } from './handwritingTypes';
import { nbProductToolbarShellStyle } from '../components/notebook/tiptap/notebookProductToolbarChrome';
import { NotebookTiptapCandidateEditor } from '../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { NB_INK } from './notebookTiptap/visualTokens';
import { encodeNotebookTextV1 } from './notebookTextCodec';
import { runCandidateFormatCommand } from './notebookTiptap/candidateFormatCommands';
import type { Editor } from '@tiptap/core';

function mount(ui: React.ReactElement): { host: HTMLDivElement; root: Root } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(ui);
  });
  return { host, root };
}

function luminanceOfCssColor(color: string): number {
  const c = color.trim().toLowerCase();
  let r = 0;
  let g = 0;
  let b = 0;
  if (c.startsWith('#')) {
    const h = c.slice(1);
    if (h.length === 3) {
      r = parseInt(h[0]! + h[0]!, 16);
      g = parseInt(h[1]! + h[1]!, 16);
      b = parseInt(h[2]! + h[2]!, 16);
    } else {
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    }
  } else {
    const m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    if (!m) return 0.5;
    r = Number(m[1]);
    g = Number(m[2]);
    b = Number(m[3]);
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function proseInkForPreset(id: NotebookProductDesignPresetId): string {
  const tokens = resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset(id));
  const vars = notebookAppearanceVisualTokensToCssVars(tokens) as Record<string, string>;
  return String(vars['--nb-prose-ink']);
}

const LIGHT_PRESETS: NotebookProductDesignPresetId[] = [
  'classic',
  'minimal',
  'academic',
  'blueprint',
];
const DARK_PRESETS: NotebookProductDesignPresetId[] = ['midnight', 'aurora'];

describe('Bug 1 — presentation-aware default prose ink', () => {
  it('1. default prose uses dark readable ink on light pages', () => {
    for (const id of LIGHT_PRESETS) {
      const tokens = resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset(id));
      expect(tokens.pageInk).toBe('dark');
      const ink = proseInkForPreset(id);
      expect(luminanceOfCssColor(ink)).toBeLessThan(0.45);
      const page = notebookAppearanceStudyPageStyle(tokens);
      expect(luminanceOfCssColor(String(page.color))).toBeLessThan(0.45);
    }
  });

  it('2. default prose uses light readable ink on dark pages', () => {
    for (const id of DARK_PRESETS) {
      const tokens = resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset(id));
      expect(tokens.pageInk).toBe('light');
      const ink = proseInkForPreset(id);
      expect(luminanceOfCssColor(ink)).toBeGreaterThan(0.55);
      const page = notebookAppearanceStudyPageStyle(tokens);
      expect(luminanceOfCssColor(String(page.color))).toBeGreaterThan(0.55);
    }
  });

  it('3+5. changing design does not write documentBody / create fg marks', async () => {
    const bodies: string[] = [];
    let editor: Editor | null = null;
    const body = encodeNotebookTextV1([{ kind: 'paragraph', text: 'Hello default ink' }]);
    const { host, root } = mount(
      createElement(
        'div',
        {
          'data-nb-page-ink': 'dark',
          style: notebookAppearanceVisualTokensToCssVars(
            resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset('academic')),
          ),
        },
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: body,
          sourceBodyCodecVersion: 1,
          pageKey: 'page-release-ink',
          objectId: 'obj-release-ink',
          handwritingPageInk: 'dark',
          onEditorReady: (ed: Editor | null) => {
            editor = ed;
          },
          onUserEdit: (payload: { body: string }) => {
            bodies.push(payload.body);
          },
        }),
      ),
    );

    await act(async () => {
      await new Promise(r => setTimeout(r, 40));
    });

    expect(editor).toBeTruthy();
    const before = editor!.getJSON();
    const hasFgBefore = JSON.stringify(before).includes('"color"');
    expect(hasFgBefore).toBe(false);

    // Simulate Academic → Midnight → Academic by flipping CSS vars only (no body write).
    act(() => {
      host.firstElementChild?.setAttribute('data-nb-page-ink', 'light');
      Object.assign(
        (host.firstElementChild as HTMLElement).style,
        notebookAppearanceVisualTokensToCssVars(
          resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset('midnight')),
        ),
      );
    });
    act(() => {
      host.firstElementChild?.setAttribute('data-nb-page-ink', 'dark');
      Object.assign(
        (host.firstElementChild as HTMLElement).style,
        notebookAppearanceVisualTokensToCssVars(
          resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset('academic')),
        ),
      );
    });

    const after = editor!.getJSON();
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(bodies).toHaveLength(0);
    expect(NB_INK.primary).toContain('--nb-prose-ink');

    act(() => {
      root.unmount();
      host.remove();
    });
  });

  it('4. explicit foreground-color mark remains explicit', async () => {
    let editor: Editor | null = null;
    const body = encodeNotebookTextV1([{ kind: 'paragraph', text: 'Colored' }]);
    const { host, root } = mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: body,
        sourceBodyCodecVersion: 1,
        pageKey: 'page-release-fg',
        objectId: 'obj-release-fg',
        onEditorReady: (ed: Editor | null) => {
          editor = ed;
        },
      }),
    );
    await act(async () => {
      await new Promise(r => setTimeout(r, 40));
    });
    expect(editor).toBeTruthy();
    act(() => {
      editor!.commands.selectAll();
      expect(runCandidateFormatCommand(editor!, { type: 'setTextColor', color: '#fca5a5' })).toBe(
        true,
      );
    });
    const json = JSON.stringify(editor!.getJSON());
    expect(json).toContain('#fca5a5');
    act(() => {
      root.unmount();
      host.remove();
    });
  });
});

describe('Bug 2 — presentation-aware handwriting ink (render-time only)', () => {
  it('documents model: strokes store literal color; no color picker → all pens automatic', () => {
    expect(isAutomaticHandwritingInkColor(STUDY_INK_COLOR)).toBe(true);
    expect(isAutomaticHandwritingInkColor('#f8fafc')).toBe(true);
    expect(isAutomaticHandwritingInkColor('#f5ede0')).toBe(true);
    // Saturated mid color is not treated as automatic theme ink
    expect(isAutomaticHandwritingInkColor('#e11d48')).toBe(false);
  });

  it('6. default/automatic handwriting remains readable on light page', () => {
    for (const stored of ['#f8fafc', '#f5ede0', STUDY_INK_COLOR_ON_DARK, STUDY_INK_COLOR]) {
      const display = resolveHandwritingDisplayColor(stored, 'dark');
      expect(luminanceOfCssColor(display)).toBeLessThan(0.35);
    }
  });

  it('7. default/automatic handwriting remains readable on dark page', () => {
    for (const stored of ['#f8fafc', STUDY_INK_COLOR, '#141416']) {
      const display = resolveHandwritingDisplayColor(stored, 'light');
      expect(luminanceOfCssColor(display)).toBeGreaterThan(0.55);
    }
  });

  it('8. switching appearance does not mutate stroke geometry/data', () => {
    const stroke: HandwritingStroke = {
      id: 'st-1',
      tool: 'pen',
      color: '#f8fafc',
      width: 2.5,
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.3, y: 0.4 },
      ],
    };
    const original = structuredClone(stroke);
    const onLight = strokeForDisplay(stroke, 'dark');
    const onDark = strokeForDisplay(stroke, 'light');
    expect(stroke).toEqual(original);
    expect(onLight.color).toBe(STUDY_INK_COLOR);
    expect(onDark.color).toBe(STUDY_INK_COLOR_ON_DARK);
    expect(onLight.points).toEqual(original.points);
    expect(onLight.id).toBe(original.id);
    expect(strokesForDisplay([stroke], 'dark')[0]!.points).toEqual(original.points);
  });

  it('9. explicitly chosen saturated stroke color is preserved', () => {
    expect(resolveHandwritingDisplayColor('#e11d48', 'dark')).toBe('#e11d48');
    expect(resolveHandwritingDisplayColor('#e11d48', 'light')).toBe('#e11d48');
  });

  it('10. historical handwriting remains safely renderable', () => {
    const historical = ['#f5ede0', '#e8e2f0', 'rgba(255,248,235,0.92)', '#141416', '#fff'];
    for (const c of historical) {
      expect(resolveHandwritingDisplayColor(c, 'dark')).toBeTruthy();
      expect(resolveHandwritingDisplayColor(c, 'light')).toBeTruthy();
      expect(defaultHandwritingInkColor('dark')).toBe(STUDY_INK_COLOR);
      expect(defaultHandwritingInkColor('light')).toBe(STUDY_INK_COLOR_ON_DARK);
    }
  });
});

describe('Bug 3 — sticky product toolbar in Notebook scroll viewport', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('11. toolbar uses sticky behavior (not fixed to browser)', () => {
    const style = nbProductToolbarShellStyle();
    expect(style.position).toBe('sticky');
    expect(style.top).toBe(0);
    expect(style.position).not.toBe('fixed');
    expect(Number(style.zIndex)).toBeGreaterThanOrEqual(30);
  });

  it('12+13+14+15. sticky toolbar stays in same editor; no writes; Designer/floating intact', async () => {
    const writes: string[] = [];
    let editor: Editor | null = null;
    const body = encodeNotebookTextV1([
      { kind: 'paragraph', text: 'Line 1' },
      { kind: 'paragraph', text: 'Line 2' },
      { kind: 'paragraph', text: 'Line 3' },
    ]);

    const { host, root } = mount(
      createElement(
        'div',
        {
          'data-nb-body-scroll': '1',
          style: { overflowY: 'auto', height: 240, position: 'relative' },
        },
        createElement(
          'div',
          {
            'data-nb-study-page': '1',
            style: { overflow: 'visible', ...notebookAppearanceStudyPageStyle(
              resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset('classic')),
            ) },
          },
          createElement(NotebookTiptapCandidateEditor, {
            sourceDocumentBody: body,
            sourceBodyCodecVersion: 1,
            pageKey: 'page-sticky',
            objectId: 'obj-sticky',
            onEditorReady: (ed: Editor | null) => {
              editor = ed;
            },
            onUserEdit: (payload: { body: string }) => {
              writes.push(payload.body);
            },
            onCustomizeNotebook: vi.fn(),
          }),
        ),
      ),
    );

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    const toolbar = host.querySelector('[data-nb-product-toolbar-sticky="1"]') as HTMLElement | null;
    expect(toolbar).toBeTruthy();
    expect(toolbar!.style.position).toBe('sticky');
    expect(editor).toBeTruthy();
    const edRef = editor;

    // Scroll the Notebook viewport — editor instance must remain the same.
    const scroll = host.querySelector('[data-nb-body-scroll]') as HTMLElement;
    scroll.scrollTop = 120;
    expect(editor).toBe(edRef);
    expect(writes).toHaveLength(0);

    // Floating selection toolbar module still exported / mountable path intact.
    const floating = await import('../components/notebook/tiptap/NotebookTiptapCandidateSelectionToolbar');
    expect(typeof floating.NotebookTiptapCandidateSelectionToolbar).toBe('function');

    // Study page must not clip sticky (Designer open uses same study page overflow).
    expect(notebookAppearanceStudyPageStyle(
      resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset('classic')),
    ).overflow).toBe('visible');

    act(() => {
      root.unmount();
      host.remove();
    });
  });
});
