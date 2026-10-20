/**
 * M4e — Notebook toolbar fits the pane instead of clipping.
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NotebookResponsiveToolbar, type NotebookToolbarItem } from '../components/notebook/NotebookResponsiveToolbar';
import { fitNotebookToolbar, toolbarInlineWidth } from './notebookToolbarOverflow';
import { WORKSPACE_PANE_MIN_PX } from './studySession/academicWorkspaceLayout';

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
  document.querySelector('[data-nb-toolbar-overflow-menu="1"]')?.remove();
});

const NOTEBOOK_MIN = WORKSPACE_PANE_MIN_PX.notebook;
/** Product toolbar padding is inside the pane, so the content box is narrower. */
const EDITING_CONTENT_BOX = NOTEBOOK_MIN - 8;

const editingItems: NotebookToolbarItem[] = [
  {
    id: 'history',
    priority: 'primary',
    label: 'History',
    fallbackWidth: 70,
    inline: <button type="button" data-nb-product-undo="1">Undo</button>,
  },
  {
    id: 'add',
    priority: 'primary',
    label: 'Add',
    fallbackWidth: 100,
    inline: <button type="button">Add</button>,
  },
  {
    id: 'direction',
    priority: 'secondary',
    label: 'Text direction',
    fallbackWidth: 90,
    inline: <select aria-label="Text direction" data-nb-product-dir="1" defaultValue="auto"><option value="auto">Auto</option></select>,
  },
  {
    id: 'more',
    priority: 'secondary',
    label: 'Notebook actions',
    fallbackWidth: 40,
    inline: <button type="button" data-nb-product-more="1">More</button>,
  },
];

const editingWidths = {
  history: 70,
  add: 100,
  direction: 90,
  more: 40,
};

describe('notebook toolbar fit', () => {
  it('keeps every control inline when the notebook is wide', () => {
    const fit = fitNotebookToolbar({
      containerWidth: 640,
      items: editingItems.map(item => ({
        id: item.id,
        priority: item.priority,
        width: editingWidths[item.id as keyof typeof editingWidths],
      })),
      gap: 15,
      overflowWidth: 44,
    });
    expect(fit.overflowIds).toEqual([]);
    expect(fit.inlineIds).toEqual(['history', 'add', 'direction', 'more']);
    mount(
      createElement(NotebookResponsiveToolbar, {
        ariaLabel: 'Notebook editing',
        items: editingItems,
        gap: 15,
        containerWidth: 640,
        itemWidths: editingWidths,
        overflowVariant: 'icon',
      }),
    );
    expect(host!.querySelector('[data-testid="notebook-toolbar-overflow"]')).toBeNull();
    expect(host!.querySelector('[data-nb-product-undo="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-dir="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-more="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-testid="notebook-responsive-toolbar"]')?.getAttribute('data-toolbar-overflow')).toBe('0');
  });

  it('moves secondary controls into the overflow menu at the minimum notebook width', () => {
    const items = editingItems.map(item => ({
      id: item.id,
      priority: item.priority,
      width: editingWidths[item.id as keyof typeof editingWidths],
    }));
    const fit = fitNotebookToolbar({
      containerWidth: EDITING_CONTENT_BOX,
      items,
      gap: 15,
      overflowWidth: 44,
    });
    expect(fit.inlineIds).toContain('history');
    expect(fit.inlineIds).toContain('add');
    expect(fit.overflowIds.length).toBeGreaterThan(0);
    expect(
      toolbarInlineWidth({
        items,
        inlineIds: fit.inlineIds,
        overflowIds: fit.overflowIds,
        gap: 15,
        overflowWidth: 44,
      }),
    ).toBeLessThanOrEqual(EDITING_CONTENT_BOX);

    mount(
      createElement(NotebookResponsiveToolbar, {
        ariaLabel: 'Notebook editing',
        items: editingItems,
        gap: 15,
        containerWidth: EDITING_CONTENT_BOX,
        itemWidths: editingWidths,
        overflowVariant: 'icon',
      }),
    );
    const bar = host!.querySelector('[data-testid="notebook-responsive-toolbar"]') as HTMLElement;
    expect(bar.getAttribute('data-toolbar-overflow')).toBe('1');
    expect(bar.querySelector('[data-nb-product-undo="1"]')).toBeTruthy();
    expect(bar.querySelector('[data-toolbar-placement="inline"][data-toolbar-item="direction"]')).toBeNull();
    const overflow = host!.querySelector('[data-testid="notebook-toolbar-overflow"]') as HTMLButtonElement;
    expect(overflow.getAttribute('aria-label')).toBe('More toolbar actions');
    expect(overflow.getAttribute('aria-haspopup')).toBe('menu');
    act(() => {
      overflow.click();
    });
    const menu = document.querySelector('[data-testid="notebook-toolbar-overflow-menu"]') as HTMLElement;
    expect(menu).toBeTruthy();
    expect(menu.querySelector('[data-nb-product-dir="1"]')).toBeTruthy();
    expect(menu.getAttribute('role')).toBe('menu');
  });

  it('opens the overflow menu from the keyboard and returns focus on Escape', () => {
    mount(
      createElement(NotebookResponsiveToolbar, {
        ariaLabel: 'Notebook editing',
        items: editingItems,
        gap: 15,
        containerWidth: EDITING_CONTENT_BOX,
        itemWidths: editingWidths,
        overflowVariant: 'icon',
      }),
    );
    const overflow = host!.querySelector('[data-testid="notebook-toolbar-overflow"]') as HTMLButtonElement;
    act(() => {
      overflow.focus();
      overflow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    act(() => {
      // requestAnimationFrame from the menu focus effect
    });
    return new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        const menu = document.querySelector('[data-testid="notebook-toolbar-overflow-menu"]') as HTMLElement;
        expect(menu).toBeTruthy();
        const first = menu.querySelector('button, select') as HTMLElement;
        expect(document.activeElement).toBe(first);
        act(() => {
          menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(document.querySelector('[data-testid="notebook-toolbar-overflow-menu"]')).toBeNull();
        expect(document.activeElement).toBe(overflow);
        resolve();
      });
    });
  });

  it('does not move editor focus when the overflow control is pressed', () => {
    const editor = document.createElement('div');
    editor.tabIndex = 0;
    document.body.appendChild(editor);
    editor.focus();
    const onCopy = vi.fn();
    mount(
      createElement(NotebookResponsiveToolbar, {
        ariaLabel: 'Notebook actions',
        containerWidth: 160,
        itemWidths: { preview: 68, copy: 120 },
        items: [
          {
            id: 'preview',
            priority: 'primary',
            label: 'Preview',
            fallbackWidth: 68,
            inline: <button type="button">Preview</button>,
          },
          {
            id: 'copy',
            priority: 'secondary',
            label: 'Copy',
            fallbackWidth: 120,
            inline: <button type="button" onClick={onCopy}>Copy</button>,
          },
        ],
      }),
    );
    const overflow = host!.querySelector('[data-testid="notebook-toolbar-overflow"]') as HTMLButtonElement;
    act(() => {
      overflow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      overflow.click();
    });
    expect(document.activeElement).toBe(editor);
    const copy = document.querySelector('[data-testid="notebook-toolbar-overflow-menu"] button') as HTMLButtonElement;
    expect(copy.textContent).toBe('Copy');
    act(() => {
      copy.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      copy.click();
    });
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(editor);
    editor.remove();
  });
});
