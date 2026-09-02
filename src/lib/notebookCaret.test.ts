/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import {
  findTextPointIn,
  getSelectionOffsetsIn,
  setSelectionOffsetsIn,
} from './notebookCaret';

function mountLine(html: string): HTMLElement {
  const el = document.createElement('div');
  el.contentEditable = 'true';
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

describe('notebookCaret formatted DOM offsets', () => {
  it('findTextPointIn walks nested <strong>/<em> text nodes', () => {
    const el = mountLine('a<strong>bcde</strong>f');
    expect(findTextPointIn(el, 0)?.offset).toBe(0);
    expect(findTextPointIn(el, 1)?.offset).toBe(1);
    const mid = findTextPointIn(el, 3);
    expect(mid?.node.textContent).toBe('bcde');
    expect(mid?.offset).toBe(2);
    expect(findTextPointIn(el, 5)?.node.textContent).toBe('bcde');
    expect(findTextPointIn(el, 5)?.offset).toBe(4);
    expect(findTextPointIn(el, 6)?.node.textContent).toBe('f');
    expect(findTextPointIn(el, 6)?.offset).toBe(1);
    el.remove();
  });

  it('setSelectionOffsetsIn restores logical range [1,5] across split nodes', () => {
    const el = mountLine('a<strong>bcde</strong>f');
    setSelectionOffsetsIn(el, 1, 5);
    const offsets = getSelectionOffsetsIn(el);
    expect(offsets).toEqual({ start: 1, end: 5, collapsed: false });
    expect(window.getSelection()?.toString()).toBe('bcde');
    el.remove();
  });

  it('setSelectionOffsetsIn restores subrange inside strong only', () => {
    const el = mountLine('a<strong>bcde</strong>f');
    setSelectionOffsetsIn(el, 2, 4);
    const offsets = getSelectionOffsetsIn(el);
    expect(offsets).toEqual({ start: 2, end: 4, collapsed: false });
    expect(window.getSelection()?.toString()).toBe('cd');
    el.remove();
  });

  it('setSelectionOffsetsIn handles doubly nested marks', () => {
    const el = mountLine('x<strong>b<em>cd</em>e</strong>y');
    setSelectionOffsetsIn(el, 1, 5);
    const offsets = getSelectionOffsetsIn(el);
    expect(offsets?.start).toBe(1);
    expect(offsets?.end).toBe(5);
    expect(window.getSelection()?.toString()).toBe('bcde');
    el.remove();
  });

  it('round-trip plain single text node', () => {
    const el = mountLine('abcdef');
    setSelectionOffsetsIn(el, 2, 5);
    expect(getSelectionOffsetsIn(el)).toEqual({ start: 2, end: 5, collapsed: false });
    el.remove();
  });
});
