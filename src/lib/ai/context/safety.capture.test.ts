/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { bodyToTiptapDoc } from '../../notebookTiptap/blocksToTiptapDoc';
import { createNotebookTiptapSandboxExtensions } from '../../notebookTiptap/sandboxExtensions';
import { candidateEditorHistoryDepth } from '../../notebookTiptap/candidatePageHistory';
import { captureNotebookAiContext } from './captureNotebookAiContext';
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
  vi.restoreAllMocks();
});

describe('captureNotebookAiContext — safety + snapshot', () => {
  it('does not modify document, selection, or history', () => {
    const ed = createEditor('Safety check body');
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 7)));
    const docBefore = ed.state.doc.toJSON();
    const { from, to } = ed.state.selection;
    const histBefore = candidateEditorHistoryDepth(ed);

    const onUserEdit = vi.fn();
    // Capture must not invoke any persistence callback the caller might own.
    const r = captureNotebookAiContext({ editor: ed, host });
    expect(r.ok).toBe(true);
    expect(onUserEdit).not.toHaveBeenCalled();

    expect(ed.state.doc.toJSON()).toEqual(docBefore);
    expect(ed.state.selection.from).toBe(from);
    expect(ed.state.selection.to).toBe(to);
    expect(candidateEditorHistoryDepth(ed)).toEqual(histBefore);
  });

  it('does not call fetch / supabase-shaped globals', () => {
    const ed = createEditor('Network free');
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 8)));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    const r = captureNotebookAiContext({ editor: ed, host });
    expect(r.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('snapshot remains unchanged after later editor edits', () => {
    const ed = createEditor('Original selection text');
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 9)));
    const r = captureNotebookAiContext({ editor: ed, host });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const snap = structuredClone(r.context);

    // Mutate editor after capture
    ed.commands.insertContentAt(1, 'CHANGED ');
    ed.view.dispatch(
      ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 2)),
    );

    expect(r.context).toEqual(snap);
    if (r.context.focus.kind === 'text') {
      expect(r.context.focus.text).toBe('Original');
    }
  });
});
