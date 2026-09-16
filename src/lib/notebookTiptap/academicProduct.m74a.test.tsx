/**
 * M7.4A — Academic Blocks architecture & core product set.
 * Reuses existing callout / !{tone} canonical model (explicit toolbar only).
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import {
  PRODUCT_ACADEMIC_TONES,
  insertCandidateBlockAtTarget,
  runCandidateBlockCommand,
  textLooksLikeAcademicTypedLabel,
} from './candidateBlockCommands';
import { resolveNbImageInsertTarget } from './candidateImageInsert';
import { calloutLabel } from './visualTokens';
import { runCandidateFormatCommand } from './candidateFormatCommands';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { applyNotebookPersist, findActivePage } from '../notebookPages/hydrate';
import type { NotebookContent } from '../../types/notebook';
import { serializeRichLine } from '../notebookInlineMarks';
import type { CalloutTone } from '../notebookDialect';

const onUserEditMock = vi.fn();

function makeEditor(body: string, codecVersion?: number) {
  return new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content: bodyToTiptapDoc(body, codecVersion),
    editable: true,
  });
}

function selectAllText(ed: Editor) {
  const { doc } = ed.state;
  ed.chain().focus().setTextSelection({ from: 1, to: doc.content.size - 1 }).run();
}

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
  onUserEditMock.mockReset();
  vi.clearAllMocks();
});

function openProductBlockMenu() {
  const trigger = host!.querySelector('[data-nb-product-block="1"]') as HTMLButtonElement;
  act(() => {
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    trigger.click();
  });
  return document.querySelector('[data-nb-product-block-menu="1"]') as HTMLElement;
}

const EXPECTED_LABELS: Record<CalloutTone, string> = {
  definition: 'Definition',
  concept: 'Key Concept',
  theorem: 'Theorem',
  example: 'Example',
  mistake: 'Common Mistake',
  summary: 'Summary',
  review: 'Review',
};

describe('M7.4A product academic type model', () => {
  it('exposes exactly the 7 core academic types in product order', () => {
    expect([...PRODUCT_ACADEMIC_TONES]).toEqual([
      'definition',
      'concept',
      'theorem',
      'example',
      'mistake',
      'summary',
      'review',
    ]);
    for (const tone of PRODUCT_ACADEMIC_TONES) {
      expect(calloutLabel(tone)).toBe(EXPECTED_LABELS[tone]);
    }
  });
});

describe('M7.4A canonical round-trip + open safety', () => {
  it.each([...PRODUCT_ACADEMIC_TONES])(
    '1. %s legacy and V1 round-trip without TipTap JSON/base64',
    tone => {
      const legacy = `!${tone} Academic body ${tone}`;
      const ed = makeEditor(legacy);
      expect(ed.state.doc.firstChild?.type.name).toBe('nbCallout');
      expect(ed.state.doc.firstChild?.attrs.tone).toBe(tone);
      const out = tiptapDocToBody(ed.getJSON());
      expect(out.startsWith(`!${tone} `)).toBe(true);
      expect(out).toContain(`Academic body ${tone}`);
      expect(out).not.toMatch(/"type"\s*:\s*"doc"/);
      expect(out).not.toMatch(/data:image\//);
      ed.destroy();

      const v1 =
        `~nb1:["callout","Academic body ${tone}",[],"${tone}"]`;
      const edV1 = makeEditor(v1, 1);
      expect(edV1.state.doc.firstChild?.attrs.tone).toBe(tone);
      expect(tiptapDocToBody(edV1.getJSON(), 1)).toContain(`"${tone}"`);
      edV1.destroy();
    },
  );

  it('2. legacy open compatibility for stored callouts', () => {
    for (const tone of PRODUCT_ACADEMIC_TONES) {
      const ed = makeEditor(`!${tone} Stored`);
      expect(ed.state.doc.firstChild?.type.name).toBe('nbCallout');
      ed.destroy();
    }
  });

  it('3. opening TipTap with academic content causes zero onUserEdit writes', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: '!definition Open safety',
        pageKey: 'page-1',
        onReady,
        onUserEdit: onUserEditMock,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb="nbCallout"]')).toBeTruthy(),
    );
    expect(onUserEditMock).not.toHaveBeenCalled();
  });
});

describe('M7.4A conversions + content preservation', () => {
  it('4–7. paragraph ↔ each academic type; cross-type; text preserved', () => {
    for (const tone of PRODUCT_ACADEMIC_TONES) {
      const ed = makeEditor('Preserve this sentence');
      selectAllText(ed);
      expect(runCandidateBlockCommand(ed, `callout:${tone}`)).toBe(true);
      expect(ed.state.selection.$from.parent.type.name).toBe('nbCallout');
      expect(ed.state.selection.$from.parent.attrs.tone).toBe(tone);
      expect(ed.state.selection.$from.parent.textContent).toBe('Preserve this sentence');

      const next =
        tone === 'definition' ? 'theorem' : tone === 'theorem' ? 'example' : 'definition';
      expect(runCandidateBlockCommand(ed, `callout:${next}`)).toBe(true);
      expect(ed.state.selection.$from.parent.attrs.tone).toBe(next);
      expect(ed.state.selection.$from.parent.textContent).toBe('Preserve this sentence');

      expect(runCandidateBlockCommand(ed, 'paragraph')).toBe(true);
      expect(ed.state.selection.$from.parent.type.name).toBe('nbParagraph');
      expect(ed.state.selection.$from.parent.textContent).toBe('Preserve this sentence');
      ed.destroy();
    }
  });

  it('8–10. marks, inline math, and link survive conversion', () => {
    const rich = serializeRichLine({
      plain: 'Bold math $x^2$ link',
      marks: [
        { s: 0, e: 4, t: 'b' },
        { s: 16, e: 20, t: 'a', v: 'https://example.com' },
      ],
    });
    const ed = makeEditor(rich);
    selectAllText(ed);
    expect(runCandidateBlockCommand(ed, 'callout:definition')).toBe(true);
    const body = tiptapDocToBody(ed.getJSON());
    expect(body.startsWith('!definition ')).toBe(true);
    expect(body).toContain('"t":"b"');
    expect(body).toContain('$x^2$');
    expect(body).toContain('https://example.com');
    expect(runCandidateBlockCommand(ed, 'callout:concept')).toBe(true);
    const body2 = tiptapDocToBody(ed.getJSON());
    expect(body2.startsWith('!concept ')).toBe(true);
    expect(body2).toContain('"t":"b"');
    expect(body2).toContain('$x^2$');
    expect(body2).toContain('https://example.com');
    ed.destroy();
  });

  it('11–12. Auto/LTR/RTL + Hebrew preserved across conversion', () => {
    const ed = makeEditor('הגדרה חשובה');
    ed.chain().focus().updateAttributes('nbParagraph', { dir: 'rtl' }).run();
    selectAllText(ed);
    expect(runCandidateBlockCommand(ed, 'callout:definition')).toBe(true);
    expect(ed.state.selection.$from.parent.attrs.dir).toBe('rtl');
    expect(ed.state.selection.$from.parent.textContent).toBe('הגדרה חשובה');
    const body = tiptapDocToBody(ed.getJSON());
    expect(body).toContain('הגדרה חשובה');
    expect(body.startsWith('!definition ')).toBe(true);

    ed.chain().focus().updateAttributes('nbCallout', { dir: 'ltr' }).run();
    expect(ed.state.selection.$from.parent.attrs.dir).toBe('ltr');
    ed.destroy();
  });
});

describe('M7.4A document flow + undo', () => {
  it('13–14. Enter continuation and range deletion inside academic block', () => {
    const ed = makeEditor('!definition Alpha Beta Gamma');
    const textLen = ed.state.doc.firstChild!.textContent.length;
    ed.chain().focus().setTextSelection({ from: 7, to: 12 }).run(); // "Beta "
    ed.commands.deleteSelection();
    expect(ed.state.doc.firstChild?.type.name).toBe('nbCallout');
    expect(ed.state.doc.firstChild?.textContent).toContain('Alpha');
    expect(ed.state.doc.firstChild?.textContent).toContain('Gamma');
    expect(ed.state.doc.firstChild?.textContent).not.toContain('Beta');

    ed.commands.focus('end');
    expect(ed.commands.keyboardShortcut('Enter')).toBe(true);
    expect(ed.state.doc.childCount).toBeGreaterThanOrEqual(2);
    expect(ed.state.doc.child(1).type.name).toBe('nbParagraph');
    void textLen;
    ed.destroy();
  });

  it('15. Undo/Redo conversion chain Paragraph → Definition → Theorem → Paragraph', () => {
    const ed = makeEditor('Session undo body');
    selectAllText(ed);
    expect(runCandidateBlockCommand(ed, 'callout:definition')).toBe(true);
    expect(ed.state.selection.$from.parent.type.name).toBe('nbCallout');
    expect(ed.state.selection.$from.parent.attrs.tone).toBe('definition');

    expect(runCandidateBlockCommand(ed, 'callout:theorem')).toBe(true);
    expect(ed.state.selection.$from.parent.attrs.tone).toBe('theorem');

    expect(ed.commands.undo()).toBe(true);
    // Session undo returns to prior academic type or paragraph (history granularity).
    const afterFirstUndo = ed.state.selection.$from.parent;
    if (afterFirstUndo.type.name === 'nbCallout') {
      expect(afterFirstUndo.attrs.tone).toBe('definition');
      expect(ed.commands.undo()).toBe(true);
    }
    expect(ed.state.selection.$from.parent.type.name).toBe('nbParagraph');
    expect(ed.state.selection.$from.parent.textContent).toBe('Session undo body');

    expect(ed.commands.redo()).toBe(true);
    expect(ed.state.selection.$from.parent.type.name).toBe('nbCallout');
    ed.destroy();
  });
});

describe('M7.4A refresh + multi-page + fail-closed', () => {
  it('16. refresh/reopen representation stays !tone', () => {
    const body = '!example Worked example body';
    const ed = makeEditor(body);
    const out = tiptapDocToBody(ed.getJSON());
    ed.destroy();
    const again = makeEditor(out);
    expect(again.state.doc.firstChild?.attrs.tone).toBe('example');
    expect(tiptapDocToBody(again.getJSON())).toContain('Worked example body');
    again.destroy();
  });

  it('17. multi-page isolation: P2 academic edit does not modify P1/P3', () => {
    let nb: NotebookContent = {
      type: 'notebook',
      schemaVersion: 1,
      body: '',
      bodyCodecVersion: 1,
      activePageId: 'p2',
      activeSectionId: 's1',
      sections: [{ id: 's1', title: 'S', pageIds: ['p1', 'p2', 'p3'] }],
      pages: [
        {
          id: 'p1',
          sectionId: 's1',
          kind: 'document',
          title: 'P1',
          documentBody: '~nb1:["paragraph","P1 text",[],null]',
          documentBodyCodecVersion: 1,
        },
        {
          id: 'p2',
          sectionId: 's1',
          kind: 'document',
          title: 'P2',
          documentBody: '~nb1:["paragraph","P2 text",[],null]',
          documentBodyCodecVersion: 1,
        },
        {
          id: 'p3',
          sectionId: 's1',
          kind: 'document',
          title: 'P3',
          documentBody: '~nb1:["paragraph","P3 text",[],null]',
          documentBodyCodecVersion: 1,
        },
      ],
    };
    const p2Body = '~nb1:["callout","P2 definition",[],"definition"]';
    nb = applyNotebookPersist(nb, { body: p2Body, codecVersion: 1 });
    expect(findActivePage(nb)?.id).toBe('p2');
    expect(nb.pages!.find(p => p.id === 'p1')!.documentBody).toContain('P1 text');
    expect(nb.pages!.find(p => p.id === 'p1')!.documentBody).not.toContain('callout');
    expect(nb.pages!.find(p => p.id === 'p2')!.documentBody).toContain('"definition"');
    expect(nb.pages!.find(p => p.id === 'p3')!.documentBody).toContain('P3 text');
    expect(nb.pages!.find(p => p.id === 'p3')!.documentBody).not.toContain('callout');
  });

  it('18. malformed V1 still fail-closed', () => {
    expect(() => bodyToTiptapDoc('~nb1:["callout"', 1)).toThrow();
  });

  it('19. no TipTap JSON persistence for academic blocks', () => {
    const ed = makeEditor('Body');
    runCandidateBlockCommand(ed, 'callout:summary');
    const out = tiptapDocToBody(ed.getJSON());
    expect(out.startsWith('!summary ')).toBe(true);
    expect(out).not.toMatch(/"type"\s*:\s*"nbCallout"/);
    expect(out).not.toMatch(/"type"\s*:\s*"doc"/);
    ed.destroy();
  });
});

describe('M7.4A product menu click path', () => {
  it('20–24. + Add → Definition CREATES (does not convert non-empty); Image/HW/Math remain; menu closes', async () => {
    let editor: Editor | null = null;
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: '~nb1:["paragraph","Keep my text",[],null]',
        sourceBodyCodecVersion: 1,
        pageKey: 'page-1',
        onReady,
        onEditorReady: ed => {
          editor = ed;
        },
        onUserEdit: onUserEditMock,
        onInsertImageFile: vi.fn(),
        onInsertHandwriting: vi.fn(),
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await vi.waitFor(() => expect(editor).toBeTruthy());

    // Caret at end of paragraph → insert AFTER (not convert).
    act(() => {
      const end = editor!.state.doc.content.size - 1;
      editor!.commands.setTextSelection(end);
    });

    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeNull();
    const menu = openProductBlockMenu();
    expect(menu).toBeTruthy();

    const labels = Array.from(menu.querySelectorAll('[data-nb-product-menu-item-label="1"]')).map(
      el => (el.textContent ?? '').trim(),
    );
    for (const tone of PRODUCT_ACADEMIC_TONES) {
      expect(labels).toContain(EXPECTED_LABELS[tone]);
      expect(
        menu.querySelector(`[data-nb-product-academic-option="callout:${tone}"]`),
      ).toBeTruthy();
    }
    expect(menu.querySelector('[data-nb-product-image-option="1"]')).toBeTruthy();
    expect(menu.querySelector('[data-nb-product-handwriting-option="1"]')).toBeTruthy();
    expect(menu.querySelector('[data-nb-product-block-option="math"]')).toBeTruthy();
    expect(menu.querySelector('[data-nb-product-menu-section="academic"]')?.textContent).toMatch(
      /Academic/i,
    );
    expect(menu.querySelector('[data-nb-product-menu-section="text"]')?.textContent).toMatch(/Text/i);
    expect(menu.querySelector('[data-nb-product-menu-section="insert"]')?.textContent).toMatch(
      /Insert/i,
    );

    const def = menu.querySelector(
      '[data-nb-product-academic-option="callout:definition"]',
    ) as HTMLButtonElement;
    act(() => {
      def.click();
    });
    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeNull();

    const types: string[] = [];
    const tones: string[] = [];
    editor!.state.doc.forEach(node => {
      types.push(node.type.name);
      if (node.type.name === 'nbCallout') tones.push(String(node.attrs.tone));
    });
    expect(types).toContain('nbParagraph');
    expect(types).toContain('nbCallout');
    expect(tones).toEqual(['definition']);
    // Original paragraph text preserved (not converted away).
    expect(editor!.state.doc.child(0).textContent).toBe('Keep my text');
    expect(editor!.state.selection.$from.parent.type.name).toBe('nbCallout');
    expect(editor!.state.selection.$from.parent.attrs.tone).toBe('definition');
    expect(editor!.state.selection.$from.parent.textContent).toBe('');

    await vi.waitFor(() => expect(onUserEditMock).toHaveBeenCalled());
    const lastBody = onUserEditMock.mock.calls.at(-1)![0] as string;
    expect(lastBody).toContain('definition');
    expect(lastBody).toContain('Keep my text');
    expect(lastBody).not.toMatch(/"type"\s*:\s*"doc"/);

    // Outside click closes
    openProductBlockMenu();
    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeTruthy();
    act(() => {
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeNull();

    // Escape closes
    openProductBlockMenu();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeNull();
  });

  it('+ Add creates successive independent academic blocks (A / Def / Concept / B)', () => {
    const ed = makeEditor('A\nB');
    // Caret at end of A → insert between A and B
    const endA = ed.state.doc.child(0).nodeSize - 1;
    ed.commands.setTextSelection(endA);
    const target1 = resolveNbImageInsertTarget(ed.state);
    expect(insertCandidateBlockAtTarget(ed, 'callout:definition', target1)).toBe(true);

    const afterFirst: Array<{ type: string; tone?: string; text: string }> = [];
    ed.state.doc.forEach(node => {
      afterFirst.push({
        type: node.type.name,
        tone: node.type.name === 'nbCallout' ? String(node.attrs.tone) : undefined,
        text: node.textContent,
      });
    });
    expect(afterFirst).toEqual([
      { type: 'nbParagraph', tone: undefined, text: 'A' },
      { type: 'nbCallout', tone: 'definition', text: '' },
      { type: 'nbParagraph', tone: undefined, text: 'B' },
    ]);

    // Caret remains inside empty Definition after insert → + Add must create sibling after it.
    expect(ed.state.selection.$from.parent.type.name).toBe('nbCallout');
    expect(ed.state.selection.$from.parent.attrs.tone).toBe('definition');
    expect(insertCandidateBlockAtTarget(ed, 'callout:concept')).toBe(true);

    const afterSecond: Array<{ type: string; tone?: string; text: string }> = [];
    ed.state.doc.forEach(node => {
      afterSecond.push({
        type: node.type.name,
        tone: node.type.name === 'nbCallout' ? String(node.attrs.tone) : undefined,
        text: node.textContent,
      });
    });
    expect(afterSecond).toEqual([
      { type: 'nbParagraph', tone: undefined, text: 'A' },
      { type: 'nbCallout', tone: 'definition', text: '' },
      { type: 'nbCallout', tone: 'concept', text: '' },
      { type: 'nbParagraph', tone: undefined, text: 'B' },
    ]);

    expect(ed.state.selection.$from.parent.attrs.tone).toBe('concept');
    expect(insertCandidateBlockAtTarget(ed, 'callout:example')).toBe(true);

    const tones: string[] = [];
    ed.state.doc.forEach(node => {
      if (node.type.name === 'nbCallout') tones.push(String(node.attrs.tone));
    });
    expect(tones).toEqual(['definition', 'concept', 'example']);
    expect(ed.state.doc.child(0).textContent).toBe('A');
    expect(ed.state.doc.child(ed.state.doc.childCount - 1).textContent).toBe('B');
    ed.destroy();
  });

  it('real + Add click path: existing Definition stays; new Definition + Key Concept created', async () => {
    let editor: Editor | null = null;
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: '!definition Keep existing\nElsewhere',
        pageKey: 'page-create',
        onReady,
        onEditorReady: ed => {
          editor = ed;
        },
        onUserEdit: onUserEditMock,
        onInsertImageFile: vi.fn(),
        onInsertHandwriting: vi.fn(),
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await vi.waitFor(() => expect(editor).toBeTruthy());

    // Caret at end of "Elsewhere" (not inside existing Definition).
    act(() => {
      const elsewhere = editor!.state.doc.child(1);
      const pos = editor!.state.doc.child(0).nodeSize + elsewhere.nodeSize - 1;
      editor!.commands.setTextSelection(pos);
    });

    openProductBlockMenu();
    act(() => {
      (
        document.querySelector(
          '[data-nb-product-academic-option="callout:definition"]',
        ) as HTMLButtonElement
      ).click();
    });

    let callouts = 0;
    editor!.state.doc.forEach(node => {
      if (node.type.name === 'nbCallout' && node.attrs.tone === 'definition') callouts += 1;
    });
    expect(callouts).toBe(2);
    expect(editor!.state.doc.child(0).textContent).toBe('Keep existing');
    expect(editor!.state.doc.child(0).attrs.tone).toBe('definition');

    // Capture another target after the new Definition (last callout or end of Elsewhere).
    act(() => {
      const last = editor!.state.doc.child(editor!.state.doc.childCount - 1);
      let pos = 0;
      for (let i = 0; i < editor!.state.doc.childCount - 1; i++) {
        pos += editor!.state.doc.child(i).nodeSize;
      }
      pos += last.nodeSize - 1;
      editor!.commands.setTextSelection(pos);
    });

    openProductBlockMenu();
    act(() => {
      (
        document.querySelector(
          '[data-nb-product-academic-option="callout:concept"]',
        ) as HTMLButtonElement
      ).click();
    });

    const snapshot: Array<{ type: string; tone?: string; text: string }> = [];
    editor!.state.doc.forEach(node => {
      snapshot.push({
        type: node.type.name,
        tone: node.type.name === 'nbCallout' ? String(node.attrs.tone) : undefined,
        text: node.textContent,
      });
    });
    const definitions = snapshot.filter(n => n.tone === 'definition');
    expect(definitions.length).toBe(2);
    expect(definitions.some(d => d.text === 'Keep existing')).toBe(true);
    expect(snapshot.some(n => n.tone === 'concept')).toBe(true);
    // Existing definition text never mutated into concept.
    expect(snapshot.find(n => n.text === 'Keep existing')?.tone).toBe('definition');
  });

  it('floating convert still morphs the SAME selected block (Add stays create-only)', async () => {
    let editor: Editor | null = null;
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: '!definition Only one',
        pageKey: 'page-convert',
        onReady,
        onEditorReady: ed => {
          editor = ed;
        },
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    act(() => {
      editor!.commands.setTextSelection(1);
    });
    expect(runCandidateBlockCommand(editor!, 'callout:summary')).toBe(true);
    expect(editor!.state.doc.childCount).toBe(1);
    expect(editor!.state.doc.child(0).attrs.tone).toBe('summary');
    expect(editor!.state.doc.child(0).textContent).toBe('Only one');
  });

  it('typed Definition: does not auto-convert (explicit only)', () => {
    expect(textLooksLikeAcademicTypedLabel('Definition: foo')).toBe(true);
    const ed = makeEditor('Definition: foo');
    expect(ed.state.doc.firstChild?.type.name).toBe('nbParagraph');
    expect(tiptapDocToBody(ed.getJSON()).startsWith('!')).toBe(false);
    ed.destroy();
  });

  it('formatting inside academic block remains editable', () => {
    const ed = makeEditor('!theorem Statement');
    selectAllText(ed);
    expect(runCandidateFormatCommand(ed, { type: 'toggleBold' })).toBe(true);
    const body = tiptapDocToBody(ed.getJSON());
    expect(body.startsWith('!theorem ')).toBe(true);
    expect(body).toContain('"t":"b"');
    ed.destroy();
  });
});
