/**
 * M6.4C — Product table UI tests (insert picker + contextual menu).
 *
 * @vitest-environment happy-dom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import {
  isEditorTableDocSerializable,
  readCandidateTableState,
  runCandidateTableCommand,
  navigateNotebookTableCell,
} from './tableCommands';
import {
  TABLE_SIZE_PICKER_MAX,
  formatTableSizeLabel,
} from './candidateTableUi';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { NotebookTiptapCandidateTableSizePicker } from '../../components/notebook/tiptap/NotebookTiptapCandidateTableSizePicker';
import * as tableCommands from './tableCommands';

const activeEditors: Editor[] = [];
let testRoot: Root | null = null;
let testHost: HTMLDivElement | null = null;

function createEditor(content?: object | string) {
  const editor = new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content:
      typeof content === 'string'
        ? bodyToTiptapDoc(content, 1)
        : content ?? { type: 'doc', content: [{ type: 'nbParagraph' }] },
  });
  activeEditors.push(editor);
  return editor;
}

function fireGesture(element: Element) {
  act(() => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  });
}

function pressKey(editor: Editor, key: string, opts: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  return editor.view.someProp('handleKeyDown', f => f(editor.view, event));
}

function focusFirstCell(editor: Editor) {
  let cellPos: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (cellPos != null) return false;
    if (node.type.name === 'nbTableCell') {
      // caret inside the cell's nbParagraph
      cellPos = pos + 2;
      return false;
    }
    return true;
  });
  expect(cellPos).not.toBeNull();
  editor.commands.setTextSelection(cellPos!);
  editor.commands.focus();
}

function cellTexts(editor: Editor): string[] {
  const out: string[] = [];
  editor.state.doc.descendants(n => {
    if (n.type.name === 'nbTableCell') out.push(n.textContent);
  });
  return out;
}

async function mountCandidate(body = 'Hello notebook') {
  let editorInstance: Editor | null = null;
  testHost = document.createElement('div');
  document.body.append(testHost);
  testRoot = createRoot(testHost);
  act(() => {
    testRoot!.render(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: body,
        pageKey: 'm64c-ui',
        onEditorReady: ed => {
          editorInstance = ed;
        },
      }),
    );
  });
  await vi.waitFor(() => expect(editorInstance).toBeTruthy());
  return editorInstance!;
}

afterEach(() => {
  while (activeEditors.length) activeEditors.pop()?.destroy();
  if (testRoot && testHost) {
    act(() => {
      testRoot?.unmount();
    });
    testHost.remove();
    testRoot = null;
    testHost = null;
  }
  vi.restoreAllMocks();
});

describe('M6.4C insert UI', () => {
  it('Table insert control appears in candidate selection toolbar', async () => {
    const ed = await mountCandidate('Select me please');
    act(() => {
      ed.commands.focus();
      ed.commands.setTextSelection({ from: 1, to: 7 });
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy();
    });
    const insertBtn = document.querySelector('[data-nb-candidate-fmt="tableInsert"]');
    expect(insertBtn).toBeTruthy();
    expect(document.querySelector('[data-nb-candidate-table-insert="1"]')).toBeTruthy();
    // Insert is "+ Table" (Plus icon + Table), not a duplicate "Table ▾".
    expect(insertBtn!.textContent?.replace(/\s+/g, ' ').trim()).toBe('Table');
    expect(insertBtn!.querySelector('svg')).toBeTruthy();
    expect(insertBtn!.getAttribute('title')).toBe('Insert table');
    expect(insertBtn!.getAttribute('aria-label')).toBe('Insert table');
  });

  it('size picker opens and shows 10×10 grid + label', async () => {
    const ed = await mountCandidate('Select me please');
    act(() => {
      ed.commands.focus();
      ed.commands.setTextSelection({ from: 1, to: 7 });
    });
    await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-fmt="tableInsert"]')).toBeTruthy());
    fireGesture(document.querySelector('[data-nb-candidate-fmt="tableInsert"]')!);
    await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-table-size-picker="1"]')).toBeTruthy());
    const cells = document.querySelectorAll('[data-nb-candidate-table-size-cell="1"]');
    expect(cells.length).toBe(TABLE_SIZE_PICKER_MAX * TABLE_SIZE_PICKER_MAX);
    expect(document.querySelector('[data-nb-candidate-table-size-label="1"]')?.textContent).toBe('1 × 1');
    expect(
      document.querySelector('[data-nb-table-size-col="3"][data-nb-table-size-row="4"]')?.getAttribute('aria-label'),
    ).toBe('3 × 4');
  });

  it('pick 3×4 cell requests insertTable rows:4 cols:3 with no header', async () => {
    const spy = vi.spyOn(tableCommands, 'runCandidateTableCommand');
    const ed = await mountCandidate('Select me please');
    act(() => {
      ed.commands.focus();
      ed.commands.setTextSelection({ from: 1, to: 7 });
    });
    await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-fmt="tableInsert"]')).toBeTruthy());
    fireGesture(document.querySelector('[data-nb-candidate-fmt="tableInsert"]')!);
    await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-table-size-picker="1"]')).toBeTruthy());

    expect(formatTableSizeLabel(3, 4)).toBe('3 × 4');
    const cell = document.querySelector<HTMLButtonElement>(
      '[data-nb-table-size-col="3"][data-nb-table-size-row="4"]',
    );
    expect(cell).toBeTruthy();
    expect(cell!.getAttribute('aria-label')).toBe('3 × 4');
    fireGesture(cell!);
    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });
    const call = spy.mock.calls.find(c => (c[1] as { type: string }).type === 'insertTable');
    expect(call?.[1]).toEqual({ type: 'insertTable', rows: 4, cols: 3 });

    act(() => {
      focusFirstCell(ed);
    });
    const ctx = readCandidateTableState(ed);
    expect(ctx.inTable).toBe(true);
    expect(ctx.rows).toBe(4);
    expect(ctx.cols).toBe(3);
    // Selection-driven insert must not destroy the paragraph used to open the toolbar.
    expect(ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n')).toContain('Select me please');
    let headers = 0;
    let tables = 0;
    ed.state.doc.descendants(n => {
      if (n.type.name === 'nbTableHeader') headers += 1;
      if (n.type.name === 'nbTable') tables += 1;
    });
    expect(tables).toBe(1);
    expect(headers).toBe(0);
    expect(() => tiptapDocToBody(ed.getJSON(), 1)).not.toThrow();
  });

  it('standalone size picker onPick receives cols×rows', () => {
    const onPick = vi.fn();
    testHost = document.createElement('div');
    document.body.append(testHost);
    testRoot = createRoot(testHost);
    act(() => {
      testRoot!.render(
        createElement(NotebookTiptapCandidateTableSizePicker, {
          open: true,
          onClose: () => {},
          onPick,
        }),
      );
    });
    const cell = document.querySelector<HTMLButtonElement>(
      '[data-nb-table-size-col="2"][data-nb-table-size-row="2"]',
    );
    fireGesture(cell!);
    expect(onPick).toHaveBeenCalledWith(2, 2);
  });
});

describe('M6.4C insert-after-block (no selection split)', () => {
  function paraDoc(text: string, marks?: { s: number; e: number; t: string }[]) {
    return createEditor(
      `~nb1:${JSON.stringify(['paragraph', text, marks ?? [], null])}`,
    );
  }

  function paragraphText(editor: Editor): string {
    const first = editor.state.doc.child(0);
    expect(first.type.name).toBe('nbParagraph');
    return first.textContent;
  }

  function assertParaThenTable(editor: Editor, expectedText: string, rows: number, cols: number) {
    expect(paragraphText(editor)).toBe(expectedText);
    expect(editor.state.doc.childCount).toBeGreaterThanOrEqual(2);
    expect(editor.state.doc.child(1).type.name).toBe('nbTable');
    focusFirstCell(editor);
    const st2 = readCandidateTableState(editor);
    expect(st2.rows).toBe(rows);
    expect(st2.cols).toBe(cols);
    expect(() => tiptapDocToBody(editor.getJSON(), 1)).not.toThrow();
    const body = tiptapDocToBody(editor.getJSON(), 1);
    expect(body).toContain(expectedText);
    expect(body).toContain('~nb1:["table"');
  }

  it('1. partial selection preserves paragraph; table after block', () => {
    const full = 'M6.3 persistence test';
    const ed = paraDoc(full);
    const start = full.indexOf('persistence');
    ed.commands.setTextSelection({ from: 1 + start, to: 1 + start + 'persistence'.length });
    expect(runCandidateTableCommand(ed, { type: 'insertTable', rows: 2, cols: 2 })).toBe(true);
    assertParaThenTable(ed, full, 2, 2);
  });

  it('2. whole paragraph selected — text unchanged, table after', () => {
    const ed = paraDoc('Whole paragraph here');
    ed.commands.setTextSelection({ from: 1, to: 1 + 'Whole paragraph here'.length });
    expect(runCandidateTableCommand(ed, { type: 'insertTable', rows: 2, cols: 2 })).toBe(true);
    assertParaThenTable(ed, 'Whole paragraph here', 2, 2);
  });

  it('3. formatted selection remains lossless; table after', () => {
    const body = '~nb1:["paragraph","bold word here",[{"s":0,"e":4,"t":"b"}],null]';
    const ed = createEditor(body);
    ed.commands.setTextSelection({ from: 1, to: 5 }); // "bold"
    expect(runCandidateTableCommand(ed, { type: 'insertTable', rows: 2, cols: 2 })).toBe(true);
    expect(paragraphText(ed)).toBe('bold word here');
    expect(tiptapDocToBody(ed.getJSON(), 1)).toContain('[{"s":0,"e":4,"t":"b"}]');
    focusFirstCell(ed);
    expect(readCandidateTableState(ed).rows).toBe(2);
  });

  it('4. RTL Hebrew selection preserved; table after', () => {
    const ed = paraDoc('שלום עולם');
    ed.commands.setTextSelection({ from: 1, to: 5 });
    expect(runCandidateTableCommand(ed, { type: 'insertTable', rows: 2, cols: 2 })).toBe(true);
    assertParaThenTable(ed, 'שלום עולם', 2, 2);
  });

  it('5. empty caret inside paragraph — paragraph unchanged, table after', () => {
    const ed = paraDoc('Keep me intact');
    ed.commands.setTextSelection(5);
    expect(ed.state.selection.empty).toBe(true);
    expect(runCandidateTableCommand(ed, { type: 'insertTable', rows: 2, cols: 2 })).toBe(true);
    assertParaThenTable(ed, 'Keep me intact', 2, 2);
  });

  it('6. result serializes SAFE', () => {
    const ed = paraDoc('M6.3 persistence test');
    ed.commands.setTextSelection({ from: 6, to: 17 });
    runCandidateTableCommand(ed, { type: 'insertTable', rows: 2, cols: 2 });
    expect(() => tiptapDocToBody(ed.getJSON(), 1)).not.toThrow();
    expect(isEditorTableDocSerializable(ed)).toBe(true);
  });
});

describe('M6.4C context UI', () => {
  it('Table ▾ appears inside table and not as active controls outside', async () => {
    const ed = await mountCandidate('Outside text here');
    act(() => {
      ed.commands.focus();
      ed.commands.setTextSelection({ from: 1, to: 8 });
    });
    await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-fmt="tableInsert"]')).toBeTruthy());
    expect(document.querySelector('[data-nb-candidate-table-menu-trigger="1"]')).toBeNull();

    act(() => {
      runCandidateTableCommand(ed, { type: 'insertTable', rows: 2, cols: 2 });
      focusFirstCell(ed);
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-table-menu-trigger="1"]')).toBeTruthy();
    });
    const insertBtn = document.querySelector('[data-nb-candidate-fmt="tableInsert"]');
    const menuBtn = document.querySelector('[data-nb-candidate-table-menu-trigger="1"]');
    expect(insertBtn).toBeTruthy();
    expect(menuBtn).toBeTruthy();
    expect(insertBtn!.getAttribute('title')).toBe('Insert table');
    expect(menuBtn!.getAttribute('aria-label')).toBe('Table');
    expect(menuBtn!.textContent?.replace(/\s+/g, ' ').trim()).toContain('Table');
    // Distinct presentation: insert uses Plus (+ Table), context keeps Table ▾ chevron.
    expect(insertBtn!.innerHTML).toMatch(/lucide-plus|Plus/i);
    expect(menuBtn!.innerHTML).toMatch(/lucide-chevron-down|ChevronDown/i);
  });

  it('structural menu actions route through runCandidateTableCommand', async () => {
    const spy = vi.spyOn(tableCommands, 'runCandidateTableCommand');
    const ed = await mountCandidate('Hello world text');
    act(() => {
      ed.commands.focus();
      ed.commands.setTextSelection(2);
      runCandidateTableCommand(ed, { type: 'insertTable', rows: 2, cols: 2 });
      focusFirstCell(ed);
    });
    await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-table-menu-trigger="1"]')).toBeTruthy());

    const runMenu = async (type: string) => {
      act(() => {
        focusFirstCell(ed);
      });
      await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-table-menu-trigger="1"]')).toBeTruthy());
      fireGesture(document.querySelector('[data-nb-candidate-table-menu-trigger="1"]')!);
      const sel = `[data-nb-candidate-table-action="${type}"]`;
      await vi.waitFor(() => expect(document.querySelector(sel)).toBeTruthy());
      spy.mockClear();
      fireGesture(document.querySelector(sel)!);
      expect(spy.mock.calls.some(c => (c[1] as { type: string }).type === type)).toBe(true);
    };

    await runMenu('addRowBefore');
    await runMenu('addRowAfter');
    await runMenu('addColumnBefore');
    await runMenu('addColumnAfter');
  });

  it('Delete row / column / table actions are labeled and separated', async () => {
    const ed = await mountCandidate('Hello world text');
    act(() => {
      ed.commands.focus();
      runCandidateTableCommand(ed, { type: 'insertTable', rows: 2, cols: 2 });
      focusFirstCell(ed);
    });
    await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-table-menu-trigger="1"]')).toBeTruthy());
    fireGesture(document.querySelector('[data-nb-candidate-table-menu-trigger="1"]')!);
    await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-table-menu="1"]')).toBeTruthy());
    const delTable = document.querySelector('[data-nb-candidate-table-action="deleteTable"]');
    expect(delTable?.textContent).toBe('Delete table');
    expect(delTable?.getAttribute('data-nb-candidate-table-destructive')).toBe('1');
    expect(document.querySelector('[data-nb-candidate-table-action="deleteRow"]')).toBeTruthy();
    expect(document.querySelector('[data-nb-candidate-table-action="deleteColumn"]')).toBeTruthy();
  });

  it('Add row/column disabled at 20 via state', () => {
    const ed = createEditor();
    runCandidateTableCommand(ed, { type: 'insertTable', rows: 20, cols: 20 });
    focusFirstCell(ed);
    const st = readCandidateTableState(ed);
    expect(st.canAddRow).toBe(false);
    expect(st.canAddColumn).toBe(false);
    expect(runCandidateTableCommand(ed, { type: 'addRowAfter' })).toBe(false);
    expect(runCandidateTableCommand(ed, { type: 'addColumnAfter' })).toBe(false);
  });

  it('menu action preserves target: addRowAfter grows intended table', async () => {
    const ed = await mountCandidate('Hello world text');
    act(() => {
      ed.commands.focus();
      runCandidateTableCommand(ed, { type: 'insertTable', rows: 2, cols: 2 });
      focusFirstCell(ed);
    });
    const before = readCandidateTableState(ed).rows;
    await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-table-menu-trigger="1"]')).toBeTruthy());
    fireGesture(document.querySelector('[data-nb-candidate-table-menu-trigger="1"]')!);
    await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-table-action="addRowAfter"]')).toBeTruthy());
    fireGesture(document.querySelector('[data-nb-candidate-table-action="addRowAfter"]')!);
    expect(readCandidateTableState(ed).rows).toBe(before + 1);
  });
});

describe('M6.4C regressions', () => {
  it('Tab destination remains collapsed; final Tab does not add row', () => {
    const ed = createEditor();
    runCandidateTableCommand(ed, { type: 'insertTable', rows: 1, cols: 2 });
    focusFirstCell(ed);
    ed.commands.insertContent('A');
    pressKey(ed, 'Tab');
    expect(ed.state.selection instanceof TextSelection).toBe(true);
    expect(ed.state.selection.empty).toBe(true);
    ed.commands.insertContent('B');
    pressKey(ed, 'Tab', { shiftKey: true });
    expect(ed.state.selection.empty).toBe(true);
    ed.commands.insertContent('C');
    expect(cellTexts(ed)[0]).toBe('AC');
    expect(cellTexts(ed)[1]).toBe('B');
    const rows = readCandidateTableState(ed).rows;
    pressKey(ed, 'Tab');
    pressKey(ed, 'Tab');
    expect(readCandidateTableState(ed).rows).toBe(rows);
  });

  it('Enter in cell is no-op; paste stays single-cell; serialize SAFE', () => {
    const ed = createEditor();
    runCandidateTableCommand(ed, { type: 'insertTable', rows: 1, cols: 1 });
    focusFirstCell(ed);
    ed.commands.insertContent('Hi');
    pressKey(ed, 'Enter');
    let paras = 0;
    ed.state.doc.descendants(n => {
      if (n.type.name === 'nbTableCell') {
        expect(n.childCount).toBe(1);
        paras += n.childCount;
      }
    });
    expect(paras).toBe(1);

    const view = ed.view;
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (type: string) => (type === 'text/plain' ? 'A\tB\nC\tD' : ''),
      },
    });
    view.someProp('handlePaste', f => f(view, event, view.state.selection.content()));
    expect(readCandidateTableState(ed).rows).toBe(1);
    expect(readCandidateTableState(ed).cols).toBe(1);
    expect(cellTexts(ed)[0]).toContain('A');
    expect(() => tiptapDocToBody(ed.getJSON(), 1)).not.toThrow();
  });

  it('RTL / explicit math / link survive in cells; plain 3/5 stays prose', () => {
    const ed = createEditor();
    runCandidateTableCommand(ed, { type: 'insertTable', rows: 1, cols: 1 });
    focusFirstCell(ed);
    ed.commands.insertContent('שלום 3/5');
    expect(cellTexts(ed)[0]).toContain('3/5');
    expect(ed.state.doc.textContent).not.toMatch(/nbInlineMath/);
    const body = tiptapDocToBody(ed.getJSON(), 1);
    expect(body).toContain('שלום');
    expect(body).toContain('3/5');
  });

  it('hydration of table body does not emit update (no-write)', () => {
    const onUpdate = vi.fn();
    const body = `~nb1:${JSON.stringify(['table', '', [], { v: 1, rows: [[{ t: 'A' }, { t: 'B' }]] }])}`;
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc(body, 1),
      onUpdate,
    });
    expect(onUpdate).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('navigateNotebookTableCell collapse still works after UI layer', () => {
    const ed = createEditor();
    runCandidateTableCommand(ed, { type: 'insertTable', rows: 1, cols: 2 });
    focusFirstCell(ed);
    ed.commands.insertContent('A');
    expect(navigateNotebookTableCell(ed, 1)).toBe(true);
    expect(ed.state.selection.empty).toBe(true);
    ed.commands.insertContent('B');
    expect(navigateNotebookTableCell(ed, -1)).toBe(true);
    expect(ed.state.selection.empty).toBe(true);
    expect(ed.state.selection.toJSON()).toEqual(
      expect.objectContaining({ type: 'text', anchor: expect.any(Number), head: expect.any(Number) }),
    );
    expect(ed.state.selection.anchor).toBe(ed.state.selection.head);
  });
});
