/**
 * M7.7 — Link product UX: Apply click vs Enter parity + Open Link + portal chrome.
 *
 * Repro root cause: portaled link popover was dismissed by document pointerdown
 * capture before Apply/Open click could run. Enter bypassed that path.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { encodeNotebookTextV1 } from '../notebookTextCodec';
import { readCandidateFormatState } from './candidateFormatCommands';
import { tiptapDocToBody } from './tiptapDocToBody';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { openNotebookLink } from './openNotebookLink';

let testRoot: Root | null = null;
let testHost: HTMLDivElement | null = null;

function mount(el: ReactElement) {
  testHost = document.createElement('div');
  document.body.appendChild(testHost);
  testRoot = createRoot(testHost);
  act(() => {
    testRoot!.render(el);
  });
}

afterEach(() => {
  if (testRoot && testHost) {
    act(() => {
      testRoot?.unmount();
    });
    testHost.remove();
    testRoot = null;
    testHost = null;
  }
  vi.restoreAllMocks();
});

function fireGesture(element: Element) {
  act(() => {
    element.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
    );
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    element.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }),
    );
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function linkMarkOnRange(editor: Editor, from: number, to: number, href: string): boolean {
  let hasLink = false;
  editor.state.doc.nodesBetween(from, to, node => {
    if (
      node.isText &&
      node.marks.some(m => m.type.name === 'link' && m.attrs.href === href)
    ) {
      hasLink = true;
    }
  });
  return hasLink;
}

async function mountWithBody(body: string, pageKey: string, codecVersion?: number) {
  let editor: Editor | null = null;
  mount(
    createElement(NotebookTiptapCandidateEditor, {
      sourceDocumentBody: body,
      sourceBodyCodecVersion: codecVersion,
      pageKey,
      onUserEdit: () => {},
      onEditorReady: ed => {
        editor = ed;
      },
    }),
  );
  await vi.waitFor(() => expect(editor).toBeTruthy());
  return editor!;
}

async function openLinkPopoverOnRange(editor: Editor, from: number, to: number) {
  act(() => {
    editor.commands.setTextSelection({ from, to });
  });
  const linkBtn = document.querySelector('[data-nb-candidate-fmt="link"]');
  expect(linkBtn).toBeTruthy();
  fireGesture(linkBtn!);
  await vi.waitFor(() =>
    expect(document.querySelector('[data-nb-candidate-link-popover="1"]')).toBeTruthy(),
  );
}

describe('M7.7 link product Apply / Open / Remove', () => {
  it('A. select OpenAI → Link → https://openai.com → CLICK Apply (pointerdown path)', async () => {
    const editor = await mountWithBody('Hello OpenAI world', 'm77-link-a');
    // "OpenAI" starts after "Hello " → positions 7..13 in PM (1-based text in para)
    await openLinkPopoverOnRange(editor, 7, 13);

    const input = document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]')!;
    act(() => {
      setInputValue(input, 'https://openai.com');
    });

    const applyBtn = document.querySelector('[data-nb-candidate-link-apply="1"]')!;
    // Full pointerdown-first gesture — this is what dismissed the portaled popover before.
    fireGesture(applyBtn);

    expect(linkMarkOnRange(editor, 7, 13, 'https://openai.com')).toBe(true);
    expect(editor.state.doc.textContent).toBe('Hello OpenAI world');
    expect(document.querySelector('[data-nb-candidate-link-popover="1"]')).toBeNull();
  });

  it('B. same flow via Enter is equivalent', async () => {
    const editor = await mountWithBody('Hello OpenAI world', 'm77-link-b');
    await openLinkPopoverOnRange(editor, 7, 13);
    const input = document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]')!;
    act(() => {
      setInputValue(input, 'https://openai.com');
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    expect(linkMarkOnRange(editor, 7, 13, 'https://openai.com')).toBe(true);
    expect(editor.state.doc.textContent).toBe('Hello OpenAI world');
  });

  it('C. Edit URL → CLICK Apply updates href', async () => {
    const body = encodeNotebookTextV1([
      {
        kind: 'paragraph',
        text: 'OpenAI rocks',
        marks: [{ s: 0, e: 6, t: 'a', v: 'https://old.example' }],
      },
    ]);
    const editor = await mountWithBody(body, 'm77-link-c', 1);
    await openLinkPopoverOnRange(editor, 1, 7);

    const input = document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]')!;
    expect(input.value).toContain('old.example');
    act(() => {
      setInputValue(input, 'https://openai.com');
    });
    fireGesture(document.querySelector('[data-nb-candidate-link-apply="1"]')!);

    expect(linkMarkOnRange(editor, 1, 7, 'https://openai.com')).toBe(true);
    expect(linkMarkOnRange(editor, 1, 7, 'https://old.example')).toBe(false);
    expect(editor.state.doc.textContent).toBe('OpenAI rocks');
  });

  it('D. Remove Link clears mark, preserves text', async () => {
    const body = encodeNotebookTextV1([
      {
        kind: 'paragraph',
        text: 'OpenAI rocks',
        marks: [{ s: 0, e: 6, t: 'a', v: 'https://openai.com' }],
      },
    ]);
    const editor = await mountWithBody(body, 'm77-link-d', 1);
    await openLinkPopoverOnRange(editor, 1, 7);
    fireGesture(document.querySelector('[data-nb-candidate-link-remove="1"]')!);

    expect(readCandidateFormatState(editor).link).toBe(false);
    expect(editor.state.doc.textContent).toBe('OpenAI rocks');
    expect(linkMarkOnRange(editor, 1, 7, 'https://openai.com')).toBe(false);
  });

  it('E. Explicit Open Link reaches window.open with sanitized href', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as Window);
    const body = encodeNotebookTextV1([
      {
        kind: 'paragraph',
        text: 'OpenAI rocks',
        marks: [{ s: 0, e: 6, t: 'a', v: 'https://openai.com' }],
      },
    ]);
    const editor = await mountWithBody(body, 'm77-link-e', 1);
    const before = JSON.stringify(editor.getJSON());
    await openLinkPopoverOnRange(editor, 1, 7);

    const openBtn = document.querySelector('[data-nb-candidate-link-open="1"]')!;
    fireGesture(openBtn);

    expect(openSpy).toHaveBeenCalledWith('https://openai.com', '_blank', 'noopener,noreferrer');
    expect(JSON.stringify(editor.getJSON())).toBe(before);
  });

  it('F. javascript: never applies or opens', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const editor = await mountWithBody('Hello OpenAI world', 'm77-link-f');
    await openLinkPopoverOnRange(editor, 7, 13);
    const input = document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]')!;
    act(() => {
      setInputValue(input, 'javascript:alert(1)');
    });
    fireGesture(document.querySelector('[data-nb-candidate-link-apply="1"]')!);
    expect(linkMarkOnRange(editor, 7, 13, 'javascript:alert(1)')).toBe(false);
    expect(readCandidateFormatState(editor).link).toBe(false);
    expect(document.querySelector('[data-nb-candidate-link-error="1"]')).toBeTruthy();

    // Open helper itself refuses
    expect(openNotebookLink('javascript:alert(1)')).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('G. pointerdown on Apply does not lose captured range (collapse + click)', async () => {
    const editor = await mountWithBody('Hello OpenAI world', 'm77-link-g');
    await openLinkPopoverOnRange(editor, 7, 13);
    const input = document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]')!;
    act(() => {
      setInputValue(input, 'https://openai.com');
      // Collapse live selection while popover stays open (URL focus quirk).
      editor.commands.setTextSelection(8);
    });
    expect(editor.state.selection.empty).toBe(true);

    fireGesture(document.querySelector('[data-nb-candidate-link-apply="1"]')!);
    expect(linkMarkOnRange(editor, 7, 13, 'https://openai.com')).toBe(true);
  });

  it('H. normal click on linked editor text does not navigate', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const body = encodeNotebookTextV1([
      {
        kind: 'paragraph',
        text: 'OpenAI rocks',
        marks: [{ s: 0, e: 6, t: 'a', v: 'https://openai.com' }],
      },
    ]);
    const editor = await mountWithBody(body, 'm77-link-h', 1);
    await vi.waitFor(() => expect(testHost!.querySelector('a.nb-tiptap-link')).not.toBeNull());
    const a = testHost!.querySelector('a.nb-tiptap-link')!;
    act(() => {
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(openSpy).not.toHaveBeenCalled();
    expect(editor.isDestroyed).toBe(false);
  });

  it('I. refresh/canonical round-trip preserves applied link', async () => {
    const editor = await mountWithBody('Hello OpenAI world', 'm77-link-i');
    await openLinkPopoverOnRange(editor, 7, 13);
    act(() => {
      setInputValue(
        document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]')!,
        'https://openai.com',
      );
    });
    fireGesture(document.querySelector('[data-nb-candidate-link-apply="1"]')!);

    const persisted = tiptapDocToBody(editor.getJSON(), 1);
    expect(persisted).toContain('openai.com');

    // Rehydrate from canonical body
    let editor2: Editor | null = null;
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: persisted,
        sourceBodyCodecVersion: 1,
        pageKey: 'm77-link-i-reopen',
        onEditorReady: ed => {
          editor2 = ed;
        },
      }),
    );
    await vi.waitFor(() => expect(editor2).toBeTruthy());
    act(() => {
      editor2!.commands.setTextSelection({ from: 7, to: 13 });
    });
    expect(readCandidateFormatState(editor2!).link).toBe(true);
    expect(readCandidateFormatState(editor2!).linkHref).toBe('https://openai.com');
    // Round-trip doc still parses
    expect(() => bodyToTiptapDoc(persisted, 1)).not.toThrow();
  });
});
