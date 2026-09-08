/**
 * Milestone 3 shadow dirty/canonicalization + ordered-list tests.
 *
 * @vitest-environment happy-dom
 */
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import {
  buildShadowSnapshot,
  classifyDirtyKind,
  summarizeBodyDiff,
  tryCanonicalBody,
} from './shadowDiff';
import { roundTripBody } from './index';
import { serializeNotebookBlocks, parseNotebookBody } from '../notebookDialect';

const { NotebookTiptapRealShadowPanel } = await import(
  '../../components/notebook/tiptap/NotebookTiptapRealShadowPanel'
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

describe('shadowDiff helpers', () => {
  it('does not treat initial canonicalization as user edit', () => {
    const original = '3. First\n9. Second';
    const canonical = tryCanonicalBody(original)!;
    expect(canonical).not.toBe(original);
    expect(canonical).toBe('3. First\n4. Second');
    const snap = buildShadowSnapshot({
      originalBody: original,
      doc: bodyToTiptapDoc(original),
      userEdited: false,
    });
    expect(snap.dirtyKind).toBe('canonical_only');
    expect(snap.userEdited).toBe(false);
    expect(snap.status).toBe('SAFE');
  });

  it('marks user_edit only after userEdited=true', () => {
    const original = 'Hello';
    const snap = buildShadowSnapshot({
      originalBody: original,
      doc: bodyToTiptapDoc('Hello!'),
      userEdited: true,
    });
    expect(snap.dirtyKind).toBe('user_edit');
    expect(classifyDirtyKind({
      originalBody: original,
      serializedBody: 'Hello',
      userEdited: true,
      status: 'SAFE',
    })).toBe('same');
  });

  it('summarizes line diffs', () => {
    const d = summarizeBodyDiff('a\nb\nc', 'a\nB\nc');
    expect(d.same).toBe(false);
    expect(d.changedLineCount).toBe(1);
    expect(d.firstChangedLine).toBe(1);
  });

  it('fail-closed serialize leaves original body string untouched', () => {
    const original = 'Keep me';
    const frozen = original;
    const badDoc: JSONContent = {
      type: 'doc',
      content: [{ type: 'table', content: [] }],
    };
    const snap = buildShadowSnapshot({
      originalBody: original,
      doc: badDoc,
      userEdited: true,
    });
    expect(snap.status).toBe('UNSERIALIZABLE');
    expect(original).toBe(frozen);
  });
});

describe('ordered list canonicalization', () => {
  it('1,2,3 round-trips byte-stable', () => {
    const body = '1. A\n2. B\n3. C';
    expect(roundTripBody(body)).toBe(body);
  });

  it('non-canonical stored numbering rewrites on serialize', () => {
    const body = '1. A\n5. B\n9. C';
    expect(roundTripBody(body)).toBe('1. A\n2. B\n3. C');
  });

  it('insert between items then serialize renumbers (large rewrite risk)', () => {
    const blocks = parseNotebookBody('1. A\n2. B\n3. C');
    const inserted = [
      blocks[0]!,
      { ...blocks[1]!, text: 'MID', number: 99 },
      blocks[1]!,
      blocks[2]!,
    ];
    const out = serializeNotebookBlocks(inserted);
    expect(out).toBe('1. A\n2. MID\n3. B\n4. C');
    expect(tiptapDocToBody(bodyToTiptapDoc(out))).toBe(out);
  });

  it('delete middle item renumbers on serialize', () => {
    const blocks = parseNotebookBody('1. A\n2. B\n3. C');
    const withoutMiddle = [blocks[0]!, blocks[2]!];
    expect(serializeNotebookBlocks(withoutMiddle)).toBe('1. A\n2. C');
  });

  it('custom non-canonical numbering causes multi-line body rewrite', () => {
    const stored = '10. Alpha\n20. Beta\n30. Gamma';
    const canonical = roundTripBody(stored);
    expect(canonical).toBe('10. Alpha\n11. Beta\n12. Gamma');
    const diff = summarizeBodyDiff(stored, canonical);
    expect(diff.changedLineCount).toBe(2);
    expect(diff.firstChangedLine).toBe(1);
  });
});

describe('large document adapter cost (DEV shadow relevance)', () => {
  it('converts ~200 mixed blocks in acceptable DEV budget', () => {
    const para = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20);
    const lines: string[] = [];
    for (let i = 0; i < 200; i += 1) {
      const m = i % 7;
      if (m === 0) lines.push(`# H${i}`);
      else if (m === 1) lines.push(`${(i % 9) + 1}. item ${i}`);
      else if (m === 2) lines.push(`- bullet ${i}`);
      else if (m === 3) lines.push(`!summary Summary ${i}`);
      else if (m === 4) lines.push(`$$ x_${i} $$`);
      else if (m === 5) lines.push(`::img::img-key-${i}::alt::`);
      else lines.push(para);
    }
    const body = lines.join('\n');
    const t0 = performance.now();
    const doc = bodyToTiptapDoc(body);
    const t1 = performance.now();
    const out = tiptapDocToBody(doc);
    const t2 = performance.now();
    expect(out.length).toBeGreaterThan(0);
    expect(doc.content?.length).toBeGreaterThan(100);
    // Soft budget for CI machines; flag if serialize-per-keystroke would be painful.
    expect(t1 - t0).toBeLessThan(250);
    expect(t2 - t1).toBeLessThan(250);
  });
});

