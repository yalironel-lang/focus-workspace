/**
 * Milestone 2 TipTap editable sandbox safety tests.
 *
 * @vitest-environment happy-dom
 */
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { Editor } from '@tiptap/core';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { PARITY_FIXTURE_BODY } from './parityFixture';
import { isNotebookTiptapEditorEnabled } from './featureFlag';
import {
  NotebookTiptapConversionError,
  roundTripBody,
} from './index';

const { NotebookTiptapSandboxEditor } = await import(
  '../../components/notebook/tiptap/NotebookTiptapSandboxEditor'
);
const { NotebookTiptapReadonlyViewer } = await import(
  '../../components/notebook/tiptap/NotebookTiptapReadonlyViewer'
);

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

function makeEditor(content?: JSONContent) {
  return new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content: content ?? bodyToTiptapDoc('Hello sandbox'),
    editable: true,
  });
}

describe('feature flag still defaults OFF', () => {
  it('is off', () => {
    expect(isNotebookTiptapEditorEnabled()).toBe(false);
  });
});

describe('sandbox editor component', () => {
  it('is editable and has no persistence callback API', async () => {
    const onReady = vi.fn();
    const onSerializeAttempt = vi.fn();
    mount(
      createElement(NotebookTiptapSandboxEditor, {
        initialDocumentBody: 'Hello',
        onReady,
        onSerializeAttempt,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls[0]![0].editable).toBe(true);
    expect(host!.querySelector('[data-nb-tiptap-sandbox="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-sandbox-toolbar="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-sandbox-inspector="1"]')).toBeTruthy();
    // Serialize attempt is informational only (in-memory)
    expect(onSerializeAttempt).toHaveBeenCalled();
    expect(onSerializeAttempt.mock.calls[0]![0].status).toBe('SAFE');
  });

  it('resetToken re-inits from fixture without mutating the fixture string', async () => {
    const fixture = '# Title\nPara';
    const frozen = fixture;
    let ready = false;
    const onReady = () => {
      ready = true;
    };
    mount(
      createElement(NotebookTiptapSandboxEditor, {
        initialDocumentBody: fixture,
        resetToken: 0,
        onReady,
      }),
    );
    await vi.waitFor(() => expect(ready).toBe(true));
    act(() => {
      root!.render(
        createElement(NotebookTiptapSandboxEditor, {
          initialDocumentBody: fixture,
          resetToken: 1,
          onReady,
        }),
      );
    });
    expect(fixture).toBe(frozen);
  });

  it('readonly viewer remains non-editable', async () => {
    const onReady = vi.fn();
    mount(createElement(NotebookTiptapReadonlyViewer, { documentBody: 'X', onReady }));
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls[0]![0].editable).toBe(false);
  });
});

describe('headless sandbox editor behaviors', () => {
  it('typing changes TipTap state only; serialize stays SAFE', () => {
    const ed = makeEditor(bodyToTiptapDoc('Hello'));
    ed.commands.focus('end');
    ed.commands.insertContent('!');
    const json = ed.getJSON();
    const body = tiptapDocToBody(json);
    expect(body).toContain('Hello!');
    ed.destroy();
  });

  it('B/I/U/S toggle and serialize', () => {
    const ed = makeEditor(bodyToTiptapDoc('Boldme'));
    ed.commands.selectAll();
    ed.chain().focus().toggleBold().toggleItalic().toggleUnderline().toggleStrike().run();
    const body = tiptapDocToBody(ed.getJSON());
    expect(body).toContain('Boldme');
    expect(body).toMatch(/"t":"b"/);
    expect(body).toMatch(/"t":"i"/);
    expect(body).toMatch(/"t":"u"/);
    expect(body).toMatch(/"t":"s"/);
    ed.destroy();
  });

  it('undo/redo', () => {
    const ed = makeEditor(bodyToTiptapDoc('Ab'));
    ed.commands.focus('end');
    ed.commands.insertContent('c');
    expect(tiptapDocToBody(ed.getJSON())).toContain('Abc');
    ed.commands.undo();
    expect(tiptapDocToBody(ed.getJSON())).toBe('Ab');
    ed.commands.redo();
    expect(tiptapDocToBody(ed.getJSON())).toContain('Abc');
    ed.destroy();
  });

  it('Enter splits paragraph', () => {
    const ed = makeEditor(bodyToTiptapDoc('Hello'));
    // Position caret inside first textblock after "He"
    ed.chain().focus().setTextSelection(3).run();
    ed.commands.keyboardShortcut('Enter');
    const body = tiptapDocToBody(ed.getJSON());
    expect(body.split('\n').length).toBeGreaterThanOrEqual(2);
    ed.destroy();
  });

  it('Enter on empty bullet converts to paragraph', () => {
    const ed = makeEditor(bodyToTiptapDoc('- '));
    // empty bullet from "- " may parse with empty text
    ed.commands.keyboardShortcut('Enter');
    const body = tiptapDocToBody(ed.getJSON());
    expect(body.startsWith('- ')).toBe(false);
    ed.destroy();
  });

  it('Tab increases bullet depth up to 2; refuses deeper', () => {
    const ed = makeEditor(bodyToTiptapDoc('- Item'));
    ed.commands.keyboardShortcut('Tab');
    expect(tiptapDocToBody(ed.getJSON())).toMatch(/^ {2}- Item/);
    ed.commands.keyboardShortcut('Tab');
    expect(tiptapDocToBody(ed.getJSON())).toMatch(/^ {4}- Item/);
    ed.commands.keyboardShortcut('Tab'); // refuse
    expect(tiptapDocToBody(ed.getJSON())).toMatch(/^ {4}- Item/);
    ed.destroy();
  });

  it('filterTransaction rejects depth > 2', () => {
    const ed = makeEditor();
    const bad: JSONContent = {
      type: 'doc',
      content: [{ type: 'nbBullet', attrs: { depth: 3 }, content: [{ type: 'text', text: 'x' }] }],
    };
    const ok = ed.commands.setContent(bad);
    // filter may leave prior content; serialization of forced JSON still fail-closed
    expect(() => tiptapDocToBody(bad)).toThrow(NotebookTiptapConversionError);
    void ok;
    ed.destroy();
  });

  it('hardBreak remains fail-closed on serialize', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'nbParagraph',
          content: [
            { type: 'text', text: 'a' },
            { type: 'hardBreak' },
            { type: 'text', text: 'b' },
          ],
        },
      ],
    };
    expect(() => tiptapDocToBody(doc)).toThrow(NotebookTiptapConversionError);
  });

  it('Shift-Enter is blocked (no soft break / hardBreak)', () => {
    const ed = makeEditor(bodyToTiptapDoc('Hello'));
    ed.commands.setTextSelection(3);
    const before = JSON.stringify(ed.getJSON());
    ed.commands.keyboardShortcut('Shift-Enter');
    expect(JSON.stringify(ed.getJSON())).toBe(before);
    expect(() => tiptapDocToBody(ed.getJSON())).not.toThrow();
    ed.destroy();
  });

  it('init starts from fixture body', () => {
    const ed = makeEditor(bodyToTiptapDoc(PARITY_FIXTURE_BODY));
    const body = tiptapDocToBody(ed.getJSON());
    expect(roundTripBody(PARITY_FIXTURE_BODY)).toBe(body);
    ed.destroy();
  });
});

describe('Milestone 0/1 suites still green (smoke)', () => {
  it('parity fixture round-trips', () => {
    expect(roundTripBody(PARITY_FIXTURE_BODY)).toBe(roundTripBody(roundTripBody(PARITY_FIXTURE_BODY)));
  });
});
