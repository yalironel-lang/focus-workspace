/**
 * Free Space TipTap → host editing signal (spaceEditingId / onNotebookEditingChange).
 *
 * @vitest-environment happy-dom
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../hooks/useAtmosphere';
import type { ProjectObjectContent, ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';

vi.mock('../lib/notebookHandwritingCloud', () => ({
  hydrateHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
  reconcileHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

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

const SAMPLE = 'Host editing bridge sample text here';

function notebookContent(
  body: string,
): Extract<ProjectObjectContent, { type: 'notebook' }> {
  return { type: 'notebook', body, notebookMode: 'normal' };
}

const object: ProjectSpaceObject = {
  id: 'fs-host-edit-1',
  type: 'notebook',
  title: 'Host edit QA',
  content: notebookContent(SAMPLE),
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mountSurface(opts?: {
  onNotebookEditingChange?: (id: string, editing: boolean) => void;
  onChange?: (content: ProjectObjectContent) => void;
  content?: Extract<ProjectObjectContent, { type: 'notebook' }>;
}) {
  host = document.createElement('div');
  host.style.width = '620px';
  host.style.height = '520px';
  document.body.appendChild(host);
  root = createRoot(host);
  const content = opts?.content ?? notebookContent(SAMPLE);
  act(() => {
    root!.render(
      createElement(FreeSpaceNotebookSurface, {
        content,
        tokens,
        object: { ...object, content },
        onChange: opts?.onChange ?? vi.fn(),
        onNotebookEditingChange: opts?.onNotebookEditingChange,
      }),
    );
  });
}

async function flushFrame() {
  await act(async () => {
    await new Promise<void>(r => requestAnimationFrame(() => r()));
  });
}

async function focusTipTapEditor(): Promise<HTMLElement> {
  await vi.waitFor(() => expect(document.querySelector('.ProseMirror')).toBeTruthy());
  const pm = document.querySelector('.ProseMirror') as HTMLElement;
  await act(async () => {
    pm.focus();
    pm.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  });
  await flushFrame();
  return pm;
}

async function blurToOutside(): Promise<void> {
  const outside = document.createElement('button');
  outside.type = 'button';
  outside.textContent = 'outside';
  document.body.appendChild(outside);
  await act(async () => {
    outside.focus();
    outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  });
  await flushFrame();
  outside.remove();
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document
    .querySelectorAll('[data-host-edit-test-chrome], [data-nb-candidate-selection-toolbar]')
    .forEach(el => el.remove());
});

describe('Free Space TipTap host editing bridge', () => {
  it('A: mount alone does not report editing true', async () => {
    const onEditing = vi.fn<(id: string, editing: boolean) => void>();
    mountSurface({ onNotebookEditingChange: onEditing });
    await vi.waitFor(() => expect(document.querySelector('.ProseMirror')).toBeTruthy());
    expect(onEditing).toHaveBeenCalled();
    expect(onEditing.mock.calls.every(c => c[1] === false)).toBe(true);
    expect(onEditing).not.toHaveBeenCalledWith('fs-host-edit-1', true);
  });

  it('B: TipTap focus reports editing true', async () => {
    const onEditing = vi.fn<(id: string, editing: boolean) => void>();
    mountSurface({ onNotebookEditingChange: onEditing });
    await focusTipTapEditor();
    expect(onEditing).toHaveBeenCalledWith('fs-host-edit-1', true);
  });

  it('C: TipTap toolbar/chrome focus preserves editing session (no flicker to false)', async () => {
    const onEditing = vi.fn<(id: string, editing: boolean) => void>();
    mountSurface({ onNotebookEditingChange: onEditing });
    await focusTipTapEditor();
    expect(onEditing).toHaveBeenCalledWith('fs-host-edit-1', true);

    const chrome = document.createElement('button');
    chrome.type = 'button';
    chrome.setAttribute('data-host-edit-test-chrome', '1');
    chrome.setAttribute('data-nb-candidate-selection-toolbar', '1');
    chrome.setAttribute('data-nb-candidate-selection-toolbar-open', '1');
    chrome.className = 'nb-selection-toolbar';
    chrome.textContent = 'Bold';
    document.body.appendChild(chrome);

    await act(async () => {
      chrome.focus();
      chrome.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    await flushFrame();

    const afterTrueIdx = onEditing.mock.calls.findIndex(c => c[1] === true);
    expect(afterTrueIdx).toBeGreaterThanOrEqual(0);
    const afterFocus = onEditing.mock.calls.slice(afterTrueIdx);
    expect(afterFocus.some(c => c[1] === false)).toBe(false);
    expect(onEditing.mock.calls[onEditing.mock.calls.length - 1]).toEqual([
      'fs-host-edit-1',
      true,
    ]);
  });

  it('D: genuine outside blur reports editing false', async () => {
    const onEditing = vi.fn<(id: string, editing: boolean) => void>();
    mountSurface({ onNotebookEditingChange: onEditing });
    await focusTipTapEditor();
    expect(onEditing).toHaveBeenCalledWith('fs-host-edit-1', true);
    await blurToOutside();
    expect(onEditing).toHaveBeenCalledWith('fs-host-edit-1', false);
    expect(onEditing.mock.calls[onEditing.mock.calls.length - 1]).toEqual([
      'fs-host-edit-1',
      false,
    ]);
  });

  it('E: body hydrate remount does not phantom-report editing true', async () => {
    const onEditing = vi.fn<(id: string, editing: boolean) => void>();
    mountSurface({
      onNotebookEditingChange: onEditing,
      content: notebookContent('Page one body'),
    });
    await vi.waitFor(() => expect(document.querySelector('.ProseMirror')).toBeTruthy());
    expect(onEditing).not.toHaveBeenCalledWith('fs-host-edit-1', true);

    act(() => {
      root!.render(
        createElement(FreeSpaceNotebookSurface, {
          content: notebookContent('Page two hydrated body'),
          tokens,
          object: { ...object, content: notebookContent('Page two hydrated body') },
          onChange: vi.fn(),
          onNotebookEditingChange: onEditing,
        }),
      );
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.ProseMirror')?.textContent).toContain('Page two');
    });
    expect(onEditing.mock.calls.some(c => c[1] === true)).toBe(false);
  });

  it('F: TipTap remains the production editor (no legacy CE); persist bridge untouched', async () => {
    const onChange = vi.fn();
    mountSurface({ onChange });
    await focusTipTapEditor();
    expect(document.querySelector('[data-nb-tiptap-candidate="1"]')).toBeTruthy();
    expect(document.querySelector('[data-nb-editor-root="1"]')).toBeTruthy();
    expect(document.querySelector('[data-rich-editable="1"]')).toBeNull();
    expect(document.querySelector('[data-nb-card-preview]')).toBeNull();
  });
});
