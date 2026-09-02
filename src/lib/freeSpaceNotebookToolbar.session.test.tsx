/**
 * Free Space toolbar selection-session stability.
 *
 * @vitest-environment happy-dom
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../hooks/useAtmosphere';
import type { ProjectObjectContent, ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import {
  DEFAULT_NOTEBOOK_FONT_SIZE,
  FONT_SIZE_OPTIONS,
  fontSizeAtSelection,
  applyMarkToggle,
  isMarkActiveOnRange,
} from './notebookInlineMarks';
import { getSelectionOffsetsIn, setSelectionOffsetsIn } from './notebookCaret';

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

const SAMPLE = 'This is some example text for toolbar testing';
const SEL_START = SAMPLE.indexOf('example text');
const SEL_END = SEL_START + 'example text'.length;

const notebookContent: Extract<ProjectObjectContent, { type: 'notebook' }> = {
  type: 'notebook',
  body: SAMPLE,
  notebookMode: 'normal',
};

const object: ProjectSpaceObject = {
  id: 'fs-tb-1',
  type: 'notebook',
  title: 'Toolbar QA',
  content: notebookContent,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mountSurface() {
  host = document.createElement('div');
  host.style.width = '620px';
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

function editable(): HTMLElement {
  const el = document.querySelector('[data-rich-editable="1"]');
  if (!(el instanceof HTMLElement)) throw new Error('rich editable missing');
  return el;
}

function selectRange(start: number, end: number) {
  const el = editable();
  act(() => {
    el.focus();
    setSelectionOffsetsIn(el, start, end);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
}

function fireToolbar(testId: string) {
  const btn = document.querySelector(`[data-nb-toolbar-btn="${testId}"]`);
  if (!(btn instanceof HTMLElement)) throw new Error(`toolbar control missing: ${testId}`);
  act(() => {
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.querySelectorAll('[data-nb-format-toolbar="1"], [data-nb-toolbar-backdrop="1"]').forEach(el => el.remove());
  root = null;
  host = null;
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
});

describe('Free Space embedded toolbar selection session', () => {
  it('A/B: select phrase → toolbar opens → live editor present', () => {
    mountSurface();
    selectRange(SEL_START, SEL_END);
    expect(document.querySelector('[data-nb-format-toolbar="1"]')).toBeTruthy();
    const offsets = getSelectionOffsetsIn(editable());
    expect(offsets?.start).toBe(SEL_START);
    expect(offsets?.end).toBe(SEL_END);
  });

  it('Bold then Italic keep exact logical selection range', () => {
    mountSurface();
    selectRange(SEL_START, SEL_END);
    fireToolbar('bold');
    let offsets = getSelectionOffsetsIn(editable());
    expect(offsets?.start).toBe(SEL_START);
    expect(offsets?.end).toBe(SEL_END);
    expect(editable().textContent?.slice(SEL_START, SEL_END)).toBe('example text');

    fireToolbar('italic');
    offsets = getSelectionOffsetsIn(editable());
    expect(offsets?.start).toBe(SEL_START);
    expect(offsets?.end).toBe(SEL_END);
    expect(offsets!.end - offsets!.start).toBe('example text'.length);
  });

  it('font size change keeps exact range and stores px', () => {
    mountSurface();
    selectRange(SEL_START, SEL_END);
    const select = document.querySelector('[data-nb-toolbar-btn="font-size"]');
    expect(select).toBeTruthy();
    act(() => {
      (select as HTMLSelectElement).value = '20';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const offsets = getSelectionOffsetsIn(editable());
    expect(offsets?.start).toBe(SEL_START);
    expect(offsets?.end).toBe(SEL_END);
    const fsSpan = editable().querySelector('[data-fs="20"]');
    expect(fsSpan).toBeTruthy();
    expect((fsSpan as HTMLElement).style.fontSize).toBe('20px');
  });

  it('H: callout control is wired (not a dead Comment button)', () => {
    mountSurface();
    selectRange(SEL_START, SEL_END);
    expect(document.querySelector('[data-nb-toolbar-btn="callout"]')).toBeTruthy();
    expect(document.querySelector('[title="Callout"]')).toBeTruthy();
  });

  it('text color and highlight controls are distinct', () => {
    mountSurface();
    selectRange(SEL_START, SEL_END);
    expect(document.querySelector('[data-nb-toolbar-btn="text-color"]')).toBeTruthy();
    expect(document.querySelector('[data-nb-toolbar-btn="highlight"]')).toBeTruthy();
    expect(document.querySelector('[title="Text color"]')).toBeTruthy();
    expect(document.querySelector('[title="Highlight"]')).toBeTruthy();
  });
});
