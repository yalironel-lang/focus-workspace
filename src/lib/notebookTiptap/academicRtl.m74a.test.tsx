/**
 * M7.4A — Academic Auto/RTL: logical-start accent must follow content direction.
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import {
  insertCandidateBlockAtTarget,
  runCandidateBlockCommand,
} from './candidateBlockCommands';
import {
  notebookChromeAwareDirWrapperProps,
  resolveEffectiveDir,
} from './direction';

const HE = 'האינפלציה היא עלייה מתמשכת ברמת המחירים הכללית.';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(el: ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(el);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
});

function makeEditor(body: string) {
  return new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content: bodyToTiptapDoc(body),
    editable: true,
  });
}

describe('notebookChromeAwareDirWrapperProps', () => {
  it('Auto + Hebrew → visual rtl (chrome label must not pin LTR)', () => {
    const d = notebookChromeAwareDirWrapperProps('auto', HE);
    expect(d['data-nb-dir']).toBe('auto');
    expect(d['data-nb-effective-dir']).toBe('rtl');
    expect(d.dir).toBe('rtl');
    expect(d.style.direction).toBe('rtl');
  });

  it('Auto + English → visual ltr', () => {
    const d = notebookChromeAwareDirWrapperProps('auto', 'Inflation is a sustained rise.');
    expect(d['data-nb-dir']).toBe('auto');
    expect(d.dir).toBe('ltr');
    expect(d.style.direction).toBe('ltr');
  });

  it('explicit LTR/RTL override Auto content', () => {
    expect(notebookChromeAwareDirWrapperProps('ltr', HE).dir).toBe('ltr');
    expect(notebookChromeAwareDirWrapperProps('rtl', 'Hello').dir).toBe('rtl');
  });
});

describe('M7.4A academic Auto RTL — product editor', () => {
  it('empty academic → type Hebrew → Auto resolves RTL + accent follows logical start', async () => {
    let editor: Editor | null = null;
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: '',
        pageKey: 'rtl-academic',
        onReady,
        onEditorReady: ed => {
          editor = ed;
        },
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await vi.waitFor(() => expect(editor).toBeTruthy());

    act(() => {
      expect(insertCandidateBlockAtTarget(editor!, 'callout:definition')).toBe(true);
    });
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb-academic-type="definition"]')).toBeTruthy(),
    );

    const emptyWrap = host!.querySelector('[data-nb="nbCallout"]') as HTMLElement;
    expect(emptyWrap.getAttribute('data-nb-dir')).toBe('auto');
    expect(emptyWrap.getAttribute('data-nb-effective-dir')).toBe('ltr');
    expect(emptyWrap.style.borderInlineStart).toContain('2px solid');
    expect(emptyWrap.style.direction).toBe('ltr');

    act(() => {
      editor!.commands.insertContent(HE);
    });

    await vi.waitFor(() => {
      const wrap = host!.querySelector('[data-nb="nbCallout"]') as HTMLElement;
      expect(wrap.getAttribute('data-nb-dir')).toBe('auto');
      expect(wrap.getAttribute('data-nb-effective-dir')).toBe('rtl');
      expect(wrap.getAttribute('dir')).toBe('rtl');
      expect(wrap.style.direction).toBe('rtl');
    });

    // Logical-start accent still declared; physical edge follows CSS direction=rtl.
    const wrap = host!.querySelector('[data-nb="nbCallout"]') as HTMLElement;
    expect(wrap.style.borderInlineStart).toMatch(/2px solid/);
    expect(wrap.style.borderInlineEnd || '').not.toMatch(/2px solid/);
    let calloutText = '';
    editor!.state.doc.forEach(node => {
      if (node.type.name === 'nbCallout') calloutText = node.textContent;
    });
    expect(calloutText).toContain('האינפלציה');
    expect(resolveEffectiveDir('auto', calloutText)).toBe('rtl');
    // Persisted attr remains Auto — no fake explicit rtl write.
    editor!.state.doc.forEach(node => {
      if (node.type.name === 'nbCallout') {
        expect(node.attrs.dir ?? 'auto').toBe('auto');
      }
    });
    const body = tiptapDocToBody(editor!.getJSON());
    expect(body).toContain('!definition');
    expect(body).toContain('האינפלציה');
    expect(body).not.toMatch(/"type"\s*:\s*"doc"/);
  });

  it('English Auto academic stays LTR; explicit RTL/LTR override', async () => {
    let editor: Editor | null = null;
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: '!definition Inflation rises over time.',
        pageKey: 'ltr-academic',
        onReady,
        onEditorReady: ed => {
          editor = ed;
        },
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb-effective-dir="ltr"]')).toBeTruthy(),
    );
    const autoEn = host!.querySelector('[data-nb="nbCallout"]') as HTMLElement;
    expect(autoEn.getAttribute('data-nb-dir')).toBe('auto');
    expect(autoEn.style.direction).toBe('ltr');

    act(() => {
      editor!
        .chain()
        .focus()
        .updateAttributes('nbCallout', { dir: 'rtl' })
        .run();
    });
    await vi.waitFor(() => {
      const el = host!.querySelector('[data-nb="nbCallout"]') as HTMLElement;
      expect(el.getAttribute('data-nb-dir')).toBe('rtl');
      expect(el.getAttribute('dir')).toBe('rtl');
      expect(el.style.direction).toBe('rtl');
    });

    act(() => {
      editor!
        .chain()
        .focus()
        .updateAttributes('nbCallout', { dir: 'ltr' })
        .run();
    });
    await vi.waitFor(() => {
      const el = host!.querySelector('[data-nb="nbCallout"]') as HTMLElement;
      expect(el.getAttribute('data-nb-dir')).toBe('ltr');
      expect(el.style.direction).toBe('ltr');
    });
  });

  it('tone conversion preserves Auto dir + Hebrew effective RTL; serialize lossless', () => {
    const ed = makeEditor(`!definition ${HE}`);
    expect(ed.state.doc.child(0).attrs.dir ?? 'auto').toBe('auto');
    expect(resolveEffectiveDir('auto', ed.state.doc.child(0).textContent)).toBe('rtl');

    ed.commands.setTextSelection(1);
    expect(runCandidateBlockCommand(ed, 'callout:summary')).toBe(true);
    expect(ed.state.doc.child(0).attrs.tone).toBe('summary');
    expect(ed.state.doc.child(0).attrs.dir ?? 'auto').toBe('auto');
    expect(ed.state.doc.child(0).textContent).toBe(HE);

    expect(runCandidateBlockCommand(ed, 'callout:concept')).toBe(true);
    expect(ed.state.doc.child(0).attrs.tone).toBe('concept');
    expect(ed.state.doc.child(0).textContent).toBe(HE);

    const out = tiptapDocToBody(ed.getJSON());
    expect(out.startsWith('!concept ')).toBe(true);
    expect(out).toContain(HE);
    expect(out).not.toMatch(/"type"\s*:\s*"doc"/);
    expect(hasNoFakeAlignPersist(out)).toBe(true);
    ed.destroy();
  });
});

function hasNoFakeAlignPersist(body: string): boolean {
  return !/"align"\s*:\s*"rtl"/.test(body) && !/align=rtl/.test(body);
}
