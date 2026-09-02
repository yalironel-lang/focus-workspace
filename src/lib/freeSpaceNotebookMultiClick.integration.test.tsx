/**
 * Free Space multi-click selection session integration.
 *
 * @vitest-environment happy-dom
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../hooks/useAtmosphere';
import type { ProjectObjectContent, ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import { getSelectionOffsetsIn } from './notebookCaret';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('./notebookHandwritingCloud', () => ({
  hydrateHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
  reconcileHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
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

const LONG =
  'This is a very long paragraph that visually wraps onto three screen lines.';
const BODY = `${LONG}\nSecond block here`;

const notebookContent: Extract<ProjectObjectContent, { type: 'notebook' }> = {
  type: 'notebook',
  body: BODY,
  notebookMode: 'normal',
};

const object: ProjectSpaceObject = {
  id: 'fs-mc-1',
  type: 'notebook',
  title: 'Multi-click QA',
  content: notebookContent,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mountSurface() {
  host = document.createElement('div');
  host.style.width = '320px';
  host.style.height = '520px';
  document.body.appendChild(host);
  root = createRoot(host);
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
}

function firstEditable(): HTMLElement {
  const el = document.querySelector('[data-rich-editable="1"]');
  if (!(el instanceof HTMLElement)) throw new Error('missing editable');
  return el;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.querySelectorAll('[data-nb-format-toolbar="1"], [data-nb-toolbar-backdrop="1"]').forEach(el => el.remove());
  root = null;
  host = null;
});

describe('Free Space multi-click selection', () => {
  it('A: single click (detail 1) does not open toolbar by itself', () => {
    mountSurface();
    const el = firstEditable();
    act(() => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail: 1 }));
    });
    expect(document.querySelector('[data-nb-format-toolbar="1"]')).toBeNull();
  });

  it('C/D/I: triple click selects whole logical block and opens toolbar', () => {
    mountSurface();
    const el = firstEditable();
    act(() => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 3 }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail: 3 }));
    });
    const offsets = getSelectionOffsetsIn(el);
    expect(offsets?.start).toBe(0);
    expect(offsets?.end).toBe(LONG.length);
    expect(document.querySelector('[data-nb-format-toolbar="1"]')).toBeTruthy();
  });

  it('E: quadruple click opens document-scoped toolbar (morph hidden)', () => {
    mountSurface();
    const el = firstEditable();
    act(() => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 4 }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail: 4 }));
    });
    expect(document.querySelector('[data-nb-format-toolbar="1"]')).toBeTruthy();
    expect(document.querySelector('[data-nb-toolbar-btn="h1"]')).toBeNull();
    expect(document.querySelector('[data-nb-toolbar-btn="duplicate"]')).toBeNull();
    expect(document.querySelector('[data-nb-toolbar-btn="copy"]')).toBeTruthy();
    expect(document.querySelector('[data-nb-toolbar-btn="bold"]')).toBeTruthy();
  });

  it('J: manual range after multi-click replaces session to single-block morph tools', () => {
    mountSurface();
    const el = firstEditable();
    act(() => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 4 }));
    });
    expect(document.querySelector('[data-nb-toolbar-btn="h1"]')).toBeNull();

    act(() => {
      el.focus();
      const range = document.createRange();
      const text = el.firstChild ?? el;
      range.setStart(text, 0);
      range.setEnd(text, 4);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail: 1 }));
    });
    expect(document.querySelector('[data-nb-toolbar-btn="h1"]')).toBeTruthy();
  });
});
