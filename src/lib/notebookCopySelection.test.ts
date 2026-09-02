import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { applyMarkToggle } from './notebookInlineMarks';
import { getSelectionOffsetsIn } from './notebookCaret';
import {
  buildNotebookCopyText,
  getRangeOffsetsIn,
} from './notebookCopySelection';

function withDom(fn: (window: Window) => void) {
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

function richLine(win: Window, id: string, html: string) {
  const el = win.document.createElement('div');
  el.setAttribute('data-rich-editable', '1');
  el.setAttribute('data-block-id', id);
  el.contentEditable = 'true';
  el.innerHTML = html;
  return el;
}

function selectOffsets(win: Window, el: HTMLElement, start: number, end: number) {
  const range = win.document.createRange();
  let remS = start;
  let remE = end;
  let startSet = false;
  const walk = (node: Node): boolean => {
    if (node.nodeType === 3) {
      const len = node.textContent?.length ?? 0;
      if (!startSet) {
        if (remS <= len) {
          range.setStart(node, remS);
          startSet = true;
          remE = end - start + remS;
          if (remE <= len) {
            range.setEnd(node, remE);
            return true;
          }
          remE -= len;
          return false;
        }
        remS -= len;
        remE -= len;
        return false;
      }
      if (remE <= len) {
        range.setEnd(node, remE);
        return true;
      }
      remE -= len;
      return false;
    }
    if (node.nodeType === 1) {
      for (let i = 0; i < node.childNodes.length; i += 1) {
        if (walk(node.childNodes[i]!)) return true;
      }
    }
    return false;
  };
  walk(el);
  const sel = win.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  return sel.toString();
}

describe('notebookCopySelection', () => {
  it('A: partial paragraph copies exactly selected text', () => {
    withDom(win => {
      const root = win.document.createElement('div');
      const plain = "Customer's Value proposition";
      const el = richLine(win, 'b1', "<strong>Customer</strong>'s Value proposition");
      root.appendChild(el);
      selectOffsets(win, el, 0, 16);
      const offsets = getSelectionOffsetsIn(el);
      expect(offsets).toEqual({ start: 0, end: 16, collapsed: false });
      const copied = buildNotebookCopyText(root, [{ id: 'b1', kind: 'paragraph', text: plain }], win.getSelection()!.getRangeAt(0));
      expect(copied).toBe("Customer's Value");
    });
  });

  it('B: selection ending mid-paragraph does not include trailing text', () => {
    withDom(win => {
      const root = win.document.createElement('div');
      const plain = 'Alpha beta gamma delta';
      const el = richLine(win, 'b1', 'Alpha beta gamma delta');
      root.appendChild(el);
      selectOffsets(win, el, 0, 10);
      const copied = buildNotebookCopyText(root, [{ id: 'b1', kind: 'paragraph', text: plain }], win.getSelection()!.getRangeAt(0));
      expect(copied).toBe('Alpha beta');
      expect(copied).not.toContain('gamma');
    });
  });

  it('C: multi-block selection includes only selected range', () => {
    withDom(win => {
      const root = win.document.createElement('div');
      const el1 = richLine(win, 'b1', 'First line tail');
      const el2 = richLine(win, 'b2', 'Second line end');
      root.append(el1, el2);
      const range = win.document.createRange();
      range.setStart(el1.firstChild!, 6);
      range.setEnd(el2.firstChild!, 6);
      win.getSelection()!.removeAllRanges();
      win.getSelection()!.addRange(range);
      const copied = buildNotebookCopyText(
        root,
        [
          { id: 'b1', kind: 'paragraph', text: 'First line tail' },
          { id: 'b2', kind: 'paragraph', text: 'Second line end' },
        ],
        range,
      );
      expect(copied).toBe('line tail\nSecond');
    });
  });

  it('getRangeOffsetsIn matches getSelectionOffsetsIn for in-block ranges', () => {
    withDom(win => {
      const el = richLine(win, 'b1', 'Hello world');
      selectOffsets(win, el, 0, 5);
      const range = win.getSelection()!.getRangeAt(0);
      expect(getRangeOffsetsIn(el, range)).toEqual({ start: 0, end: 5 });
    });
  });

  it('D: formatting command updates marks for selected range', () => {
    const plain = "Customer's Value proposition";
    const start = 0;
    const end = 16;
    const beforeMarks: ReturnType<typeof applyMarkToggle>[] = [];
    const afterMarks = applyMarkToggle(beforeMarks, start, end, 'b');
    expect(afterMarks).toEqual([{ s: 0, e: 16, t: 'b' }]);
    expect(plain.slice(start, end)).toBe("Customer's Value");
    const toggledOff = applyMarkToggle(afterMarks, start, end, 'b');
    expect(toggledOff).toEqual([]);
  });
});
