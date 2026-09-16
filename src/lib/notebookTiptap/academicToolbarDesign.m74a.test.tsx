/**
 * M7.4A design pass — sticky toolbar + portal menu anchoring + IA.
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { PRODUCT_ACADEMIC_TONES } from './candidateBlockCommands';
import { calloutLabel } from './visualTokens';
import { ACADEMIC_PRODUCT_QA_BODY } from './academicProductQaFixture';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { Editor as TiptapEditor } from '@tiptap/core';

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

function openMenu() {
  const trigger = host!.querySelector('[data-nb-product-block="1"]') as HTMLButtonElement;
  act(() => {
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    trigger.click();
  });
  return document.querySelector('[data-nb-product-block-menu="1"]') as HTMLElement;
}

describe('M7.4A sticky product toolbar contract', () => {
  it('1–2. main Notebook toolbar is sticky (scroll-container contract)', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Hello',
        pageKey: 'page-1',
        onReady,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    const toolbar = host!.querySelector('[data-nb-product-toolbar="1"]') as HTMLElement;
    expect(toolbar).toBeTruthy();
    expect(toolbar.getAttribute('data-nb-product-toolbar-sticky')).toBe('1');
    expect(toolbar.style.position).toBe('sticky');
    expect(toolbar.style.top).toBe('0px');
    // Separate from floating selection toolbar surface.
    expect(host!.querySelector('[data-nb-candidate-selection-toolbar]')).toBeNull();
  });
});

describe('M7.4A portal menu IA + scroll re-anchor', () => {
  it('4–8. menu grouping: Text / Insert / Academic; product options reachable', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Hello',
        pageKey: 'page-1',
        onReady,
        onInsertImageFile: vi.fn(),
        onInsertHandwriting: vi.fn(),
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    const menu = openMenu();
    expect(menu.querySelector('[data-nb-product-menu-section="text"]')?.textContent).toMatch(/^Text$/);
    expect(menu.querySelector('[data-nb-product-menu-section="insert"]')?.textContent).toMatch(
      /^Insert$/,
    );
    expect(menu.querySelector('[data-nb-product-menu-section="academic"]')?.textContent).toMatch(
      /^Academic$/,
    );

    const labels = Array.from(menu.querySelectorAll('[data-nb-product-menu-item-label="1"]')).map(
      el => (el.textContent ?? '').trim(),
    );
    expect(labels.indexOf('Image')).toBe(labels.indexOf('Step') + 1);
    expect(labels.indexOf('Handwriting')).toBe(labels.indexOf('Image') + 1);
    expect(labels).toContain('Math Block');
    for (const tone of PRODUCT_ACADEMIC_TONES) {
      expect(labels).toContain(calloutLabel(tone));
    }
    expect(labels).toContain('Common Mistake');
    // Academic rows carry UI-only hints (not persisted content).
    expect(menu.querySelectorAll('[data-nb-product-menu-item-hint="1"]').length).toBe(
      PRODUCT_ACADEMIC_TONES.length,
    );
    expect(menu.querySelectorAll('[data-nb-product-academic-marker]').length).toBe(
      PRODUCT_ACADEMIC_TONES.length,
    );
  });

  it('trigger product label is Add (convert + insert surface)', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Hello',
        pageKey: 'page-1',
        onReady,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    const trigger = host!.querySelector('[data-nb-product-block="1"]') as HTMLButtonElement;
    expect(trigger.getAttribute('data-nb-product-add')).toBe('1');
    expect(trigger.querySelector('[data-nb-product-add-label="1"]')?.textContent).toBe('Add');
    expect(host!.querySelector('[data-nb-product-toolbar-polish="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-toolbar-group="history"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-undo="1"]')?.getAttribute('aria-label')).toBe(
      'Undo',
    );
    expect(host!.querySelector('[data-nb-product-redo="1"]')?.getAttribute('aria-label')).toBe(
      'Redo',
    );
  });

  it('3. portal menu anchors to current trigger rect after simulated scroll/move', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Hello',
        pageKey: 'page-1',
        onReady,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    const trigger = host!.querySelector('[data-nb-product-block="1"]') as HTMLButtonElement;

    const original = trigger.getBoundingClientRect.bind(trigger);
    let offsetY = 0;
    vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(() => {
      const r = original();
      return new DOMRect(r.x, r.y + offsetY, r.width || 120, r.height || 28);
    });

    openMenu();
    const menu1 = document.querySelector('[data-nb-product-block-menu="1"]') as HTMLElement;
    const top1 = parseFloat(menu1.style.top || '0');

    offsetY = 240;
    act(() => {
      window.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    const menu2 = document.querySelector('[data-nb-product-block-menu="1"]') as HTMLElement;
    const top2 = parseFloat(menu2.style.top || '0');
    expect(top2).toBeGreaterThan(top1 + 100);
  });

  it('9–10. outside click and Escape close menu', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Hello',
        pageKey: 'page-1',
        onReady,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    openMenu();
    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeTruthy();
    act(() => {
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeNull();

    openMenu();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeNull();
  });
});

describe('M7.4A academic chrome + taxonomy stability', () => {
  it('11–12. academic chrome not editable; canonical IDs unchanged', async () => {
    const onReady = vi.fn();
    let editor: Editor | null = null;
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: '!definition Term meaning',
        pageKey: 'page-1',
        onReady,
        onEditorReady: ed => {
          editor = ed;
        },
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb-academic-chrome="1"]')).toBeTruthy(),
    );
    const chrome = host!.querySelector('[data-nb-academic-chrome="1"]') as HTMLElement;
    expect(chrome.isContentEditable).toBe(false);
    expect(chrome.getAttribute('contenteditable')).toBe('false');
    expect(host!.querySelector('[data-nb-academic-type="definition"]')).toBeTruthy();
    expect(tiptapDocToBody(editor!.getJSON()).startsWith('!definition ')).toBe(true);
    expect(chrome.textContent).toBe('Definition');
    expect(chrome.textContent).not.toMatch(/DEFINITION/);
  });

  it('22. floating selection toolbar remains a separate surface', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Select me',
        pageKey: 'page-1',
        onReady,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(host!.querySelector('[data-nb-product-toolbar="1"]')).toBeTruthy();
    // Product toolbar must not contain floating selection toolbar markers.
    expect(
      host!.querySelector('[data-nb-product-toolbar="1"] [data-nb-candidate-selection-toolbar]'),
    ).toBeNull();
  });

  it('QA fixture stacks all academic types without TipTap JSON', () => {
    expect(ACADEMIC_PRODUCT_QA_BODY).toContain('!definition ');
    expect(ACADEMIC_PRODUCT_QA_BODY).toContain('!mistake ');
    expect(ACADEMIC_PRODUCT_QA_BODY).toContain('האינפלציה');
    const ed = new TiptapEditor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc(ACADEMIC_PRODUCT_QA_BODY),
    });
    const tones = new Set<string>();
    ed.state.doc.forEach(node => {
      if (node.type.name === 'nbCallout') tones.add(String(node.attrs.tone));
    });
    for (const tone of PRODUCT_ACADEMIC_TONES) expect(tones.has(tone)).toBe(true);
    const out = tiptapDocToBody(ed.getJSON());
    expect(out).not.toMatch(/"type"\s*:\s*"doc"/);
    ed.destroy();
  });
});
