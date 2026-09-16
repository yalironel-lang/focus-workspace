/** @vitest-environment happy-dom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { CANDIDATE_BLOCK_MENU } from './candidateBlockCommands';
import { placeCandidateBlockMenu } from './candidateBlockMenuPosition';
import { runCandidateFormatCommand, readCandidateFormatState } from './candidateFormatCommands';

let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove(); root = undefined; host = undefined;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function mount(body = 'שלום $x$ world') {
  let editor: Editor | null = null;
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(NotebookTiptapCandidateEditor, {
    sourceDocumentBody: body, pageKey: 'block-picker-qa', onEditorReady: next => { editor = next; },
  })));
  await vi.waitFor(() => expect(editor).toBeTruthy());
  act(() => { editor!.commands.setTextSelection({ from: 1, to: 5 }); });
  return editor! as Editor;
}
function gesture(element: Element) {
  act(() => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  });
}
function openMenu() {
  gesture(document.querySelector('[data-nb-candidate-fmt="blockMenu"]')!);
  return document.querySelector<HTMLElement>('[data-nb-candidate-block-menu]')!;
}

describe('candidate block picker UX', () => {
  it('replaces HLX with Clear highlight and removes only highlight', async () => {
    const ed = await mount();
    act(() => {
      runCandidateFormatCommand(ed, { type: 'toggleBold' });
      runCandidateFormatCommand(ed, { type: 'setTextColor', color: '#fca5a5' });
      runCandidateFormatCommand(ed, { type: 'setHighlight', color: '#fef08a' });
    });
    const button = document.querySelector('[data-nb-candidate-fmt="clearHighlight"]')!;
    expect(button.textContent).toBe('Clear highlight');
    expect(button.textContent).not.toMatch(/HL[✕X]/);
    gesture(button);
    expect(readCandidateFormatState(ed)).toMatchObject({ bold: true, color: '#fca5a5', highlight: undefined, from: 1, to: 5 });
  });

  it('shows both groups together with every existing option and selected state', async () => {
    await mount();
    const menu = openMenu();
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe('fixed');
    for (const group of ['Basic', 'Academic']) {
      const section = menu.querySelector(`[aria-label="${group} blocks"]`)!;
      expect(section).toBeTruthy();
      const expected = CANDIDATE_BLOCK_MENU.filter(item => item.group === group.toLowerCase());
      expect(section.querySelectorAll('button')).toHaveLength(expected.length);
      for (const item of expected) expect(section.textContent).toContain(item.label);
    }
    expect(Array.from(menu.querySelectorAll('[aria-label="Academic blocks"] button')).map(button => button.textContent)).toEqual(['Definition', 'Key Concept', 'Theorem', 'Example', 'Common Mistake', 'Summary', 'Review']);
    expect(menu.querySelector('[data-nb-candidate-block="paragraph"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(menu.querySelector('[data-nb-candidate-block="callout:definition"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  const nodes: Record<string, string> = { paragraph: 'nbParagraph', title: 'nbTitle', section: 'nbSection', bullet: 'nbBullet', ordered: 'nbOrdered', task: 'nbTask', quote: 'nbQuote', step: 'nbStep', math: 'nbMath' };
  it.each(CANDIDATE_BLOCK_MENU)('$label uses the existing command once and preserves selection/text', async item => {
    const ed = await mount(item.id === 'paragraph' ? '# שלום $x$ world' : 'שלום $x$ world');
    const storage = vi.fn(); const network = vi.fn(); const db = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: storage });
    vi.stubGlobal('indexedDB', { open: db }); vi.stubGlobal('fetch', network);
    let changes = 0;
    ed.on('transaction', ({ transaction }) => { if (transaction.docChanged) changes++; });
    const menu = openMenu();
    gesture(menu.querySelector(`[data-nb-candidate-block="${item.id}"]`)!);
    expect(changes).toBe(1);
    expect(ed.state.selection.from).toBe(1); expect(ed.state.selection.to).toBe(5);
    expect(ed.state.doc.textContent).toBe('שלום $x$ world');
    expect(ed.state.selection.$from.parent.type.name).toBe(item.group === 'academic' ? 'nbCallout' : nodes[item.id]);
    if (item.group === 'academic') expect(ed.state.selection.$from.parent.attrs.tone).toBe(item.id.slice(8));
    expect(document.querySelector('[data-nb-candidate-block-menu]')).toBeNull();
    expect(storage).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled(); expect(db).not.toHaveBeenCalled();
  });

  it('keyboard opening, Escape and outside pointer dismissal preserve selection', async () => {
    const ed = await mount();
    const trigger = document.querySelector<HTMLButtonElement>('[data-nb-candidate-fmt="blockMenu"]')!;
    act(() => { trigger.focus(); trigger.click(); });
    const menu = document.querySelector('[data-nb-candidate-block-menu]')!;
    expect(menu.contains(document.activeElement)).toBe(true);
    // Escape while Turn into is focused: product dismisses picker + floating toolbar
    // (window capture), not only the menu with focus returning to the trigger.
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    expect(document.querySelector('[data-nb-candidate-block-menu]')).toBeNull();
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
    expect(ed.state.selection.from).toBe(1);
    expect(ed.state.selection.to).toBe(5);

    // Deliberate editor gesture re-enables the toolbar, then outside pointer closes the menu.
    act(() => {
      ed.view.dom.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
      );
      ed.chain().focus().setTextSelection({ from: 1, to: 5 }).run();
      window.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy(),
    );
    openMenu();
    act(() => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    expect(document.querySelector('[data-nb-candidate-block-menu]')).toBeNull();
    expect(ed.state.selection.from).toBe(1); expect(ed.state.selection.to).toBe(5);
  });
});

describe('candidate block menu viewport bounds', () => {
  it.each([
    [1024, 768, 10, 40, 'below'], [1024, 768, 700, 730, 'above'],
    [320, 480, 230, 270, 'above'], [240, 180, 60, 100, 'below'],
  ] as const)('fits %sx%s viewport', (width, height, top, bottom, side) => {
    const result = placeCandidateBlockMenu({ left: width - 40, right: width + 100, top, bottom }, { left: 0, top: 0, width, height });
    expect(result.left).toBeGreaterThanOrEqual(0); expect(result.top).toBeGreaterThanOrEqual(0);
    expect(result.left + result.width).toBeLessThanOrEqual(width);
    expect(result.top + result.height).toBeLessThanOrEqual(height);
    expect(result.height).toBeLessThanOrEqual(360); expect(result.side).toBe(side);
  });
  it('respects an offset visual viewport (zoom or on-screen keyboard)', () => {
    const position = placeCandidateBlockMenu({ left: 250, right: 600, top: 500, bottom: 540 }, { left: 100, top: 200, width: 320, height: 300 });
    expect(position.left).toBeGreaterThanOrEqual(108); expect(position.top).toBeGreaterThanOrEqual(208);
    expect(position.left + position.width).toBeLessThanOrEqual(412);
    expect(position.top + position.height).toBeLessThanOrEqual(492);
  });
});
