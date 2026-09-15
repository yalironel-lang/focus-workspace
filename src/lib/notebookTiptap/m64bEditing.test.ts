/**
 * M6.4B — Table editing commands + document-flow foundation tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { MAX_TABLE_COLS, MAX_TABLE_ROWS } from '../notebookTableCodec';
import {
  createNotebookTableJson,
  DEFAULT_INSERT_TABLE_COLS,
  DEFAULT_INSERT_TABLE_ROWS,
  isValidTableSize,
  readTableContext,
  runCandidateTableCommand,
} from './tableCommands';
import { runCandidateFormatCommand } from './candidateFormatCommands';
import { decodeNotebookTextV1, encodeNotebookTextV1 } from '../notebookTextCodec';

function ed(content?: string | object) {
  return new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content:
      typeof content === 'string'
        ? bodyToTiptapDoc(content, 1)
        : content ?? { type: 'doc', content: [{ type: 'nbParagraph' }] },
  });
}

function tableBody(rows: { t: string; m?: unknown[] }[][]): string {
  return `~nb1:${JSON.stringify(['table', '', [], { v: 1, rows }])}`;
}

function countHeaders(editor: Editor): number {
  let n = 0;
  editor.state.doc.descendants(node => {
    if (node.type.name === 'nbTableHeader') n += 1;
  });
  return n;
}

function pressKey(editor: Editor, key: string, opts: KeyboardEventInit = {}): boolean | undefined {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  return editor.view.someProp('handleKeyDown', f => f(editor.view, event));
}

function focusFirstCell(editor: Editor) {
  let cellPos: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (cellPos != null) return false;
    if (node.type.name === 'nbTableCell') {
      cellPos = pos + 2;
      return false;
    }
    return true;
  });
  expect(cellPos).not.toBeNull();
  editor.commands.setTextSelection(cellPos!);
}

function firstTablePos(editor: Editor): number {
  let tablePos = -1;
  editor.state.doc.forEach((node, pos) => {
    if (tablePos < 0 && node.type.name === 'nbTable') tablePos = pos;
  });
  expect(tablePos).toBeGreaterThanOrEqual(0);
  return tablePos;
}

describe('M6.4B insert', () => {
  it('1-3. default insert → 3×3, no headers, serializable', () => {
    const editor = ed();
    expect(runCandidateTableCommand(editor, { type: 'insertTable' })).toBe(true);
    const ctx = readTableContext(editor)!;
    expect(ctx.rows).toBe(DEFAULT_INSERT_TABLE_ROWS);
    expect(ctx.cols).toBe(DEFAULT_INSERT_TABLE_COLS);
    expect(countHeaders(editor)).toBe(0);
    const body = tiptapDocToBody(editor.getJSON(), 1);
    expect(body).toContain('~nb1:["table"');
    const tableLine = body.split('\n').find(l => l.includes('~nb1:["table"'))!;
    expect(JSON.parse(tableLine.slice(5))[3].rows).toHaveLength(3);
    expect(JSON.parse(tableLine.slice(5))[3].rows[0]).toHaveLength(3);
    editor.destroy();
  });

  it('TEST1 regression: insert yields visible 3×3 DOM grid (borders), not blank caret', () => {
    const editor = ed({
      type: 'doc',
      content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'Above' }] }],
    });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(runCandidateTableCommand(editor, { type: 'insertTable', rows: 3, cols: 3 })).toBe(true);

    let tables = 0;
    let rows = 0;
    let cells = 0;
    let headers = 0;
    editor.state.doc.descendants(node => {
      if (node.type.name === 'nbTable') tables += 1;
      if (node.type.name === 'nbTableRow') rows += 1;
      if (node.type.name === 'nbTableCell') cells += 1;
      if (node.type.name === 'nbTableHeader') headers += 1;
    });
    expect({ tables, rows, cells, headers }).toEqual({ tables: 1, rows: 3, cells: 9, headers: 0 });
    expect(() => tiptapDocToBody(editor.getJSON(), 1)).not.toThrow();
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('"table"');

    const tableEl = editor.view.dom.querySelector('table');
    const tds = editor.view.dom.querySelectorAll('td');
    const trs = editor.view.dom.querySelectorAll('tr');
    expect(tableEl).toBeTruthy();
    expect(trs.length).toBe(3);
    expect(tds.length).toBe(9);
    // Structural visibility: cell chrome must be present (inline and/or class).
    const cellStyle = tds[0]?.getAttribute('style') ?? '';
    expect(cellStyle).toMatch(/border/i);
    expect(tds[0]?.classList.contains('nb-table-cell') || tds[0]?.getAttribute('data-nb') === 'nbTableCell').toBe(
      true,
    );
    editor.destroy();
  });

  it('2. insert never uses TipTap withHeaderRow default (manual JSON)', () => {
    const json = createNotebookTableJson(2, 2);
    expect(JSON.stringify(json)).not.toContain('nbTableHeader');
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable', rows: 2, cols: 2 });
    expect(countHeaders(editor)).toBe(0);
    editor.destroy();
  });

  it('4-5. 1×1 and 20×20 valid', () => {
    const a = ed();
    expect(runCandidateTableCommand(a, { type: 'insertTable', rows: 1, cols: 1 })).toBe(true);
    expect(tiptapDocToBody(a.getJSON(), 1)).toContain('"rows":[[{"t":""}]]');
    a.destroy();
    const b = ed();
    expect(
      runCandidateTableCommand(b, { type: 'insertTable', rows: MAX_TABLE_ROWS, cols: MAX_TABLE_COLS }),
    ).toBe(true);
    expect(readTableContext(b)?.rows).toBe(20);
    expect(readTableContext(b)?.cols).toBe(20);
    expect(() => tiptapDocToBody(b.getJSON(), 1)).not.toThrow();
    b.destroy();
  });

  it('6-9. invalid sizes rejected', () => {
    expect(isValidTableSize(21, 1)).toBe(false);
    expect(isValidTableSize(1, 21)).toBe(false);
    expect(isValidTableSize(0, 1)).toBe(false);
    expect(isValidTableSize(1, 0)).toBe(false);
    const editor = ed();
    expect(runCandidateTableCommand(editor, { type: 'insertTable', rows: 21, cols: 1 })).toBe(false);
    expect(runCandidateTableCommand(editor, { type: 'insertTable', rows: 1, cols: 21 })).toBe(false);
    expect(runCandidateTableCommand(editor, { type: 'insertTable', rows: 0, cols: 1 })).toBe(false);
    expect(editor.state.doc.child(0).type.name).toBe('nbParagraph');
    editor.destroy();
  });
});

describe('M6.4B rows/columns', () => {
  it('10-15. row add/delete + only-row removes table', () => {
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable', rows: 2, cols: 2 });
    focusFirstCell(editor);
    expect(runCandidateTableCommand(editor, { type: 'addRowAfter' })).toBe(true);
    expect(readTableContext(editor)?.rows).toBe(3);
    expect(readTableContext(editor)?.cols).toBe(2);
    expect(runCandidateTableCommand(editor, { type: 'addRowBefore' })).toBe(true);
    expect(readTableContext(editor)?.rows).toBe(4);
    expect(() => tiptapDocToBody(editor.getJSON(), 1)).not.toThrow();
    expect(countHeaders(editor)).toBe(0);

    // Fill to 20 then refuse
    while ((readTableContext(editor)?.rows ?? 0) < MAX_TABLE_ROWS) {
      expect(runCandidateTableCommand(editor, { type: 'addRowAfter' })).toBe(true);
    }
    expect(runCandidateTableCommand(editor, { type: 'addRowAfter' })).toBe(false);
    expect(readTableContext(editor)?.rows).toBe(20);

    // Delete down to 1 then last delete removes table
    while ((readTableContext(editor)?.rows ?? 0) > 1) {
      expect(runCandidateTableCommand(editor, { type: 'deleteRow' })).toBe(true);
    }
    expect(readTableContext(editor)?.rows).toBe(1);
    expect(runCandidateTableCommand(editor, { type: 'deleteRow' })).toBe(true);
    expect(readTableContext(editor)).toBeNull();
    expect(editor.state.doc.childCount).toBeGreaterThanOrEqual(1);
    editor.destroy();
  });

  it('16-21. column add/delete + only-col removes table', () => {
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable', rows: 2, cols: 2 });
    focusFirstCell(editor);
    expect(runCandidateTableCommand(editor, { type: 'addColumnAfter' })).toBe(true);
    expect(readTableContext(editor)?.cols).toBe(3);
    expect(readTableContext(editor)?.rows).toBe(2);
    expect(runCandidateTableCommand(editor, { type: 'addColumnBefore' })).toBe(true);
    expect(readTableContext(editor)?.cols).toBe(4);

    while ((readTableContext(editor)?.cols ?? 0) < MAX_TABLE_COLS) {
      expect(runCandidateTableCommand(editor, { type: 'addColumnAfter' })).toBe(true);
    }
    expect(runCandidateTableCommand(editor, { type: 'addColumnAfter' })).toBe(false);

    while ((readTableContext(editor)?.cols ?? 0) > 1) {
      expect(runCandidateTableCommand(editor, { type: 'deleteColumn' })).toBe(true);
    }
    expect(runCandidateTableCommand(editor, { type: 'deleteColumn' })).toBe(true);
    expect(readTableContext(editor)).toBeNull();
    editor.destroy();
  });
});

describe('M6.4B serialization after commands', () => {
  it('22-27. command results have no header/unsupported attrs', () => {
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable' });
    focusFirstCell(editor);
    runCandidateTableCommand(editor, { type: 'addRowAfter' });
    runCandidateTableCommand(editor, { type: 'addColumnAfter' });
    const json = editor.getJSON();
    const body = tiptapDocToBody(json, 1);
    expect(body).toMatch(/^~nb1:/);
    let bad = false;
    editor.state.doc.descendants(node => {
      if (node.type.name === 'nbTableHeader') bad = true;
      if (node.type.name === 'nbTableCell') {
        if (node.attrs.colspan !== 1 || node.attrs.rowspan !== 1) bad = true;
        if (node.attrs.colwidth != null || node.attrs.align != null) bad = true;
      }
    });
    expect(bad).toBe(false);
    editor.destroy();
  });
});

describe('M6.4B document flow', () => {
  it('28. paragraph-table-paragraph survives', () => {
    const body = [
      '~nb1:["paragraph","Before",[],null]',
      tableBody([[{ t: 'A' }]]),
      '~nb1:["paragraph","After",[],null]',
    ].join('\n');
    const editor = ed(body);
    expect(tiptapDocToBody(editor.getJSON(), 1)).toBe(body);
    editor.destroy();
  });

  it('29-30. Enter / typing on selected table preserves table', () => {
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable', rows: 1, cols: 1 });
    const tablePos = firstTablePos(editor);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, tablePos)));
    expect(editor.state.selection instanceof NodeSelection).toBe(true);

    pressKey(editor, 'Enter');
    expect(editor.state.doc.childCount).toBeGreaterThanOrEqual(2);
    expect(firstTablePos(editor)).toBeGreaterThanOrEqual(0);

    const tablePos2 = firstTablePos(editor);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, tablePos2)));
    const beforeTableLine = tiptapDocToBody(editor.getJSON(), 1)
      .split('\n')
      .find(l => l.includes('~nb1:["table"'))!;
    pressKey(editor, 'x');
    const after = tiptapDocToBody(editor.getJSON(), 1);
    expect(after).toContain('~nb1:["table"');
    expect(after).toContain(beforeTableLine);
    editor.destroy();
  });

  it('31-32. Delete/Backspace on selected table deletes it', () => {
    for (const key of ['Delete', 'Backspace'] as const) {
      const editor = ed('~nb1:["paragraph","keep",[],null]');
      runCandidateTableCommand(editor, { type: 'insertTable', rows: 1, cols: 1 });
      // Find table pos
      let tablePos = -1;
      editor.state.doc.forEach((node, pos) => {
        if (node.type.name === 'nbTable') tablePos = pos;
      });
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, tablePos)));
      pressKey(editor, key);
      expect(readTableContext(editor)).toBeNull();
      expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('keep');
      editor.destroy();
    }
  });

  it('33. CellSelection / in-cell text does not replace whole table', () => {
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable', rows: 2, cols: 2 });
    focusFirstCell(editor);
    editor.commands.insertContent('Hi');
    expect(readTableContext(editor)?.rows).toBe(2);
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('"t":"Hi"');
    editor.destroy();
  });
});

describe('M6.4B cell editing', () => {
  it('34-38. typing and boundary Backspace/Delete safe', () => {
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable', rows: 1, cols: 1 });
    focusFirstCell(editor);
    editor.commands.insertContent('ab');
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('"t":"ab"');
    editor.commands.setTextSelection(editor.state.selection.from);
    // at start of cell
    const $from = editor.state.selection.$from;
    editor.commands.setTextSelection($from.start());
    pressKey(editor, 'Backspace');
    expect(readTableContext(editor)).not.toBeNull();
    // at end
    editor.commands.setTextSelection(editor.state.selection.$from.end());
    pressKey(editor, 'Delete');
    expect(readTableContext(editor)).not.toBeNull();
    editor.destroy();
  });

  it('39. Enter does not create second paragraph in cell', () => {
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable', rows: 1, cols: 1 });
    focusFirstCell(editor);
    pressKey(editor, 'Enter');
    let paras = 0;
    editor.state.doc.descendants(node => {
      if (node.type.name === 'nbTableCell') {
        expect(node.childCount).toBe(1);
        paras += node.childCount;
      }
    });
    expect(paras).toBe(1);
    expect(() => tiptapDocToBody(editor.getJSON(), 1)).not.toThrow();
    editor.destroy();
  });

  it('40-42. Tab / Shift+Tab navigate; final Tab does not add row', () => {
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable', rows: 1, cols: 2 });
    focusFirstCell(editor);
    const beforeRows = readTableContext(editor)!.rows;
    expect(pressKey(editor, 'Tab')).toBe(true);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection instanceof TextSelection).toBe(true);
    expect(pressKey(editor, 'Tab', { shiftKey: true })).toBe(true);
    expect(editor.state.selection.empty).toBe(true);
    // Final cell Tab via NbTable shortcut path — must not add row
    expect(pressKey(editor, 'Tab')).toBe(true);
    expect(pressKey(editor, 'Tab')).toBe(true); // already last cell
    expect(readTableContext(editor)?.rows).toBe(beforeRows);
    expect(() => tiptapDocToBody(editor.getJSON(), 1)).not.toThrow();
    editor.destroy();
  });

  it('TEST4 regression: Shift+Tab leaves collapsed caret; typing appends (not replace)', () => {
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable', rows: 3, cols: 3 });
    focusFirstCell(editor);
    editor.commands.insertContent('A');
    expect(pressKey(editor, 'Tab')).toBe(true);
    // Forward Tab into empty cell → collapsed TextSelection
    expect(editor.state.selection instanceof TextSelection).toBe(true);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.toJSON()).toEqual(
      expect.objectContaining({ type: 'text', anchor: expect.any(Number), head: expect.any(Number) }),
    );
    expect(editor.state.selection.anchor).toBe(editor.state.selection.head);

    editor.commands.insertContent('B');
    const afterB = editor.state.selection.toJSON();
    expect(afterB).toEqual(expect.objectContaining({ type: 'text' }));

    expect(pressKey(editor, 'Tab', { shiftKey: true })).toBe(true);
    // Shift+Tab into "A" → collapsed TextSelection at END (not range over A)
    const afterShift = editor.state.selection;
    expect(afterShift instanceof TextSelection).toBe(true);
    expect(afterShift.empty).toBe(true);
    expect(afterShift.anchor).toBe(afterShift.head);
    expect(afterShift.toJSON()).toEqual({
      type: 'text',
      anchor: afterShift.anchor,
      head: afterShift.head,
    });
    // A still present before typing
    const cellsBefore: string[] = [];
    editor.state.doc.descendants(n => {
      if (n.type.name === 'nbTableCell') cellsBefore.push(n.textContent);
    });
    expect(cellsBefore[0]).toBe('A');
    expect(cellsBefore[1]).toBe('B');

    editor.commands.insertContent('C');
    const cells: string[] = [];
    editor.state.doc.descendants(n => {
      if (n.type.name === 'nbTableCell') cells.push(n.textContent);
    });
    expect(cells[0]).toBe('AC');
    expect(cells[1]).toBe('B');
    expect(() => tiptapDocToBody(editor.getJSON(), 1)).not.toThrow();
    editor.destroy();
  });

  it('TEST4b: Tab into non-empty cell also collapses (latent forward bug)', () => {
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable', rows: 1, cols: 2 });
    focusFirstCell(editor);
    pressKey(editor, 'Tab');
    editor.commands.insertContent('X');
    pressKey(editor, 'Tab', { shiftKey: true });
    editor.commands.insertContent('A');
    pressKey(editor, 'Tab');
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection instanceof TextSelection).toBe(true);
    editor.commands.insertContent('Y');
    const cells: string[] = [];
    editor.state.doc.descendants(n => {
      if (n.type.name === 'nbTableCell') cells.push(n.textContent);
    });
    expect(cells).toEqual(['A', 'XY']);
    editor.destroy();
  });

  it('TEST4c: empty destination, first-cell Shift+Tab, final-cell Tab boundaries', () => {
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable', rows: 2, cols: 2 });
    focusFirstCell(editor);
    const rowsBefore = readTableContext(editor)!.rows;
    const colsBefore = readTableContext(editor)!.cols;

    // Empty destination via Tab
    expect(pressKey(editor, 'Tab')).toBe(true);
    expect(editor.state.selection.empty).toBe(true);

    // Back to first cell
    expect(pressKey(editor, 'Tab', { shiftKey: true })).toBe(true);
    expect(editor.state.selection.empty).toBe(true);

    // Shift+Tab from first cell: swallow, no structural change / no corrupt select
    expect(pressKey(editor, 'Tab', { shiftKey: true })).toBe(true);
    expect(readTableContext(editor)?.rows).toBe(rowsBefore);
    expect(readTableContext(editor)?.cols).toBe(colsBefore);
    expect(editor.state.selection.empty).toBe(true);

    // Walk to last cell then Tab — no new row
    pressKey(editor, 'Tab');
    pressKey(editor, 'Tab');
    pressKey(editor, 'Tab');
    expect(pressKey(editor, 'Tab')).toBe(true);
    expect(readTableContext(editor)?.rows).toBe(rowsBefore);
    expect(readTableContext(editor)?.cols).toBe(colsBefore);

    // Repeated forward/back with collapsed carets
    for (let i = 0; i < 4; i++) {
      pressKey(editor, 'Tab', { shiftKey: true });
      expect(editor.state.selection.empty).toBe(true);
      expect(editor.state.selection instanceof TextSelection).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      pressKey(editor, 'Tab');
      expect(editor.state.selection.empty).toBe(true);
      expect(editor.state.selection instanceof TextSelection).toBe(true);
    }

    expect(() => tiptapDocToBody(editor.getJSON(), 1)).not.toThrow();
    editor.destroy();
  });
});

describe('M6.4B paste', () => {
  it('43-46. plain paste stays in cell; no top-level / HTML / TSV expansion', () => {
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable', rows: 1, cols: 1 });
    focusFirstCell(editor);
    const view = editor.view;
    const paste = (plain: string, html?: string) => {
      const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(event, 'clipboardData', {
        value: {
          getData: (type: string) => {
            if (type === 'text/plain') return plain;
            if (type === 'text/html') return html ?? '';
            return '';
          },
        },
      });
      return view.someProp('handlePaste', f =>
        f(view, event, view.state.selection.content()),
      );
    };
    expect(paste('hello\nworld\tfoo')).toBe(true);
    expect(readTableContext(editor)?.rows).toBe(1);
    expect(readTableContext(editor)?.cols).toBe(1);
    const body = tiptapDocToBody(editor.getJSON(), 1);
    const tableLines = body.split('\n').filter(l => l.includes('~nb1:["table"'));
    expect(tableLines).toHaveLength(1);
    expect(body).toContain('hello world foo');
    // Still a single 1×1 table — paste must not invent rows/cols/top-level blocks.
    expect(readTableContext(editor)?.rows).toBe(1);
    expect(readTableContext(editor)?.cols).toBe(1);
    // HTML-only refused
    expect(paste('', '<table><tr><td>x</td></tr></table>')).toBe(true);
    expect(readTableContext(editor)?.rows).toBe(1);
    editor.destroy();
  });
});

describe('M6.4B formatting + RTL', () => {
  it('47-52. format commands + no auto math/link', () => {
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable', rows: 1, cols: 1 });
    focusFirstCell(editor);
    editor.commands.insertContent('3/5 google.com');
    editor.commands.setTextSelection({
      from: editor.state.selection.$from.start(),
      to: editor.state.selection.$from.start() + 3,
    });
    expect(runCandidateFormatCommand(editor, { type: 'toggleBold' })).toBe(true);
    editor.commands.setTextSelection({
      from: editor.state.selection.$from.start(),
      to: editor.state.selection.$from.start() + 3,
    });
    // After bold, re-select 3/5 for italic/math
    const start = 4; // approximate — use stored positions from body instead
    void start;
    const body = tiptapDocToBody(editor.getJSON(), 1);
    expect(body).toContain('3/5');
    expect(body).toContain('google.com');
    // plain URLs/math not auto-converted unless marks present for whole strings
    const blocks = decodeNotebookTextV1(body);
    if (blocks[0]?.kind === 'table') {
      const cell = blocks[0].rows[0]![0]!;
      expect(cell.t).toContain('google.com');
      const hasAutoLink = (cell.m ?? []).some(m => m.t === 'a');
      expect(hasAutoLink).toBe(false);
    }
    editor.destroy();

    // Explicit marks round-trip
    const explicit = tableBody([
      [
        {
          t: 'go',
          m: [
            { s: 0, e: 2, t: 'b' },
            { s: 0, e: 2, t: 'a', v: 'https://example.com' },
          ],
        },
      ],
      [{ t: '3/5', m: [{ s: 0, e: 3, t: 'm' }] }],
      [{ t: 'ital', m: [{ s: 0, e: 4, t: 'i' }] }],
    ]);
    const e2 = ed(explicit);
    expect(tiptapDocToBody(e2.getJSON(), 1)).toBe(explicit);
    e2.destroy();
  });

  it('53-56. Hebrew / mixed / math / link RTL cells', () => {
    const bodies = [
      tableBody([[{ t: 'שלום' }]]),
      tableBody([[{ t: 'Hello שלום' }]]),
      tableBody([[{ t: 'שלום', m: [{ s: 0, e: 4, t: 'm' }] }]]),
      tableBody([[{ t: 'שלום', m: [{ s: 0, e: 4, t: 'a', v: 'https://example.com' }] }]]),
    ];
    for (const body of bodies) {
      const editor = ed(body);
      expect(tiptapDocToBody(editor.getJSON(), 1)).toBe(body);
      editor.destroy();
    }
  });
});

describe('M6.4B undo/redo', () => {
  it('57-62. structural ops undo/redo', () => {
    const editor = ed();
    runCandidateTableCommand(editor, { type: 'insertTable', rows: 2, cols: 2 });
    focusFirstCell(editor);
    // Separate history events: a no-op selection bump does not merge steps.
    editor.commands.setTextSelection(editor.state.selection.from);
    const afterInsert = tiptapDocToBody(editor.getJSON(), 1);
    expect(afterInsert).toContain('"table"');

    expect(runCandidateTableCommand(editor, { type: 'addRowAfter' })).toBe(true);
    expect(readTableContext(editor)?.rows).toBe(3);
    const afterRow = tiptapDocToBody(editor.getJSON(), 1);
    expect(editor.commands.undo()).toBe(true);
    expect(readTableContext(editor)?.rows).toBe(2);
    expect(tiptapDocToBody(editor.getJSON(), 1)).toBe(afterInsert);
    expect(editor.commands.redo()).toBe(true);
    expect(tiptapDocToBody(editor.getJSON(), 1)).toBe(afterRow);

    expect(runCandidateTableCommand(editor, { type: 'addColumnAfter' })).toBe(true);
    expect(readTableContext(editor)?.cols).toBe(3);
    const afterCol = tiptapDocToBody(editor.getJSON(), 1);
    expect(editor.commands.undo()).toBe(true);
    expect(tiptapDocToBody(editor.getJSON(), 1)).toBe(afterRow);
    expect(editor.commands.redo()).toBe(true);
    expect(tiptapDocToBody(editor.getJSON(), 1)).toBe(afterCol);

    const rowsBeforeDelete = readTableContext(editor)!.rows;
    expect(runCandidateTableCommand(editor, { type: 'deleteRow' })).toBe(true);
    expect(readTableContext(editor)?.rows).toBe(rowsBeforeDelete - 1);
    expect(editor.commands.undo()).toBe(true);
    expect(readTableContext(editor)?.rows).toBe(rowsBeforeDelete);

    const colsBeforeDelete = readTableContext(editor)!.cols;
    expect(runCandidateTableCommand(editor, { type: 'deleteColumn' })).toBe(true);
    expect(readTableContext(editor)?.cols).toBe(colsBeforeDelete - 1);
    expect(editor.commands.undo()).toBe(true);
    expect(readTableContext(editor)?.cols).toBe(colsBeforeDelete);

    expect(runCandidateTableCommand(editor, { type: 'deleteTable' })).toBe(true);
    expect(readTableContext(editor)).toBeNull();
    expect(editor.commands.undo()).toBe(true);
    expect(readTableContext(editor)).not.toBeNull();
    editor.destroy();
  });
});

describe('M6.4B regression', () => {
  it('63-67. images/math/links + fail-closed + zero-write hydration', () => {
    const image = '::img::abc123::"alt"::';
    const math = '~nb1:["paragraph","3/5",[{"s":0,"e":3,"t":"m"}],null]';
    const link = '~nb1:["paragraph","go",[{"s":0,"e":2,"t":"a","v":"https://example.com"}],null]';
    const aligned = '~nb1:["paragraph","x",[],null,"center"]';
    for (const body of [image, math, link, aligned]) {
      expect(encodeNotebookTextV1(decodeNotebookTextV1(body))).toBe(body);
      const editor = ed(body);
      expect(tiptapDocToBody(editor.getJSON(), 1)).toBe(body);
      editor.destroy();
    }

    // M6.4A fail-closed still throws
    expect(() =>
      tiptapDocToBody(
        {
          type: 'doc',
          content: [
            {
              type: 'nbTable',
              content: [
                {
                  type: 'nbTableRow',
                  content: [
                    {
                      type: 'nbTableHeader',
                      content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'H' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        1,
      ),
    ).toThrow();

    const onUpdate = vi.fn();
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc(tableBody([[{ t: 'A' }]]), 1),
      onUpdate,
    });
    expect(onUpdate).not.toHaveBeenCalled();
    editor.commands.setContent(bodyToTiptapDoc(tableBody([[{ t: 'A' }]]), 1), { emitUpdate: false });
    expect(onUpdate).not.toHaveBeenCalled();
    editor.destroy();
  });
});
