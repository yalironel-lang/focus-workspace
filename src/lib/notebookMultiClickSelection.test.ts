/**
 * Multi-click / document selection helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  buildDocumentPlainFromBlocks,
  classifyClickDetail,
  isCopyableTextBlockKind,
  selectLogicalBlock,
  selectNotebookDocument,
} from './notebookMultiClickSelection';
import { getSelectionOffsetsIn } from './notebookCaret';

describe('classifyClickDetail', () => {
  it('A: detail 1 = caret', () => {
    expect(classifyClickDetail(1)).toBe('caret');
  });
  it('B: detail 2 = word', () => {
    expect(classifyClickDetail(2)).toBe('word');
  });
  it('C: detail 3 = block', () => {
    expect(classifyClickDetail(3)).toBe('block');
  });
  it('E: detail 4+ = document', () => {
    expect(classifyClickDetail(4)).toBe('document');
    expect(classifyClickDetail(5)).toBe('document');
  });
});

describe('buildDocumentPlainFromBlocks', () => {
  it('G: joins text blocks with newlines; skips non-text', () => {
    const plain = buildDocumentPlainFromBlocks([
      { id: 'a', kind: 'paragraph', text: 'Hello' },
      { id: 'd', kind: 'divider' },
      { id: 'b', kind: 'paragraph', text: 'World' },
      { id: 'h', kind: 'handwriting' },
    ]);
    expect(plain).toBe('Hello\nWorld');
  });
});

describe('selectLogicalBlock / selectNotebookDocument', () => {
  it('C/D: logical block select is full plain length (not visual wrap)', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.setAttribute('data-rich-editable', '1');
    el.setAttribute('data-block-id', 'b1');
    const text =
      'This is a very long paragraph that visually wraps onto three screen lines.';
    el.textContent = text;
    document.body.appendChild(el);
    const { start, end } = selectLogicalBlock(el, text.length);
    expect(start).toBe(0);
    expect(end).toBe(text.length);
    const offsets = getSelectionOffsetsIn(el);
    expect(offsets?.start).toBe(0);
    expect(offsets?.end).toBe(text.length);
    el.remove();
  });

  it('E: document select spans first→last editable', () => {
    const root = document.createElement('div');
    const a = document.createElement('div');
    a.contentEditable = 'true';
    a.setAttribute('data-rich-editable', '1');
    a.setAttribute('data-block-id', 'a');
    a.textContent = 'Alpha';
    const b = document.createElement('div');
    b.contentEditable = 'true';
    b.setAttribute('data-rich-editable', '1');
    b.setAttribute('data-block-id', 'b');
    b.textContent = 'Beta';
    root.append(a, b);
    document.body.appendChild(root);

    const doc = selectNotebookDocument(root, [
      { id: 'a', kind: 'paragraph', text: 'Alpha' },
      { id: 'b', kind: 'paragraph', text: 'Beta' },
    ]);
    expect(doc?.documentPlain).toBe('Alpha\nBeta');
    expect(doc?.blockIds).toEqual(['a', 'b']);
    expect(doc?.firstBlockId).toBe('a');
    expect(doc?.lastBlockId).toBe('b');
    root.remove();
  });

  it('isCopyableTextBlockKind filters media/dividers', () => {
    expect(isCopyableTextBlockKind('paragraph')).toBe(true);
    expect(isCopyableTextBlockKind('divider')).toBe(false);
    expect(isCopyableTextBlockKind('handwriting')).toBe(false);
  });
});
