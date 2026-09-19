/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { bodyToTiptapDoc } from '../../notebookTiptap/blocksToTiptapDoc';
import { createNotebookTiptapSandboxExtensions } from '../../notebookTiptap/sandboxExtensions';
import { createNotebookTableJson } from '../../notebookTiptap/tableCommands';
import { MAX_BLOCK_CHARS, MAX_TABLE_PREVIEW_CHARS } from './bounds';
import { captureNotebookAiContext } from './captureNotebookAiContext';
import { extractSurroundings } from './extractSurroundings';
import { normalizeTopLevelBlock } from './normalizeBlock';
import type { CaptureNotebookAiContextHost } from './types';

const activeEditors: Editor[] = [];

function createEditor(body: string) {
  const editor = new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content: bodyToTiptapDoc(body),
  });
  activeEditors.push(editor);
  return editor;
}

const host: CaptureNotebookAiContextHost = {
  userId: 'u',
  sectionId: 's',
  notebookObjectId: 'n',
  pageId: 'p',
  pageKey: 'p',
};

afterEach(() => {
  while (activeEditors.length) activeEditors.pop()?.destroy();
});

describe('extractSurroundings — bounds', () => {
  it('returns at most previous/current/next', () => {
    const ed = createEditor('A\nB\nC\nD\nE');
    expect(ed.state.doc.childCount).toBe(5);
    // Select in middle block C (index 2)
    let posC: number | null = null;
    ed.state.doc.descendants((node, pos) => {
      if (posC == null && node.isText && node.text === 'C') posC = pos;
      return posC == null;
    });
    expect(posC).not.toBeNull();
    ed.view.dispatch(
      ed.state.tr.setSelection(TextSelection.create(ed.state.doc, posC!, posC! + 1)),
    );
    const r = captureNotebookAiContext({ editor: ed, host });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.surroundings.blocks).toHaveLength(3);
    expect(r.context.surroundings.blocks.map(b => b.role)).toEqual([
      'previous',
      'current',
      'next',
    ]);
    const texts = r.context.surroundings.blocks.map(b =>
      b.content.type === 'text' ? b.content.text : '',
    );
    expect(texts).toEqual(['B', 'C', 'D']);
    // Must not include A or E
    expect(texts.join('')).not.toContain('A');
    expect(texts.join('')).not.toContain('E');
  });

  it('truncates long surrounding block text', () => {
    const long = 'x'.repeat(MAX_BLOCK_CHARS + 50);
    const ed = createEditor(long);
    const surr = extractSurroundings(ed.state.doc, 1);
    expect(surr.truncated).toBe(true);
    expect(surr.blocks[0]?.content).toEqual({
      type: 'text',
      text: 'x'.repeat(MAX_BLOCK_CHARS),
    });
  });

  it('truncates table preview', () => {
    const cellText = 't'.repeat(MAX_TABLE_PREVIEW_CHARS + 80);
    const table = createNotebookTableJson(1, 1);
    table.content![0]!.content![0]!.content = [
      {
        type: 'nbParagraph',
        attrs: { dir: 'auto', align: null, variant: null },
        content: [{ type: 'text', text: cellText }],
      },
    ];
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: { type: 'doc', content: [table] },
    });
    activeEditors.push(ed);
    const norm = normalizeTopLevelBlock(ed.state.doc.child(0));
    expect(norm.truncated).toBe(true);
    expect(norm.content.type).toBe('table');
    if (norm.content.type === 'table') {
      expect(norm.content.textPreview.length).toBe(MAX_TABLE_PREVIEW_CHARS);
    }
  });

  it('does not leak the full notebook into surroundings', () => {
    const blocks = Array.from({ length: 40 }, (_, i) => `Block-${i}-payload-UNIQUE`).join('\n');
    const ed = createEditor(blocks);
    // Select block 20
    let pos: number | null = null;
    ed.state.doc.descendants((node, p) => {
      if (pos == null && node.isText && node.text === 'Block-20-payload-UNIQUE') pos = p;
      return pos == null;
    });
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, pos!, pos! + 5)));
    const r = captureNotebookAiContext({ editor: ed, host });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.surroundings.blocks.length).toBe(3);
    const serialized = JSON.stringify(r.context.surroundings);
    expect(serialized).toContain('Block-19-payload-UNIQUE');
    expect(serialized).toContain('Block-20-payload-UNIQUE');
    expect(serialized).toContain('Block-21-payload-UNIQUE');
    expect(serialized).not.toContain('Block-0-payload-UNIQUE');
    expect(serialized).not.toContain('Block-39-payload-UNIQUE');
    expect(serialized).not.toContain('Block-5-payload-UNIQUE');
    // Surroundings payload must stay far smaller than the whole document text.
    expect(serialized.length).toBeLessThan(ed.state.doc.textContent.length / 2);
  });
});
