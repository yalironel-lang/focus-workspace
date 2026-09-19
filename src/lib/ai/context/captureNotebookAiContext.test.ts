/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { bodyToTiptapDoc } from '../../notebookTiptap/blocksToTiptapDoc';
import { createNotebookTiptapSandboxExtensions } from '../../notebookTiptap/sandboxExtensions';
import { runCandidateFormatCommand } from '../../notebookTiptap/candidateFormatCommands';
import { createNotebookTableJson } from '../../notebookTiptap/tableCommands';
import { captureNotebookAiContext } from './captureNotebookAiContext';
import type { CaptureNotebookAiContextHost } from './types';

const activeEditors: Editor[] = [];

function createEditor(body: string, codecVersion?: number) {
  const isV1 = body.startsWith('~nb1:') || body.includes('\n~nb1:');
  const doc = bodyToTiptapDoc(body, codecVersion ?? (isV1 ? 1 : undefined));
  const editor = new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content: doc,
  });
  activeEditors.push(editor);
  return editor;
}

function host(overrides?: Partial<CaptureNotebookAiContextHost>): CaptureNotebookAiContextHost {
  return {
    userId: 'user-1',
    sectionId: 'section-1',
    sectionTitle: 'Linear Algebra',
    notebookObjectId: 'ps-notebook-1',
    pageId: 'page-1',
    pageKey: 'page-1',
    ...overrides,
  };
}

function findNodePos(editor: Editor, typeName: string): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found == null && node.type.name === typeName) found = pos;
    return found == null;
  });
  return found;
}

afterEach(() => {
  while (activeEditors.length) {
    activeEditors.pop()?.destroy();
  }
});

