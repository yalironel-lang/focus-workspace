/**
 * Regression: Block / Academic… product menu shows Image + Handwriting on real click.
 * Media inserts must appear immediately after Step (not buried under academic / clipped).
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { Editor } from '@tiptap/core';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { insertNbHandwritingAtSelection } from './candidateHandwritingInsert';
import { tiptapDocToBody } from './tiptapDocToBody';
import { newHandwritingKey } from '../handwritingTypes';
import { NOTEBOOK_IMAGE_FILE_ACCEPT } from './candidateImageInsert';

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

function openProductBlockMenu() {
  const trigger = host!.querySelector('[data-nb-product-block="1"]') as HTMLButtonElement;
  act(() => {
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    trigger.click();
  });
  // Menu is portaled to document.body (not clipped by notebook overflow).
  return document.querySelector('[data-nb-product-block-menu="1"]') as HTMLElement;
}

describe('M7.3A product Block / Academic menu — Image + Handwriting visible', () => {
  it('opens → Image + Handwriting visible after Step → Handwriting inserts → Image launches picker', async () => {
    let editor: Editor | null = null;
    const onReady = vi.fn();
    const onInsertHandwriting = vi.fn(
      (ctx: { insertTarget: { kind: string; pos?: number } }) => {
        if (!editor || editor.isDestroyed) return;
        const key = newHandwritingKey();
        insertNbHandwritingAtSelection(
          editor,
          key,
          ctx.insertTarget as Parameters<typeof insertNbHandwritingAtSelection>[2],
        );
      },
    );
    const onInsertImageFile = vi.fn();

    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody:
          '~nb1:["paragraph","Paragraph A",[],null]\n~nb1:["paragraph","Paragraph B",[],null]',
        sourceBodyCodecVersion: 1,
        pageKey: 'page-1',
        objectId: 'obj-menu-media',
        onReady,
        onEditorReady: ed => {
          editor = ed;
        },
        onInsertHandwriting,
        onInsertImageFile,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await vi.waitFor(() => expect(editor).toBeTruthy());

    const endA = editor!.state.doc.child(0).nodeSize - 1;
    act(() => {
      editor!.commands.setTextSelection(endA);
    });

    const trigger = host!.querySelector('[data-nb-product-block="1"]') as HTMLButtonElement;
    expect(trigger.textContent).toBe('Block / Academic…');
    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeNull();

    const menu = openProductBlockMenu();
    expect(menu).toBeTruthy();
    // Portaled to document.body — not trapped in notebook overflow.
    expect(menu.parentElement).toBe(document.body);

    const labels = Array.from(menu.querySelectorAll('[role="menuitem"]')).map(
      el => (el.textContent ?? '').trim(),
    );
    // Expected product order: … Step, Image, Handwriting, …
    const stepIdx = labels.indexOf('Step');
    const imageIdx = labels.indexOf('Image');
    const hwIdx = labels.indexOf('Handwriting');
    expect(stepIdx).toBeGreaterThanOrEqual(0);
    expect(imageIdx).toBe(stepIdx + 1);
    expect(hwIdx).toBe(stepIdx + 2);

    const imageBtn = menu.querySelector(
      '[data-nb-product-image-option="1"]',
    ) as HTMLButtonElement;
    const hwBtn = menu.querySelector(
      '[data-nb-product-handwriting-option="1"]',
    ) as HTMLButtonElement;
    expect(imageBtn).toBeTruthy();
    expect(hwBtn).toBeTruthy();
    expect(imageBtn.textContent).toBe('Image');
    expect(hwBtn.textContent).toBe('Handwriting');

    // Preserve prior basic options.
    expect(labels).toEqual(
      expect.arrayContaining([
        'Paragraph',
        'Title',
        'Section',
        'Bullet',
        'Numbered',
        'Task',
        'Quote',
        'Step',
        'Image',
        'Handwriting',
      ]),
    );

    // Handwriting click inserts object.
    act(() => {
      hwBtn.click();
    });
    expect(onInsertHandwriting).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeNull();
    expect(editor!.state.doc.child(1).type.name).toBe('nbHandwriting');
    const body = tiptapDocToBody(editor!.getJSON(), 1);
    expect(body).toMatch(/::hw::hw-/);
    expect(body).toContain('Paragraph A');
    expect(body).toContain('Paragraph B');

    // Re-open and pick Image → file picker click (not buried / missing).
    const menu2 = openProductBlockMenu();
    const imageBtn2 = menu2.querySelector(
      '[data-nb-product-image-option="1"]',
    ) as HTMLButtonElement;
    const input = host!.querySelector(
      '[data-nb-product-image-input="1"]',
    ) as HTMLInputElement;
    expect(input.accept).toBe(NOTEBOOK_IMAGE_FILE_ACCEPT);
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    act(() => {
      imageBtn2.click();
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(onInsertImageFile).not.toHaveBeenCalled(); // native picker not completed
    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeNull();
  });

  it('Image and Handwriting are always listed even without insert callbacks (visible product options)', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Hello',
        pageKey: 'page-1',
        onReady,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    const menu = openProductBlockMenu();
    expect(menu.querySelector('[data-nb-product-image-option="1"]')).toBeTruthy();
    expect(menu.querySelector('[data-nb-product-handwriting-option="1"]')).toBeTruthy();
  });

  it('click outside closes the Block / Academic menu', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Hello',
        pageKey: 'page-1',
        onReady,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    openProductBlockMenu();
    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeTruthy();
    act(() => {
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeNull();
  });
});
