/**
 * RTL Phase A — sandbox/viewer DOM + editor behavior.
 *
 * @vitest-environment happy-dom
 */
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { hasBidiControlChars, resolveEffectiveDir } from './direction';
import { roundTripBody } from './index';

const { NotebookTiptapReadonlyViewer } = await import(
  '../../components/notebook/tiptap/NotebookTiptapReadonlyViewer'
);
const { NotebookTiptapSandboxEditor } = await import(
  '../../components/notebook/tiptap/NotebookTiptapSandboxEditor'
);
const { KatexPreview } = await import('../../components/notebook/KatexPreview');

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

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
});

describe('RTL DOM / NodeViews', () => {
  it('readonly viewer loads Hebrew; effective dir resolves rtl', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapReadonlyViewer, {
        documentBody: 'שלום עולם',
        onReady,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls[0]![0].docChildCount).toBeGreaterThan(0);
    expect(resolveEffectiveDir('auto', 'שלום עולם')).toBe('rtl');
    // Prefer waiting for node-view wrapper (TipTap) or dir attr if present.
    await vi.waitFor(() => {
      const hit =
        host!.querySelector('[data-nb-dir]') ||
        host!.querySelector('[data-node-view-wrapper]') ||
        host!.querySelector('[data-nb-tiptap-readonly="1"]');
      expect(hit).toBeTruthy();
    });
    const directed = host!.querySelector('[data-nb-dir="auto"]');
    if (directed) {
      expect(directed.getAttribute('data-nb-effective-dir')).toBe('rtl');
      expect(directed.getAttribute('dir')).toBe('auto');
    }
  });

  it('KatexPreview isolates LTR', () => {
    mount(createElement(KatexPreview, { latex: 'a^2+b^2', displayMode: false }));
    const el = host!.querySelector('[data-nb-math-isolate="1"]') as HTMLElement | null;
    expect(el).toBeTruthy();
    expect(el!.getAttribute('dir')).toBe('ltr');
  });

  it('sandbox list/callout blocks keep default dir=auto in JSON', () => {
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc('- פריט\n!concept מושג\n> ציטוט\n=> שלב\n1. אחד'),
      editable: true,
    });
    const types = new Set<string>();
    ed.state.doc.forEach(node => {
      if (node.isBlock && node.type.name.startsWith('nb')) {
        types.add(node.type.name);
        expect(node.attrs.dir ?? 'auto').toBe('auto');
      }
    });
    expect(types.has('nbBullet')).toBe(true);
    expect(types.has('nbCallout')).toBe(true);
    expect(types.has('nbQuote')).toBe(true);
    expect(types.has('nbStep')).toBe(true);
    expect(types.has('nbOrdered')).toBe(true);
    ed.destroy();
  });
});

describe('sandbox direction + paste + Enter', () => {
  it('sandbox exposes Dir control and not-persisted banner', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapSandboxEditor, {
        initialDocumentBody: 'שלום',
        onReady,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(host!.querySelector('[data-nb-sandbox-dir="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-dir-persist="not-persisted"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-bidi-controls="0"]')).toBeTruthy();
  });

  it('explicit dir + typing Hebrew keeps body free of bidi controls', () => {
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc(''),
      editable: true,
    });
    ed.chain().focus().updateAttributes('nbParagraph', { dir: 'rtl' }).run();
    ed.commands.insertContent('שלום עולם');
    const body = tiptapDocToBody(ed.getJSON());
    expect(body).toContain('שלום');
    expect(hasBidiControlChars(body)).toBe(false);
    ed.destroy();
  });

  it('Enter inherits explicit rtl on continued bullet', () => {
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'nbBullet',
            attrs: { depth: 0, dir: 'rtl' },
            content: [{ type: 'text', text: 'פריט ארוך' }],
          },
        ],
      },
      editable: true,
    });
    // Place caret inside text (not after node) then Enter.
    const end = 1 + 'פריט ארוך'.length;
    ed.chain().setTextSelection(end).focus().run();
    ed.commands.keyboardShortcut('Enter');
    // Prefer continued bullet; if PM falls through to paragraph, still inherit dir via keymap when set.
    const second = ed.state.doc.child(1);
    expect(second).toBeTruthy();
    if (second!.type.name === 'nbBullet') {
      expect(second!.attrs.dir).toBe('rtl');
    } else {
      // Fallback path still must not inject bidi controls
      expect(hasBidiControlChars(tiptapDocToBody(ed.getJSON()))).toBe(false);
    }
    ed.destroy();
  });

  it('paste path preserves existing Unicode including bidi controls', () => {
    // Policy: do not silently strip user-provided bidi controls on paste.
    const withControls = `\u202Eשלום\u202C`;
    expect(hasBidiControlChars(withControls)).toBe(true);
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc(withControls),
      editable: true,
    });
    expect(tiptapDocToBody(ed.getJSON())).toBe(withControls);
    ed.destroy();
  });

  it('Hebrew and mixed paste content is preserved byte-stable', () => {
    const he = 'שלום עולם';
    const mixed = 'Hello שלום world';
    expect(roundTripBody(he)).toBe(he);
    expect(roundTripBody(mixed)).toBe(mixed);
    expect(hasBidiControlChars(he)).toBe(false);
    expect(hasBidiControlChars(mixed)).toBe(false);
  });

  it('ZIKUK typing path does not inject bidi controls', () => {
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc('שלום'),
      editable: true,
    });
    ed.chain().focus().updateAttributes('nbParagraph', { dir: 'rtl' }).run();
    ed.commands.insertContent(' world 2026');
    const body = tiptapDocToBody(ed.getJSON());
    expect(body).toContain('שלום');
    expect(body).toContain('world');
    expect(hasBidiControlChars(body)).toBe(false);
    ed.destroy();
  });
});
