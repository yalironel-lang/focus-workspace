/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import {
  applyMarkToggle,
  isMarkActiveOnRange,
  parseRichLine,
  type InlineMark,
} from './notebookInlineMarks';
import { serializeBlockText } from './notebookBlockRichText';
import {
  createNotebookFormatHistory,
  type NotebookFormatHistoryEntry,
} from './notebookEditHistory';
import { getSelectionOffsetsIn, setSelectionOffsetsIn } from './notebookCaret';

type SimBlock = {
  id: string;
  text: string;
  marks: InlineMark[];
};

function bodyFor(block: SimBlock): string {
  return serializeBlockText(block.text, block.marks);
}

function applyBlockBody(block: SimBlock, body: string): SimBlock {
  const { plain, marks } = parseRichLine(body);
  return { ...block, text: plain, marks };
}

function sessionFor(block: SimBlock, start: number, end: number) {
  return {
    blockId: block.id,
    start,
    end,
    plain: block.text,
    marks: [...block.marks],
  };
}

function snapshot(
  block: SimBlock,
  start: number,
  end: number,
  toolbarOpen = true,
): NotebookFormatHistoryEntry {
  return {
    body: bodyFor(block),
    session: sessionFor(block, start, end),
    toolbarOpen,
    toolbarAnchor: { top: 10, left: 20, width: 200 },
  };
}

function formatToggle(
  history: ReturnType<typeof createNotebookFormatHistory>,
  block: SimBlock,
  start: number,
  end: number,
  mark: 'b' | 'i' | 'u',
): SimBlock {
  history.pushBeforeFormat(snapshot(block, start, end));
  return { ...block, marks: applyMarkToggle(block.marks, start, end, mark) };
}

function undoFormat(
  history: ReturnType<typeof createNotebookFormatHistory>,
  block: SimBlock,
  start: number,
  end: number,
): SimBlock {
  const restored = history.undo(snapshot(block, start, end));
  expect(restored).not.toBeNull();
  return applyBlockBody(block, restored!.body);
}

function redoFormat(
  history: ReturnType<typeof createNotebookFormatHistory>,
  block: SimBlock,
  start: number,
  end: number,
): SimBlock {
  const restored = history.redo(snapshot(block, start, end));
  expect(restored).not.toBeNull();
  return applyBlockBody(block, restored!.body);
}

function withDom(fn: (win: Window) => void) {
  const win = new Window();
  const g = globalThis as unknown as Record<string, unknown>;
  const prev = {
    window: g.window,
    document: g.document,
    Node: g.Node,
    Range: g.Range,
  };
  g.window = win;
  g.document = win.document;
  g.Node = win.Node;
  g.Range = win.Range;
  try {
    fn(win);
  } finally {
    g.window = prev.window;
    g.document = prev.document;
    g.Node = prev.Node;
    g.Range = prev.Range;
  }
}

