import type { Editor } from '@tiptap/core';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { parseNotebookBody, serializeNotebookBlocks } from '../notebookDialect';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
vi.mock('../notebookHandwritingCloud', () => ({ hydrateHandwritingWithCloud: vi.fn().mockResolvedValue(undefined), reconcileHandwritingWithCloud: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'test-user' } }) }));
const { ProjectNotebookBlock } = await import('../../components/project-space/ProjectNotebookBlock');
const literal = '# literal ⟨m⟩[{"s":0,"e":1,"t":"b"}]⟨/m⟩ שלום ~nb1:\\n';
const body = serializeNotebookBlocks([{ id: 'p', kind: 'paragraph', text: literal, marks: [{ s: 0, e: 1, t: 'b' }] }], 1);
let root: Root | undefined; let host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = undefined; host = undefined; vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function mount(element: ReturnType<typeof createElement>) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root!.render(element));
}
it('legacy reader displays decoded literal mark envelopes and never saves on open', async () => {
  // M7.1A+: TipTap is default ON; force legacy CE to exercise the versioned CE reader path.
  vi.stubEnv('VITE_NOTEBOOK_LEGACY_CE', 'true');
  const onChange = vi.fn();
  mount(createElement(ProjectNotebookBlock, {
    content: { type: 'notebook', body, bodyCodecVersion: 1, notebookMode: 'normal' },
    tokens: { textPrimary: '#fff', textMuted: '#999', accent: '#aaa' } as AtmosphereTokens,
    onChange, presentation: 'notebook',
  }));
  expect(host!.textContent).toContain(literal);
  expect(host!.textContent).not.toContain('~nb1:["paragraph"');
  // ContentEditable editing surface is not mounted for versioned pages under CE rollback
  expect(host!.querySelector('[data-nb-editor-root="1"]')).toBeNull();
  expect(host!.querySelector('[data-nb-editor-root="1"] [contenteditable="true"]')).toBeNull();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)); });
  expect(onChange).not.toHaveBeenCalled();
});
it('versioned candidate loads literal text with marks and remains memory-only', async () => {
  const onReady = vi.fn(); const onSnapshot = vi.fn(); const onEditorReady = vi.fn();
  const write = vi.spyOn(Storage.prototype, 'setItem'); const open = vi.spyOn(indexedDB, 'open');
  mount(createElement(NotebookTiptapCandidateEditor, { sourceDocumentBody: body, sourceBodyCodecVersion: 1, pageKey: 'versioned', onReady, onSnapshot, onEditorReady }));
  await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
  expect(onReady.mock.calls[0][0]).toMatchObject({ persistence: false, editable: true });
  await vi.waitFor(() => expect(host!.querySelector('.tiptap')?.textContent).toContain(literal));
  expect(host!.querySelector('[data-nb-candidate-persistence="never"]')).toBeTruthy();
  expect(onSnapshot).toHaveBeenCalled();
  const editor = onEditorReady.mock.calls.at(-1)![0] as Editor;
  act(() => { editor.commands.setTextSelection(1); editor.commands.insertContent('--- '); });
  const snapshot = onSnapshot.mock.calls.at(-1)![0];
  expect(parseNotebookBody(snapshot.body, 1)[0]).toMatchObject({ kind: 'paragraph', text: `--- ${literal}` });
  expect(write).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
});
