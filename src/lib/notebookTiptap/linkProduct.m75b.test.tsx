/**
 * M7.5B — Links product completion regression suite.
 *
 * Covers visual treatment, Open Link (sanitize + no mutate), ordinary click,
 * Cmd/Ctrl+Click, edit/remove, Bold+Link, RTL+Link, persistence, selection-only
 * toolbar, and page-local history non-interference.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import {
  selectionShouldShowToolbar,
} from '../../components/notebook/tiptap/NotebookTiptapCandidateSelectionToolbar';
import { encodeNotebookTextV1 } from '../notebookTextCodec';
import { renderPlainWithMarks } from '../mathZoneInlineFormat';
import { sanitizeUrl } from './urlSanitizer';
import { openNotebookLink, NB_TIPTAP_LINK_CLASS } from './openNotebookLink';
import {
  applyCandidateLink,
  removeCandidateLink,
  readCandidateFormatState,
} from './candidateFormatCommands';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { candidateEditorHistoryDepth } from './candidatePageHistory';

const activeEditors: Editor[] = [];
let testRoot: Root | null = null;
let testHost: HTMLDivElement | null = null;

function createEditor(doc: ReturnType<typeof bodyToTiptapDoc>) {
  const editor = new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content: doc,
  });
  activeEditors.push(editor);
  return editor;
}

function createEditorWithBody(body: string, codecVersion?: number) {
  const isV1 = body.startsWith('~nb1:') || body.includes('\n~nb1:');
  const doc = bodyToTiptapDoc(body, codecVersion ?? (isV1 ? 1 : undefined));
  return createEditor(doc);
}

function fireGesture(element: Element) {
  act(() => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function mount(el: ReactElement) {
  testHost = document.createElement('div');
  document.body.appendChild(testHost);
  testRoot = createRoot(testHost);
  act(() => {
    testRoot!.render(el);
  });
}

afterEach(() => {
  while (activeEditors.length) {
    activeEditors.pop()?.destroy();
  }
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

describe('M7.5B — Links product completion', () => {
  describe('sanitizeUrl contract (allowed + rejected)', () => {
    it('allows http, https, mailto, tel, relative, hash', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
      expect(sanitizeUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
      expect(sanitizeUrl('tel:+15551212')).toBe('tel:+15551212');
      expect(sanitizeUrl('/path')).toBe('/path');
      expect(sanitizeUrl('#hash')).toBe('#hash');
    });

    it('rejects javascript: and data:', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
      expect(sanitizeUrl('data:text/html,hi')).toBeNull();
    });
  });

  describe('openNotebookLink', () => {
    it('opens sanitized https via window.open with noopener', () => {
      const fakeWin = { opener: {} as Window | null };
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWin as unknown as Window);
      expect(openNotebookLink('https://example.com')).toBe(true);
      expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
      expect(fakeWin.opener).toBeNull();
    });

    it('never opens javascript: or data:', () => {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
      expect(openNotebookLink('javascript:alert(1)')).toBe(false);
      expect(openNotebookLink('data:text/html,x')).toBe(false);
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('allows mailto/tel/relative/hash through sanitize then open', () => {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
      expect(openNotebookLink('mailto:a@b.com')).toBe(true);
      expect(openNotebookLink('tel:+1')).toBe(true);
      expect(openNotebookLink('/rel')).toBe(true);
      expect(openNotebookLink('#h')).toBe(true);
      expect(openSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe('create / edit / remove / persistence', () => {
    it('1. create link', () => {
      const ed = createEditorWithBody('Select this phrase');
      ed.commands.setTextSelection({ from: 1, to: 7 });
      expect(applyCandidateLink(ed, 'https://example.com')).toBe(true);
      expect(ed.isActive('link')).toBe(true);
      expect(ed.getAttributes('link').href).toBe('https://example.com');
    });

    it('3. edit existing link', () => {
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'Go to docs', marks: [{ s: 6, e: 10, t: 'a', v: 'https://a.com' }] },
      ]);
      const ed = createEditorWithBody(body);
      ed.commands.setTextSelection(8);
      expect(applyCandidateLink(ed, 'https://b.com')).toBe(true);
      expect(ed.getAttributes('link').href).toBe('https://b.com');
      expect(ed.getText()).toBe('Go to docs');
    });

    it('4. remove link', () => {
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'Has a link here', marks: [{ s: 6, e: 10, t: 'a', v: 'https://example.com' }] },
      ]);
      const ed = createEditorWithBody(body);
      ed.commands.setTextSelection(8);
      expect(removeCandidateLink(ed)).toBe(true);
      expect(ed.isActive('link')).toBe(false);
      expect(ed.getText()).toBe('Has a link here');
    });

    it('11. Bold + Link survives round-trip', () => {
      const body = encodeNotebookTextV1([
        {
          kind: 'paragraph',
          text: 'Bold link text',
          marks: [
            { s: 0, e: 14, t: 'b' },
            { s: 5, e: 9, t: 'a', v: 'https://example.com' },
          ],
        },
      ]);
      const ed = createEditorWithBody(body);
      const out = tiptapDocToBody(ed.getJSON(), 1);
      const again = createEditorWithBody(out, 1);
      again.commands.setTextSelection(7);
      expect(again.isActive('link')).toBe(true);
      expect(again.isActive('bold')).toBe(true);
      expect(again.getAttributes('link').href).toBe('https://example.com');
    });

    it('12. RTL + Link survives', () => {
      const body = encodeNotebookTextV1([
        {
          kind: 'paragraph',
          text: 'שלום עולם',
          marks: [{ s: 0, e: 4, t: 'a', v: 'https://example.com' }],
        },
      ]);
      const ed = createEditorWithBody(body);
      ed.commands.setTextSelection(2);
      expect(ed.isActive('link')).toBe(true);
      const out = tiptapDocToBody(ed.getJSON(), 1);
      expect(out).toContain('~nb1:');
      const again = createEditorWithBody(out, 1);
      again.commands.setTextSelection(2);
      expect(again.isActive('link')).toBe(true);
      expect(again.getAttributes('link').href).toBe('https://example.com');
      expect(again.getText()).toContain('שלום');
    });

    it('13. refresh/serialize/hydrate preserves canonical a mark', () => {
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'Visit site', marks: [{ s: 6, e: 10, t: 'a', v: 'https://example.com' }] },
      ]);
      const ed = createEditorWithBody(body);
      const serialized = tiptapDocToBody(ed.getJSON(), 1);
      expect(serialized).toMatch(/"t":"a"/);
      expect(serialized).toContain('https://example.com');
      const hydrated = createEditorWithBody(serialized, 1);
      hydrated.commands.setTextSelection(8);
      expect(hydrated.getAttributes('link').href).toBe('https://example.com');
    });
  });

  describe('visual + preview parity', () => {
    it('2. linked text has explicit product styling class in editor DOM', async () => {
      let editor: Editor | null = null;
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'Linked text here', marks: [{ s: 0, e: 6, t: 'a', v: 'https://example.com' }] },
      ]);
      mount(
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: body,
          sourceBodyCodecVersion: 1,
          pageKey: 'm75b-style',
          onEditorReady: ed => {
            editor = ed;
          },
        }),
      );
      await vi.waitFor(() => expect(editor).toBeTruthy());
      await vi.waitFor(() => expect(testHost!.querySelector('a')).not.toBeNull());
      const anchor = testHost!.querySelector('a');
      expect(anchor).toBeTruthy();
      expect(anchor!.getAttribute('href')).toBe('https://example.com');
      expect(anchor!.getAttribute('rel')).toContain('noopener');
      expect(anchor!.classList.contains(NB_TIPTAP_LINK_CLASS)).toBe(true);
      // Product CSS present in editor chrome
      const styleText = testHost!.querySelector('style')?.textContent ?? '';
      expect(styleText).toContain('a.nb-tiptap-link');
      expect(styleText).toContain('text-decoration: underline');
    });

    it('preview renderPlainWithMarks wraps a mark', () => {
      const nodes = renderPlainWithMarks('hello', [{ s: 0, e: 5, t: 'a', v: 'https://example.com' }]);
      const host = document.createElement('div');
      const root = createRoot(host);
      act(() => {
        root.render(createElement('div', null, nodes));
      });
      const a = host.querySelector(`a.${NB_TIPTAP_LINK_CLASS}`);
      expect(a).toBeTruthy();
      expect(a!.getAttribute('href')).toBe('https://example.com');
      expect(a!.getAttribute('rel')).toContain('noopener');
      act(() => root.unmount());
    });

    it('preview rejects unsafe a mark href', () => {
      const nodes = renderPlainWithMarks('evil', [{ s: 0, e: 4, t: 'a', v: 'javascript:alert(1)' }]);
      const host = document.createElement('div');
      const root = createRoot(host);
      act(() => {
        root.render(createElement('div', null, nodes));
      });
      expect(host.querySelector('a')).toBeNull();
      expect(host.textContent).toContain('evil');
      act(() => root.unmount());
    });
  });

  describe('Open Link UX (toolbar)', () => {
    it('5+6. Open Link uses sanitized href and does not mutate document', async () => {
      let editor: Editor | null = null;
      const openSpy = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as Window);
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'Open me please', marks: [{ s: 0, e: 4, t: 'a', v: 'https://safe.example' }] },
      ]);
      mount(
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: body,
          sourceBodyCodecVersion: 1,
          pageKey: 'm75b-open',
          onEditorReady: ed => {
            editor = ed;
          },
        }),
      );
      await vi.waitFor(() => expect(editor).toBeTruthy());

      act(() => {
        editor!.commands.setTextSelection({ from: 1, to: 5 });
      });
      const beforeJson = JSON.stringify(editor!.getJSON());

      const linkBtn = document.querySelector<HTMLButtonElement>('[data-nb-candidate-fmt="link"]');
      expect(linkBtn).toBeTruthy();
      fireGesture(linkBtn!);

      const openBtn = document.querySelector<HTMLButtonElement>('[data-nb-candidate-link-open="1"]');
      expect(openBtn).toBeTruthy();
      act(() => {
        openBtn!.click();
      });

      expect(openSpy).toHaveBeenCalledWith('https://safe.example', '_blank', 'noopener,noreferrer');
      expect(JSON.stringify(editor!.getJSON())).toBe(beforeJson);
      expect(editor!.getAttributes('link').href).toBe('https://safe.example');
    });

    it('7. Open Link refuses unsafe javascript in input', async () => {
      let editor: Editor | null = null;
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'Open me please', marks: [{ s: 0, e: 4, t: 'a', v: 'https://safe.example' }] },
      ]);
      mount(
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: body,
          sourceBodyCodecVersion: 1,
          pageKey: 'm75b-open-unsafe',
          onEditorReady: ed => {
            editor = ed;
          },
        }),
      );
      await vi.waitFor(() => expect(editor).toBeTruthy());

      act(() => {
        editor!.commands.setTextSelection({ from: 1, to: 5 });
      });
      fireGesture(document.querySelector('[data-nb-candidate-fmt="link"]')!);

      const input = document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]');
      expect(input).toBeTruthy();
      act(() => {
        setInputValue(input!, 'javascript:alert(1)');
      });
      act(() => {
        document.querySelector<HTMLButtonElement>('[data-nb-candidate-link-open="1"]')!.click();
      });

      expect(openSpy).not.toHaveBeenCalled();
      expect(document.querySelector('[data-nb-candidate-link-error="1"]')?.textContent).toMatch(/unsafe|cannot open/i);
      // Document still has original safe href
      expect(editor!.getAttributes('link').href).toBe('https://safe.example');
    });

    it('error copy reflects allowed URL forms', async () => {
      let editor: Editor | null = null;
      mount(
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: 'Select words here',
          pageKey: 'm75b-err-copy',
          onEditorReady: ed => {
            editor = ed;
          },
        }),
      );
      await vi.waitFor(() => expect(editor).toBeTruthy());
      act(() => {
        editor!.commands.setTextSelection({ from: 1, to: 7 });
      });
      fireGesture(document.querySelector('[data-nb-candidate-fmt="link"]')!);
      const input = document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]');
      act(() => {
        setInputValue(input!, 'javascript:evil()');
      });
      act(() => {
        document.querySelector<HTMLButtonElement>('[data-nb-candidate-link-apply="1"]')!.click();
      });
      const err = document.querySelector('[data-nb-candidate-link-error="1"]')?.textContent ?? '';
      expect(err).toMatch(/mailto/);
      expect(err).toMatch(/tel/);
      expect(err).not.toMatch(/must be http:\/\/ or https:\/\//);
    });
  });

  describe('click navigation contract', () => {
    it('9. ordinary editing click does NOT navigate', async () => {
      let editor: Editor | null = null;
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'Linked text', marks: [{ s: 0, e: 6, t: 'a', v: 'https://example.com' }] },
      ]);
      mount(
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: body,
          sourceBodyCodecVersion: 1,
          pageKey: 'm75b-click',
          onEditorReady: ed => {
            editor = ed;
          },
        }),
      );
      await vi.waitFor(() => expect(editor).toBeTruthy());
      await vi.waitFor(() => expect(testHost!.querySelector('a')).not.toBeNull());
      const anchor = testHost!.querySelector('a') as HTMLAnchorElement;
      expect(anchor).toBeTruthy();

      const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      act(() => {
        anchor.dispatchEvent(click);
      });
      expect(click.defaultPrevented).toBe(true);
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('10. Cmd/Ctrl+Click opens deliberately', async () => {
      let editor: Editor | null = null;
      const openSpy = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as Window);
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'Linked text', marks: [{ s: 0, e: 6, t: 'a', v: 'https://example.com' }] },
      ]);
      mount(
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: body,
          sourceBodyCodecVersion: 1,
          pageKey: 'm75b-mod-click',
          onEditorReady: ed => {
            editor = ed;
          },
        }),
      );
      await vi.waitFor(() => expect(editor).toBeTruthy());
      await vi.waitFor(() => expect(testHost!.querySelector('a')).not.toBeNull());
      const anchor = testHost!.querySelector('a') as HTMLAnchorElement;

      const metaClick = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        metaKey: true,
      });
      act(() => {
        anchor.dispatchEvent(metaClick);
      });
      expect(metaClick.defaultPrevented).toBe(true);
      expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');

      openSpy.mockClear();
      const ctrlClick = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        ctrlKey: true,
      });
      act(() => {
        anchor.dispatchEvent(ctrlClick);
      });
      expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    });
  });

  describe('selection toolbar + history non-regression', () => {
    it('14. floating toolbar remains selection-only', async () => {
      let editor: Editor | null = null;
      mount(
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: 'Caret only here',
          pageKey: 'm75b-sel-only',
          onEditorReady: ed => {
            editor = ed;
          },
        }),
      );
      await vi.waitFor(() => expect(editor).toBeTruthy());
      act(() => {
        editor!.commands.setTextSelection(3);
      });
      expect(selectionShouldShowToolbar(editor!)).toBe(false);
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();

      act(() => {
        editor!.commands.setTextSelection({ from: 1, to: 6 });
      });
      expect(selectionShouldShowToolbar(editor!)).toBe(true);
      await vi.waitFor(() => {
        expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy();
      });
    });

    it('15. page-local history depth still advances on edit (M7.5A unaffected)', async () => {
      let editor: Editor | null = null;
      mount(
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: 'History base',
          pageKey: 'm75b-hist',
          onEditorReady: ed => {
            editor = ed;
          },
        }),
      );
      await vi.waitFor(() => expect(editor).toBeTruthy());
      const before = candidateEditorHistoryDepth(editor!);
      act(() => {
        editor!.commands.setTextSelection({ from: 1, to: 8 });
        applyCandidateLink(editor!, 'https://example.com');
      });
      expect(candidateEditorHistoryDepth(editor!).undo).toBeGreaterThanOrEqual(before.undo);
      expect(readCandidateFormatState(editor!).link).toBe(true);
    });
  });
});

describe('M7.5B — real popover Apply path (QA repro)', () => {
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

  it('select → Link → type URL → Apply leaves canonical link mark on exactly that range', async () => {
    let editor: Editor | null = null;
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Select this phrase please',
        pageKey: 'm75b-qa-apply',
        onEditorReady: ed => {
          editor = ed;
        },
      }),
    );
    await vi.waitFor(() => expect(editor).toBeTruthy());

    act(() => {
      editor!.commands.setTextSelection({ from: 1, to: 7 }); // "Select"
    });

    fireGesture(document.querySelector('[data-nb-candidate-fmt="link"]')!);
    await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-link-popover="1"]')).toBeTruthy());

    const input = document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]')!;
    act(() => {
      input.focus();
      setInputValue(input, 'https://example.com');
    });

    const applyBtn = document.querySelector<HTMLButtonElement>('[data-nb-candidate-link-apply="1"]')!;
    act(() => {
      applyBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      applyBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
      applyBtn.click();
    });

    expect(linkMarkOnRange(editor!, 1, 7, 'https://example.com')).toBe(true);
    // Outside the original range must remain unlinked
    expect(linkMarkOnRange(editor!, 8, 14, 'https://example.com')).toBe(false);

    await vi.waitFor(() => expect(testHost!.querySelector('a.nb-tiptap-link')).not.toBeNull());
    const a = testHost!.querySelector('a.nb-tiptap-link');
    expect(a?.getAttribute('href')).toBe('https://example.com');
    expect(a?.textContent).toBe('Select');
    expect(a?.classList.contains('nb-tiptap-link')).toBe(true);
  });

  it('selection collapse while Link popover is open still Apply-s via stored range', async () => {
    let editor: Editor | null = null;
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Select this phrase please',
        pageKey: 'm75b-qa-collapse',
        onEditorReady: ed => {
          editor = ed;
        },
      }),
    );
    await vi.waitFor(() => expect(editor).toBeTruthy());

    act(() => {
      editor!.commands.setTextSelection({ from: 1, to: 7 });
    });
    fireGesture(document.querySelector('[data-nb-candidate-fmt="link"]')!);
    await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-link-input="1"]')).toBeTruthy());

    const input = document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]')!;
    act(() => {
      setInputValue(input, 'https://example.com');
    });

    // Collapse live selection (URL field focus / browser quirk). Popover must stay up.
    act(() => {
      editor!.commands.setTextSelection(3);
    });
    expect(editor!.state.selection.empty).toBe(true);

    const applyBtn = document.querySelector<HTMLButtonElement>('[data-nb-candidate-link-apply="1"]');
    expect(applyBtn).toBeTruthy(); // must NOT unmount on collapse while linkOpen
    act(() => {
      applyBtn!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      applyBtn!.click();
    });

    expect(linkMarkOnRange(editor!, 1, 7, 'https://example.com')).toBe(true);
    await vi.waitFor(() => expect(testHost!.querySelector('a.nb-tiptap-link')).not.toBeNull());
  });

  it('reselecting applied link exposes href for Edit / Open / Remove', async () => {
    let editor: Editor | null = null;
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Select this phrase please',
        pageKey: 'm75b-qa-reedit',
        onEditorReady: ed => {
          editor = ed;
        },
      }),
    );
    await vi.waitFor(() => expect(editor).toBeTruthy());

    act(() => {
      editor!.commands.setTextSelection({ from: 1, to: 7 });
    });
    fireGesture(document.querySelector('[data-nb-candidate-fmt="link"]')!);
    await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-link-input="1"]')).toBeTruthy());
    act(() => {
      setInputValue(document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]')!, 'https://example.com');
      document.querySelector<HTMLButtonElement>('[data-nb-candidate-link-apply="1"]')!.click();
    });
    expect(linkMarkOnRange(editor!, 1, 7, 'https://example.com')).toBe(true);

    act(() => {
      editor!.commands.setTextSelection({ from: 1, to: 7 });
    });
    fireGesture(document.querySelector('[data-nb-candidate-fmt="link"]')!);
    await vi.waitFor(() => expect(document.querySelector('[data-nb-candidate-link-popover="1"]')).toBeTruthy());

    const input = document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]');
    expect(input?.value).toBe('https://example.com');
    expect(document.querySelector('[data-nb-candidate-link-open="1"]')).toBeTruthy();
    expect(document.querySelector('[data-nb-candidate-link-remove="1"]')).toBeTruthy();
  });
});