describe('captureNotebookAiContext — selection + identity', () => {
  it('captures text selection inside a paragraph', () => {
    const ed = createEditor('Select me please');
    const start = 1;
    ed.view.dispatch(
      ed.state.tr.setSelection(TextSelection.create(ed.state.doc, start, start + 'Select'.length)),
    );
    const r = captureNotebookAiContext({ editor: ed, host: host() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.focus).toMatchObject({
      kind: 'text',
      text: 'Select',
      blockKind: 'paragraph',
    });
    expect(r.context.identity.userId).toBe('user-1');
    expect(r.context.academic.sectionId).toBe('section-1');
    expect(r.context.academic.sectionTitle).toBe('Linear Algebra');
    expect(r.context.surface).toEqual({
      type: 'notebook',
      notebookObjectId: 'ps-notebook-1',
      pageId: 'page-1',
      pageKey: 'page-1',
    });
    expect(r.context.version).toBe(1);
    expect(typeof r.context.capturedAt).toBe('string');
    expect(JSON.parse(JSON.stringify(r.context))).toEqual(r.context);
    expect('editor' in r.context).toBe(false);
  });

  it('empty selection yields focus.kind empty with surroundings', () => {
    const ed = createEditor('Caret here');
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1)));
    const r = captureNotebookAiContext({ editor: ed, host: host() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.focus).toEqual({ kind: 'empty' });
    expect(r.context.surroundings.blocks.some(b => b.role === 'current')).toBe(true);
  });

  it('first block has no previous; last block has no next', () => {
    const ed = createEditor('Alpha\nBeta\nGamma');
    expect(ed.state.doc.childCount).toBe(3);

    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 6)));
    const first = captureNotebookAiContext({ editor: ed, host: host() });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.context.surroundings.blocks.map(b => b.role)).toEqual(['current', 'next']);
    expect(first.context.surroundings.blocks[0]?.content).toEqual({ type: 'text', text: 'Alpha' });

    const lastBlock = ed.state.doc.child(2);
    const lastPos = ed.state.doc.content.size - lastBlock.nodeSize + 1;
    ed.view.dispatch(
      ed.state.tr.setSelection(
        TextSelection.create(ed.state.doc, lastPos, lastPos + 'Gamma'.length),
      ),
    );
    const last = captureNotebookAiContext({ editor: ed, host: host() });
    expect(last.ok).toBe(true);
    if (!last.ok) return;
    expect(last.context.surroundings.blocks.map(b => b.role)).toEqual(['previous', 'current']);
  });

  it('block math selection', () => {
    const ed = createEditor('$$ x^2 + y^2');
    expect(ed.state.doc.child(0).type.name).toBe('nbMath');
    const from = 1;
    const to = 1 + 'x^2 + y^2'.length;
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, from, to)));
    const r = captureNotebookAiContext({ editor: ed, host: host() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.focus.kind).toBe('math_block');
    if (r.context.focus.kind === 'math_block') {
      expect(r.context.focus.latex).toContain('x^2');
      expect(r.context.focus.blockKind).toBe('math');
    }
  });

  it('inline math NodeSelection', () => {
    const ed = createEditor('he is worth 3/5 today');
    const start = ed.state.doc.textContent.indexOf('3/5') + 1;
    ed.view.dispatch(
      ed.state.tr.setSelection(TextSelection.create(ed.state.doc, start, start + 3)),
    );
    expect(runCandidateFormatCommand(ed, { type: 'toggleMath' })).toBe(true);
    const mathPos = findNodePos(ed, 'nbInlineMath');
    expect(mathPos).not.toBeNull();
    ed.view.dispatch(
      ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, mathPos!)),
    );
    const r = captureNotebookAiContext({ editor: ed, host: host() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.focus.kind).toBe('math_inline');
    if (r.context.focus.kind === 'math_inline') {
      expect(r.context.focus.latex).toBe('3/5');
    }
  });

  it('image NodeSelection exposes asset key and alt, no binary', () => {
    const ed = createEditor('::img::img-key-1::diagram alt::');
    const pos = findNodePos(ed, 'nbImageRef');
    expect(pos).not.toBeNull();
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, pos!)));
    const r = captureNotebookAiContext({ editor: ed, host: host() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.focus).toMatchObject({
      kind: 'image',
      assetKey: 'img-key-1',
      alt: 'diagram alt',
    });
    const json = JSON.stringify(r.context);
    expect(json).not.toMatch(/data:image|base64|ArrayBuffer|blob:/i);
  });

  it('handwriting NodeSelection exposes asset key only', () => {
    const ed = createEditor('::hw::hw-key-9::');
    const pos = findNodePos(ed, 'nbHandwriting');
    expect(pos).not.toBeNull();
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, pos!)));
    const r = captureNotebookAiContext({ editor: ed, host: host() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.focus).toMatchObject({
      kind: 'handwriting',
      assetKey: 'hw-key-9',
    });
  });

  it('whole table NodeSelection', () => {
    const ed = createEditor('Hello');
    const table = createNotebookTableJson(2, 2);
    ed.commands.setContent({
      type: 'doc',
      content: [table],
    });
    const pos = findNodePos(ed, 'nbTable');
    expect(pos).not.toBeNull();
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, pos!)));
    const r = captureNotebookAiContext({ editor: ed, host: host() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.focus).toMatchObject({
      kind: 'table',
      mode: 'whole_table',
      rows: 2,
      cols: 2,
    });
  });

  it('table cell text selection', () => {
    const table = createNotebookTableJson(2, 2);
    // Put text in first cell
    table.content![0]!.content![0]!.content = [
      {
        type: 'nbParagraph',
        attrs: { dir: 'auto', align: null, variant: null },
        content: [{ type: 'text', text: 'CellA' }],
      },
    ];
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: { type: 'doc', content: [table] },
    });
    activeEditors.push(ed);
    // Find absolute pos of CellA
    let textPos: number | null = null;
    ed.state.doc.descendants((node, pos) => {
      if (textPos == null && node.isText && node.text === 'CellA') textPos = pos;
      return textPos == null;
    });
    expect(textPos).not.toBeNull();
    ed.view.dispatch(
      ed.state.tr.setSelection(TextSelection.create(ed.state.doc, textPos!, textPos! + 5)),
    );
    const r = captureNotebookAiContext({ editor: ed, host: host() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.focus.kind).toBe('table');
    if (r.context.focus.kind === 'table') {
      expect(r.context.focus.mode).toBe('cell_text');
      expect(r.context.focus.text).toBe('CellA');
      expect(r.context.focus.rows).toBe(2);
      expect(r.context.focus.cols).toBe(2);
    }
  });

  it('divider is unsupported', () => {
    const ed = createEditor('---');
    const pos = findNodePos(ed, 'nbDivider');
    expect(pos).not.toBeNull();
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, pos!)));
    const r = captureNotebookAiContext({ editor: ed, host: host() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.focus).toMatchObject({
      kind: 'unsupported',
      reason: 'divider',
    });
  });

  it('rejects missing host fields', () => {
    const ed = createEditor('Hi');
    const r = captureNotebookAiContext({
      editor: ed,
      host: { ...host(), userId: '' },
    });
    expect(r).toEqual({ ok: false, error: 'missing_host' });
  });

  it('rejects destroyed editor', () => {
    const ed = createEditor('Hi');
    ed.destroy();
    const r = captureNotebookAiContext({ editor: ed, host: host() });
    expect(r).toEqual({ ok: false, error: 'editor_destroyed' });
  });
});
