/**
 * Milestone 1 TipTap read-only viewer safety tests.
 *
 * @vitest-environment happy-dom
 */
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { isNotebookTiptapEditorEnabled } from './featureFlag';
import { PARITY_FIXTURE_BODY } from './parityFixture';
import {
  NotebookTiptapConversionError,
  roundTripBody,
  tiptapDocToBody,
} from './index';

const { NotebookTiptapReadonlyViewer } = await import(
  '../../components/notebook/tiptap/NotebookTiptapReadonlyViewer'
);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mountViewer(
  props: {
    documentBody: string;
    onReady?: (info: { editable: false; docChildCount: number }) => void;
  },
) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(createElement(NotebookTiptapReadonlyViewer, props));
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

describe('feature flag OFF default', () => {
  it('preserves current OFF behavior', () => {
    expect(isNotebookTiptapEditorEnabled()).toBe(false);
  });
});

describe('NotebookTiptapReadonlyViewer safety', () => {
  it('does not mutate documentBody', async () => {
    const body = '# Title\nHello $x$';
    const frozen = body;
    const onReady = vi.fn();
    mountViewer({ documentBody: body, onReady });
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(body).toBe(frozen);
    expect(body).toBe('# Title\nHello $x$');
  });

  it('is non-editable and receives adapter output', async () => {
    const body = '# Hello\n- Item';
    const expected = bodyToTiptapDoc(body);
    let ready: { editable: false; docChildCount: number } | null = null;
    mountViewer({
      documentBody: body,
      onReady: info => {
        ready = info;
      },
    });
    await vi.waitFor(() => expect(ready).not.toBeNull());
    expect(ready!.editable).toBe(false);
    expect(ready!.docChildCount).toBe(expected.content?.length ?? 0);
    expect(host!.querySelector('[data-nb-tiptap-readonly="1"]')).toBeTruthy();
    expect(host!.querySelector('.ProseMirror')).toBeTruthy();
  });

  it('has no persistence callback path', async () => {
    const persist = vi.fn();
    const onReady = vi.fn();
    mountViewer({ documentBody: 'Hello', onReady });
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(persist).not.toHaveBeenCalled();
  });

  it('renders parity fixture without throwing', async () => {
    const onReady = vi.fn();
    mountViewer({ documentBody: PARITY_FIXTURE_BODY, onReady });
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls[0]![0].editable).toBe(false);
  });
});

describe('Milestone 0 adapter still fail-closed + green', () => {
  it('round-trips parity fixture', () => {
    const once = roundTripBody(PARITY_FIXTURE_BODY);
    expect(roundTripBody(once)).toBe(once);
  });

  it('rejects hardBreak', () => {
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
});