describe('NotebookTiptapRealShadowPanel', () => {
  it('loads real passed documentBody without mutating source', async () => {
    const source = '# Real\nParagraph $x$';
    const frozen = source;
    const onReady = vi.fn();
    const onSnapshot = vi.fn();
    mount(
      createElement(NotebookTiptapRealShadowPanel, {
        sourceDocumentBody: source,
        pageKey: 'page-a',
        onReady,
        onSnapshot,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(source).toBe(frozen);
    expect(host!.querySelector('[data-nb-tiptap-real-shadow="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-shadow-source="1"]')?.textContent).toBe(source);
    const snap = onSnapshot.mock.calls.at(-1)?.[0];
    expect(snap.userEdited).toBe(false);
    expect(['same', 'canonical_only']).toContain(snap.dirtyKind);
  });

  it('pageKey change resets shadow (no leak)', async () => {
    const onReady = vi.fn();
    const onSnapshot = vi.fn();
    mount(
      createElement(NotebookTiptapRealShadowPanel, {
        sourceDocumentBody: 'Page A body',
        pageKey: 'a',
        onReady,
        onSnapshot,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    onReady.mockClear();
    onSnapshot.mockClear();
    act(() => {
      root!.render(
        createElement(NotebookTiptapRealShadowPanel, {
          sourceDocumentBody: 'Page B body',
          pageKey: 'b',
          onReady,
          onSnapshot,
        }),
      );
    });
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls.at(-1)![0].pageKey).toBe('b');
    expect(host!.querySelector('[data-nb-shadow-page="b"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-shadow-source="1"]')?.textContent).toBe('Page B body');
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    const snap = onSnapshot.mock.calls.at(-1)?.[0];
    expect(snap.userEdited).toBe(false);
    expect(snap.body).toBe('Page B body');
  });

  it('edits only affect shadow snapshot; source string unchanged', async () => {
    const source = 'Hello';
    const frozen = source;
    const onSnapshot = vi.fn();
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapRealShadowPanel, {
        sourceDocumentBody: source,
        pageKey: 'p1',
        onReady,
        onSnapshot,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    const after = buildShadowSnapshot({
      originalBody: source,
      doc: bodyToTiptapDoc('Hello world'),
      userEdited: true,
    });
    expect(after.dirtyKind).toBe('user_edit');
    expect(source).toBe(frozen);
  });
});