describe('notebook format history', () => {
  const start = 0;
  const end = 5;

  it('A: Bold ON → undo → plain', () => {
    const history = createNotebookFormatHistory();
    let block: SimBlock = { id: 'b1', text: 'hello world', marks: [] };
    block = formatToggle(history, block, start, end, 'b');
    expect(isMarkActiveOnRange(block.marks, start, end, 'b')).toBe(true);

    block = undoFormat(history, block, start, end);
    expect(block.marks).toEqual([]);
    expect(block.text).toBe('hello world');
    expect(isMarkActiveOnRange(block.marks, start, end, 'b')).toBe(false);
  });

  it('B: Bold ON → undo → redo → Bold', () => {
    const history = createNotebookFormatHistory();
    let block: SimBlock = { id: 'b1', text: 'hello world', marks: [] };
    block = formatToggle(history, block, start, end, 'b');

    block = undoFormat(history, block, start, end);
    expect(isMarkActiveOnRange(block.marks, start, end, 'b')).toBe(false);

    block = redoFormat(history, block, start, end);
    expect(isMarkActiveOnRange(block.marks, start, end, 'b')).toBe(true);
  });

  it('C: Bold ON → Bold OFF → undo → Bold', () => {
    const history = createNotebookFormatHistory();
    let block: SimBlock = { id: 'b1', text: 'hello world', marks: [] };
    block = formatToggle(history, block, start, end, 'b');
    block = formatToggle(history, block, start, end, 'b');
    expect(isMarkActiveOnRange(block.marks, start, end, 'b')).toBe(false);

    block = undoFormat(history, block, start, end);
    expect(isMarkActiveOnRange(block.marks, start, end, 'b')).toBe(true);
  });

  it('D/E: Bold → Italic → Underline → three undos then three redos', () => {
    const history = createNotebookFormatHistory();
    let block: SimBlock = { id: 'b1', text: 'hello world', marks: [] };

    block = formatToggle(history, block, start, end, 'b');
    block = formatToggle(history, block, start, end, 'i');
    block = formatToggle(history, block, start, end, 'u');

    expect(isMarkActiveOnRange(block.marks, start, end, 'b')).toBe(true);
    expect(isMarkActiveOnRange(block.marks, start, end, 'i')).toBe(true);
    expect(isMarkActiveOnRange(block.marks, start, end, 'u')).toBe(true);

    block = undoFormat(history, block, start, end);
    expect(isMarkActiveOnRange(block.marks, start, end, 'u')).toBe(false);
    expect(isMarkActiveOnRange(block.marks, start, end, 'i')).toBe(true);

    block = undoFormat(history, block, start, end);
    expect(isMarkActiveOnRange(block.marks, start, end, 'i')).toBe(false);
    expect(isMarkActiveOnRange(block.marks, start, end, 'b')).toBe(true);

    block = undoFormat(history, block, start, end);
    expect(block.marks).toEqual([]);

    block = redoFormat(history, block, start, end);
    expect(isMarkActiveOnRange(block.marks, start, end, 'b')).toBe(true);
    block = redoFormat(history, block, start, end);
    expect(isMarkActiveOnRange(block.marks, start, end, 'i')).toBe(true);
    block = redoFormat(history, block, start, end);
    expect(isMarkActiveOnRange(block.marks, start, end, 'u')).toBe(true);
  });

  it('F: undo preserves text content', () => {
    const history = createNotebookFormatHistory();
    let block: SimBlock = { id: 'b1', text: 'Customer Value', marks: [] };
    block = formatToggle(history, block, 0, 8, 'b');
    block = undoFormat(history, block, 0, 8);
    expect(block.text).toBe('Customer Value');
  });

  it('G/H/I: session offsets and selection survive undo', () => {
    withDom(win => {
      const history = createNotebookFormatHistory();
      let block: SimBlock = { id: 'b1', text: 'hello world', marks: [] };
      const selStart = 6;
      const selEnd = 11;

      const el = win.document.createElement('div');
      el.setAttribute('data-rich-editable', '1');
      el.contentEditable = 'true';
      el.textContent = block.text;
      win.document.body.appendChild(el);

      block = formatToggle(history, block, selStart, selEnd, 'b');
      el.textContent = block.text;

      const restored = history.undo(snapshot(block, selStart, selEnd));
      expect(restored?.session?.start).toBe(selStart);
      expect(restored?.session?.end).toBe(selEnd);
      expect(parseRichLine(restored!.body).plain).toBe('hello world');

      setSelectionOffsetsIn(el as unknown as HTMLElement, selStart, selEnd);
      const offsets = getSelectionOffsetsIn(el as unknown as HTMLElement);
      expect(offsets).toEqual({ start: selStart, end: selEnd, collapsed: false });

      const copyText = block.text.slice(selStart, selEnd);
      expect(copyText).toBe('world');

      const newStart = 0;
      const newEnd = 5;
      setSelectionOffsetsIn(el as unknown as HTMLElement, newStart, newEnd);
      const nextOffsets = getSelectionOffsetsIn(el as unknown as HTMLElement);
      expect(nextOffsets).toEqual({ start: newStart, end: newEnd, collapsed: false });
    });
  });

  it('one formatting action creates one undo entry', () => {
    const history = createNotebookFormatHistory();
    const block: SimBlock = { id: 'b1', text: 'hello', marks: [] };
    formatToggle(history, block, 0, 5, 'b');
    expect(history.undoDepth()).toBe(1);
    formatToggle(history, { ...block, marks: applyMarkToggle([], 0, 5, 'b') }, 0, 5, 'i');
    expect(history.undoDepth()).toBe(2);
    expect(history.redoDepth()).toBe(0);
  });
});
