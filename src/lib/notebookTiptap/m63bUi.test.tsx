/**
 * M6.3B — Links + Alignment User Interface & Command Test Suite
 *
 * Covers all 45 explicit test cases specified in Milestone 6.3B:
 * 1-20:  LINK UI / COMMANDS
 * 21-45: ALIGNMENT
 *
 * @vitest-environment happy-dom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import {
  applyCandidateLink,
  removeCandidateLink,
  setCandidateAlignment,
  readCandidateFormatState,
} from './candidateFormatCommands';
import { encodeNotebookTextV1 } from '../notebookTextCodec';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';

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

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
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

describe('M6.3B — Part 12 Test Matrix', () => {
  // ==========================================
  // PART A: LINK UI / COMMANDS (Tests 1–20)
  // ==========================================
  describe('Link UI / Commands (1–20)', () => {
    it('1. Link button disabled with empty caret outside link', () => {
      const ed = createEditorWithBody('Hello world');
      ed.commands.setTextSelection(3); // caret inside plain text
      const fmt = readCandidateFormatState(ed);
      expect(fmt.canLink).toBe(false);
      expect(fmt.link).toBe(false);
    });

    it('2. Selected text enables Link', () => {
      const ed = createEditorWithBody('Hello world');
      ed.commands.setTextSelection({ from: 1, to: 6 }); // selected "Hello"
      const fmt = readCandidateFormatState(ed);
      expect(fmt.canLink).toBe(true);
      expect(fmt.link).toBe(false);
    });

    it('3. Applying example.com normalizes to https://example.com', () => {
      const ed = createEditorWithBody('Visit example website');
      ed.commands.setTextSelection({ from: 7, to: 14 }); // "example"
      const ok = applyCandidateLink(ed, 'example.com');
      expect(ok).toBe(true);
      expect(ed.isActive('link')).toBe(true);
      expect(ed.getAttributes('link').href).toBe('https://example.com');
    });

    it('4. Unsafe javascript URL rejected', () => {
      const ed = createEditorWithBody('Click here now');
      ed.commands.setTextSelection({ from: 1, to: 6 }); // "Click"
      const ok = applyCandidateLink(ed, 'javascript:alert(1)');
      expect(ok).toBe(false);
      expect(ed.isActive('link')).toBe(false);
      expect(ed.getText()).toBe('Click here now');
    });

    it('5. data: rejected', () => {
      const ed = createEditorWithBody('Click here now');
      ed.commands.setTextSelection({ from: 1, to: 6 });
      const ok = applyCandidateLink(ed, 'data:text/html,<script>evil()</script>');
      expect(ok).toBe(false);
      expect(ed.isActive('link')).toBe(false);
    });

    it('6. Cancel makes no change', async () => {
      let editorInstance: Editor | null = null;
      testHost = document.createElement('div');
      document.body.append(testHost);
      testRoot = createRoot(testHost);

      act(() => {
        testRoot!.render(
          createElement(NotebookTiptapCandidateEditor, {
            sourceDocumentBody: 'Some sample text',
            pageKey: 'test-cancel-link',
            onEditorReady: ed => {
              editorInstance = ed;
            },
          }),
        );
      });
      await vi.waitFor(() => expect(editorInstance).toBeTruthy());

      act(() => {
        editorInstance!.commands.setTextSelection({ from: 1, to: 5 }); // "Some"
      });

      // Toolbar is open, click link button to open popover
      const linkBtn = document.querySelector<HTMLButtonElement>('[data-nb-candidate-fmt="link"]');
      expect(linkBtn).toBeTruthy();
      fireGesture(linkBtn!);

      const popover = document.querySelector('[data-nb-candidate-link-popover="1"]');
      expect(popover).toBeTruthy();

      // Enter some text into input
      const input = document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]');
      expect(input).toBeTruthy();
      act(() => {
        input!.value = 'https://cancel-test.com';
        input!.dispatchEvent(new Event('input', { bubbles: true }));
      });

      // Click Cancel
      const cancelBtn = document.querySelector<HTMLButtonElement>('[data-nb-candidate-link-cancel="1"]');
      expect(cancelBtn).toBeTruthy();
      act(() => {
        cancelBtn!.click();
      });

      // Popover closes, text has no link
      expect(document.querySelector('[data-nb-candidate-link-popover="1"]')).toBeNull();
      expect(editorInstance!.isActive('link')).toBe(false);
    });

    it('7. Escape closes with no change', async () => {
      let editorInstance: Editor | null = null;
      testHost = document.createElement('div');
      document.body.append(testHost);
      testRoot = createRoot(testHost);

      act(() => {
        testRoot!.render(
          createElement(NotebookTiptapCandidateEditor, {
            sourceDocumentBody: 'Another sample text',
            pageKey: 'test-escape-link',
            onEditorReady: ed => {
              editorInstance = ed;
            },
          }),
        );
      });
      await vi.waitFor(() => expect(editorInstance).toBeTruthy());

      act(() => {
        editorInstance!.commands.setTextSelection({ from: 1, to: 8 }); // "Another"
      });

      const linkBtn = document.querySelector<HTMLButtonElement>('[data-nb-candidate-fmt="link"]');
      fireGesture(linkBtn!);

      const input = document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]');
      expect(input).toBeTruthy();

      act(() => {
        input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });

      expect(document.querySelector('[data-nb-candidate-link-popover="1"]')).toBeNull();
      expect(editorInstance!.isActive('link')).toBe(false);
    });

    it('8. Enter applies valid link', async () => {
      let editorInstance: Editor | null = null;
      testHost = document.createElement('div');
      document.body.append(testHost);
      testRoot = createRoot(testHost);

      act(() => {
        testRoot!.render(
          createElement(NotebookTiptapCandidateEditor, {
            sourceDocumentBody: 'Press enter to link',
            pageKey: 'test-enter-link',
            onEditorReady: ed => {
              editorInstance = ed;
            },
          }),
        );
      });
      await vi.waitFor(() => expect(editorInstance).toBeTruthy());

      act(() => {
        editorInstance!.commands.setTextSelection({ from: 1, to: 6 }); // "Press"
      });

      const linkBtn = document.querySelector<HTMLButtonElement>('[data-nb-candidate-fmt="link"]');
      fireGesture(linkBtn!);

      const input = document.querySelector<HTMLInputElement>('[data-nb-candidate-link-input="1"]');
      expect(input).toBeTruthy();

      act(() => {
        setInputValue(input!, 'https://enter-test.com');
        input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      });

      expect(document.querySelector('[data-nb-candidate-link-popover="1"]')).toBeNull();
      expect(editorInstance!.isActive('link')).toBe(true);
      expect(editorInstance!.getAttributes('link').href).toBe('https://enter-test.com');
    });

    it('9. existing link pre-fills href', () => {
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'Go to docs', marks: [{ s: 6, e: 10, t: 'a', v: 'https://docs.example.com' }] },
      ]);
      const ed = createEditorWithBody(body);
      ed.commands.setTextSelection(8); // inside "docs"
      const fmt = readCandidateFormatState(ed);
      expect(fmt.link).toBe(true);
      expect(fmt.linkHref).toBe('https://docs.example.com');
      expect(fmt.canLink).toBe(true);
    });

    it('10. editing href changes href only', () => {
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'Go to docs', marks: [{ s: 6, e: 10, t: 'a', v: 'https://a.com' }] },
      ]);
      const ed = createEditorWithBody(body);
      ed.commands.setTextSelection(8); // inside link
      const ok = applyCandidateLink(ed, 'https://b.com');
      expect(ok).toBe(true);
      expect(ed.getAttributes('link').href).toBe('https://b.com');
      expect(ed.getText()).toBe('Go to docs');
    });

    it('11. Remove Link preserves text', () => {
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'Check this link now', marks: [{ s: 11, e: 15, t: 'a', v: 'https://example.com' }] },
      ]);
      const ed = createEditorWithBody(body);
      ed.commands.setTextSelection(13); // inside "link"
      const ok = removeCandidateLink(ed);
      expect(ok).toBe(true);
      expect(ed.isActive('link')).toBe(false);
      expect(ed.getText()).toBe('Check this link now');
    });

    it('12. Remove Link preserves bold', () => {
      // "Check bold link" with bold on 6..15 and link on 11..15
      const body = encodeNotebookTextV1([
        {
          kind: 'paragraph',
          text: 'Check bold link',
          marks: [
            { s: 6, e: 15, t: 'b' },
            { s: 11, e: 15, t: 'a', v: 'https://example.com' },
          ],
        },
      ]);
      const ed = createEditorWithBody(body);
      ed.commands.setTextSelection(13); // inside "link"
      const ok = removeCandidateLink(ed);
      expect(ok).toBe(true);
      expect(ed.isActive('link')).toBe(false);
      expect(ed.isActive('bold')).toBe(true);
      expect(ed.getText()).toBe('Check bold link');
    });

    it('13. bold + link survives round-trip', () => {
      const body = encodeNotebookTextV1([
        {
          kind: 'paragraph',
          text: 'Bold Link Test',
          marks: [
            { s: 0, e: 9, t: 'b' },
            { s: 0, e: 9, t: 'a', v: 'https://example.com' },
          ],
        },
      ]);
      const ed = createEditorWithBody(body);
      const serialized = tiptapDocToBody(ed.getJSON(), 1);
      expect(serialized).toBe(body);
    });

    it('14. trailing space excluded', () => {
      const ed = createEditorWithBody('hello world again');
      // select "world " (7..13)
      ed.commands.setTextSelection({ from: 7, to: 13 });
      const ok = applyCandidateLink(ed, 'https://example.com');
      expect(ok).toBe(true);

      // Check character at pos 12 (the space)
      ed.commands.setTextSelection(12);
      expect(ed.isActive('link')).toBe(false);

      // Check character at pos 9 ("r" in "world")
      ed.commands.setTextSelection(9);
      expect(ed.isActive('link')).toBe(true);
    });

    it('15. surrounding text unchanged', () => {
      const ed = createEditorWithBody('hello world again');
      ed.commands.setTextSelection({ from: 7, to: 12 }); // "world"
      applyCandidateLink(ed, 'https://example.com');
      expect(ed.getText()).toBe('hello world again');

      // Before link
      ed.commands.setTextSelection(3);
      expect(ed.isActive('link')).toBe(false);

      // After link
      ed.commands.setTextSelection(14);
      expect(ed.isActive('link')).toBe(false);
    });

    it('16. link adjacent to inline math does not absorb math', () => {
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'word x', marks: [{ s: 5, e: 6, t: 'm' }] },
      ]);
      const ed = createEditorWithBody(body);
      // Select "word" (1..5)
      ed.commands.setTextSelection({ from: 1, to: 5 });
      applyCandidateLink(ed, 'https://example.com');

      // Check math node
      let mathHasLink = false;
      ed.state.doc.descendants(node => {
        if (node.type.name === 'nbInlineMath') {
          if (node.marks.some(m => m.type.name === 'link')) mathHasLink = true;
        }
      });
      expect(mathHasLink).toBe(false);
    });

    it('17. selection crossing math does not corrupt atom', () => {
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'hello x world', marks: [{ s: 6, e: 7, t: 'm' }] },
      ]);
      const ed = createEditorWithBody(body);
      // Select across from "hello" through "world"
      ed.commands.setTextSelection({ from: 1, to: 14 });
      applyCandidateLink(ed, 'https://example.com');

      // Verify math atom is still intact and not linked
      let foundMath = false;
      let mathHasLink = false;
      ed.state.doc.descendants(node => {
        if (node.type.name === 'nbInlineMath') {
          foundMath = true;
          if (node.marks.some(m => m.type.name === 'link')) mathHasLink = true;
        }
      });
      expect(foundMath).toBe(true);
      expect(mathHasLink).toBe(false);
    });

    it('18. typing URL does not auto-link', () => {
      const ed = createEditorWithBody('Initial text ');
      ed.commands.setTextSelection(14);
      ed.commands.insertContent('https://google.com');
      expect(ed.isActive('link')).toBe(false);
      expect(ed.getText()).toBe('Initial text https://google.com');
    });

    it('19. pasted URL does not auto-link', () => {
      const ed = createEditorWithBody('Initial text ');
      ed.commands.setTextSelection(14);
      ed.commands.insertContent('google.com');
      expect(ed.isActive('link')).toBe(false);
    });

    it('20. editor click on link does not navigate', async () => {
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'Click link', marks: [{ s: 6, e: 10, t: 'a', v: 'https://example.com' }] },
      ]);
      let editorInstance: Editor | null = null;
      testHost = document.createElement('div');
      document.body.append(testHost);
      testRoot = createRoot(testHost);

      act(() => {
        testRoot!.render(
          createElement(NotebookTiptapCandidateEditor, {
            sourceDocumentBody: body,
            sourceBodyCodecVersion: 1,
            pageKey: 'test-click-prevent',
            onEditorReady: ed => {
              editorInstance = ed;
            },
          }),
        );
      });
      await vi.waitFor(() => expect(editorInstance).toBeTruthy());
      await vi.waitFor(() => expect(testHost!.querySelector('a')).not.toBeNull());

      const anchorEl = testHost!.querySelector('a');
      expect(anchorEl).toBeTruthy();
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      act(() => {
        anchorEl!.dispatchEvent(clickEvent);
      });
      expect(clickEvent.defaultPrevented).toBe(true);
    });
  });

  // ==========================================
  // PART B: ALIGNMENT (Tests 21–45)
  // ==========================================
  describe('Alignment (21–45)', () => {
    it('21. paragraph → left', () => {
      const ed = createEditorWithBody('Paragraph text');
      ed.commands.setTextSelection(5);
      const ok = setCandidateAlignment(ed, 'left');
      expect(ok).toBe(true);
      const p = ed.state.doc.firstChild;
      expect(p?.attrs.align).toBe('left');
    });

    it('22. paragraph → center', () => {
      const ed = createEditorWithBody('Paragraph text');
      ed.commands.setTextSelection(5);
      const ok = setCandidateAlignment(ed, 'center');
      expect(ok).toBe(true);
      const p = ed.state.doc.firstChild;
      expect(p?.attrs.align).toBe('center');
    });

    it('23. paragraph → right', () => {
      const ed = createEditorWithBody('Paragraph text');
      ed.commands.setTextSelection(5);
      const ok = setCandidateAlignment(ed, 'right');
      expect(ok).toBe(true);
      const p = ed.state.doc.firstChild;
      expect(p?.attrs.align).toBe('right');
    });

    it('24. paragraph → Auto/null', () => {
      const ed = createEditorWithBody('Paragraph text');
      ed.commands.setTextSelection(5);
      setCandidateAlignment(ed, 'center');
      expect(ed.state.doc.firstChild?.attrs.align).toBe('center');

      const ok = setCandidateAlignment(ed, null);
      expect(ok).toBe(true);
      expect(ed.state.doc.firstChild?.attrs.align).toBeNull();
    });

    it('25. title alignment', () => {
      const body = encodeNotebookTextV1([{ kind: 'title', text: 'Document Title' }]);
      const ed = createEditorWithBody(body);
      ed.commands.setTextSelection(5);
      expect(setCandidateAlignment(ed, 'center')).toBe(true);
      expect(ed.state.doc.firstChild?.attrs.align).toBe('center');
      expect(setCandidateAlignment(ed, null)).toBe(true);
      expect(ed.state.doc.firstChild?.attrs.align).toBeNull();
    });

    it('26. section alignment', () => {
      const body = encodeNotebookTextV1([{ kind: 'section', text: 'Section Header' }]);
      const ed = createEditorWithBody(body);
      ed.commands.setTextSelection(5);
      expect(setCandidateAlignment(ed, 'right')).toBe(true);
      expect(ed.state.doc.firstChild?.attrs.align).toBe('right');
      expect(setCandidateAlignment(ed, null)).toBe(true);
      expect(ed.state.doc.firstChild?.attrs.align).toBeNull();
    });

    it('27. quote alignment', () => {
      const ed = createEditorWithBody('~nb1:["quote","A famous quote",[],null]');
      ed.commands.setTextSelection(5);
      expect(setCandidateAlignment(ed, 'center')).toBe(true);
      expect(ed.state.doc.firstChild?.attrs.align).toBe('center');
      expect(setCandidateAlignment(ed, null)).toBe(true);
      expect(ed.state.doc.firstChild?.attrs.align).toBeNull();
    });

    it('28. bullet unsupported', () => {
      const ed = createEditorWithBody('~nb1:["bullet","Bullet item",[],0]');
      ed.commands.setTextSelection(5);
      const fmt = readCandidateFormatState(ed);
      expect(fmt.alignSupported).toBe(false);
      const ok = setCandidateAlignment(ed, 'center');
      expect(ok).toBe(false);
      expect(ed.state.doc.firstChild?.attrs.align).toBeUndefined();
    });

    it('29. ordered unsupported', () => {
      const ed = createEditorWithBody('~nb1:["ordered","Numbered item",[],1]');
      ed.commands.setTextSelection(5);
      const fmt = readCandidateFormatState(ed);
      expect(fmt.alignSupported).toBe(false);
      const ok = setCandidateAlignment(ed, 'left');
      expect(ok).toBe(false);
    });

    it('30. task unsupported', () => {
      const ed = createEditorWithBody('~nb1:["task","Task item",[],false]');
      ed.commands.setTextSelection(5);
      const fmt = readCandidateFormatState(ed);
      expect(fmt.alignSupported).toBe(false);
      const ok = setCandidateAlignment(ed, 'center');
      expect(ok).toBe(false);
    });

    it('31. math block unsupported', () => {
      const ed = createEditorWithBody('~nb1:["math","x^2 + y^2 = z^2",[],null]');
      ed.commands.setTextSelection(5);
      const fmt = readCandidateFormatState(ed);
      expect(fmt.alignSupported).toBe(false);
      const ok = setCandidateAlignment(ed, 'right');
      expect(ok).toBe(false);
    });

    it('32. image unsupported', () => {
      const doc = {
        type: 'doc',
        content: [{ type: 'nbImageRef', attrs: { key: 'test-img', alt: 'Test image' } }],
      };
      const ed = createEditor(doc as any);
      ed.commands.setTextSelection(0);
      const fmt = readCandidateFormatState(ed);
      expect(fmt.alignSupported).toBe(false);
      const ok = setCandidateAlignment(ed, 'center');
      expect(ok).toBe(false);
    });

    it('33. protected atom unaffected', () => {
      const body = encodeNotebookTextV1([
        { kind: 'paragraph', text: 'math x inside', marks: [{ s: 5, e: 6, t: 'm' }] },
      ]);
      const ed = createEditorWithBody(body);
      ed.commands.setTextSelection(5);
      const ok = setCandidateAlignment(ed, 'center');
      expect(ok).toBe(true);

      // Verify math atom is untouched
      let mathText = '';
      ed.state.doc.descendants(node => {
        if (node.type.name === 'nbInlineMath') {
          mathText = node.attrs.text;
        }
      });
      expect(mathText).toBe('x');
    });

    it('34. RTL + left keeps dir RTL', () => {
      const ed = createEditorWithBody('שלום עולם');
      ed.commands.updateAttributes('nbParagraph', { dir: 'rtl' });
      ed.commands.setTextSelection(3);
      setCandidateAlignment(ed, 'left');
      const p = ed.state.doc.firstChild;
      expect(p?.attrs.dir).toBe('rtl');
      expect(p?.attrs.align).toBe('left');
    });

    it('35. RTL + center keeps dir RTL', () => {
      const ed = createEditorWithBody('שלום עולם');
      ed.commands.updateAttributes('nbParagraph', { dir: 'rtl' });
      ed.commands.setTextSelection(3);
      setCandidateAlignment(ed, 'center');
      const p = ed.state.doc.firstChild;
      expect(p?.attrs.dir).toBe('rtl');
      expect(p?.attrs.align).toBe('center');
    });

    it('36. LTR + right keeps dir LTR', () => {
      const ed = createEditorWithBody('Hello world');
      ed.commands.updateAttributes('nbParagraph', { dir: 'ltr' });
      ed.commands.setTextSelection(3);
      setCandidateAlignment(ed, 'right');
      const p = ed.state.doc.firstChild;
      expect(p?.attrs.dir).toBe('ltr');
      expect(p?.attrs.align).toBe('right');
    });

    it('37. Auto produces align=null', () => {
      const ed = createEditorWithBody('Sample text');
      ed.commands.setTextSelection(3);
      setCandidateAlignment(ed, 'center');
      expect(ed.state.doc.firstChild?.attrs.align).toBe('center');

      setCandidateAlignment(ed, null);
      expect(ed.state.doc.firstChild?.attrs.align).toBeNull();
    });

    it('38. Auto does not persist 5th tuple', () => {
      const ed = createEditorWithBody('Sample text');
      ed.commands.setTextSelection(3);
      setCandidateAlignment(ed, null);
      const serialized = tiptapDocToBody(ed.getJSON(), 1);
      expect(serialized).toBe('~nb1:["paragraph","Sample text",[],null]');
      expect(JSON.parse(serialized.slice(5)).length).toBe(4);
    });

    it('39. left persists 5th tuple', () => {
      const ed = createEditorWithBody('Sample text');
      ed.commands.setTextSelection(3);
      setCandidateAlignment(ed, 'left');
      const serialized = tiptapDocToBody(ed.getJSON(), 1);
      expect(serialized).toBe('~nb1:["paragraph","Sample text",[],null,"left"]');
      const tuple = JSON.parse(serialized.slice(5));
      expect(tuple.length).toBe(5);
      expect(tuple[4]).toBe('left');
    });

    it('40. center persists 5th tuple', () => {
      const ed = createEditorWithBody('Sample text');
      ed.commands.setTextSelection(3);
      setCandidateAlignment(ed, 'center');
      const serialized = tiptapDocToBody(ed.getJSON(), 1);
      expect(serialized).toBe('~nb1:["paragraph","Sample text",[],null,"center"]');
      const tuple = JSON.parse(serialized.slice(5));
      expect(tuple.length).toBe(5);
      expect(tuple[4]).toBe('center');
    });

    it('41. right persists 5th tuple', () => {
      const ed = createEditorWithBody('Sample text');
      ed.commands.setTextSelection(3);
      setCandidateAlignment(ed, 'right');
      const serialized = tiptapDocToBody(ed.getJSON(), 1);
      expect(serialized).toBe('~nb1:["paragraph","Sample text",[],null,"right"]');
      const tuple = JSON.parse(serialized.slice(5));
      expect(tuple.length).toBe(5);
      expect(tuple[4]).toBe('right');
    });

    it('42. undo alignment works', () => {
      const ed = createEditorWithBody('Sample text');
      ed.commands.setTextSelection(3);
      setCandidateAlignment(ed, 'center');
      expect(ed.state.doc.firstChild?.attrs.align).toBe('center');

      ed.commands.undo();
      expect(ed.state.doc.firstChild?.attrs.align).toBeNull();
    });

    it('43. redo alignment works', () => {
      const ed = createEditorWithBody('Sample text');
      ed.commands.setTextSelection(3);
      setCandidateAlignment(ed, 'center');
      ed.commands.undo();
      expect(ed.state.doc.firstChild?.attrs.align).toBeNull();

      ed.commands.redo();
      expect(ed.state.doc.firstChild?.attrs.align).toBe('center');
    });

    it('44. multi-supported-block selection behavior tested', () => {
      const body = [
        '~nb1:["paragraph","First paragraph",[],null]',
        '~nb1:["title","Middle Title",[],null]',
        '~nb1:["section","Last Section",[],null]',
      ].join('\n');
      const ed = createEditorWithBody(body);

      // Select across all three blocks
      ed.commands.setTextSelection({ from: 2, to: ed.state.doc.content.size - 2 });
      const ok = setCandidateAlignment(ed, 'center');
      expect(ok).toBe(true);

      const nodes: any[] = [];
      ed.state.doc.forEach(n => nodes.push(n));
      expect(nodes[0].attrs.align).toBe('center');
      expect(nodes[1].attrs.align).toBe('center');
      expect(nodes[2].attrs.align).toBe('center');
    });

    it('45. mixed protected selection behavior tested', () => {
      const body = [
        '~nb1:["paragraph","Supported paragraph",[],null]',
        '~nb1:["bullet","Unsupported bullet item",[],0]',
      ].join('\n');
      const ed = createEditorWithBody(body);

      // Select across paragraph into bullet
      ed.commands.setTextSelection({ from: 2, to: ed.state.doc.content.size - 2 });
      const ok = setCandidateAlignment(ed, 'right');
      expect(ok).toBe(true);

      const nodes: any[] = [];
      ed.state.doc.forEach(n => nodes.push(n));
      // Supported paragraph is updated to 'right'
      expect(nodes[0].attrs.align).toBe('right');
      // Unsupported bullet is untouched
      expect(nodes[1].attrs.align).toBeUndefined();
    });
  });
});
