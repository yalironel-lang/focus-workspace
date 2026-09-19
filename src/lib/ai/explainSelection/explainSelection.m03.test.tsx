/**
 * @vitest-environment happy-dom
 *
 * M0.3 Select → Explain — focus visibility, snapshot freeze, request lifecycle.
 */

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { bodyToTiptapDoc } from '../../notebookTiptap/blocksToTiptapDoc';
import { createNotebookTiptapSandboxExtensions } from '../../notebookTiptap/sandboxExtensions';
import { isExplainableFocus } from './isExplainableFocus';
import { extractFocus } from '../context/extractFocus';
import type { ZikukAiContext } from '../context/types';
import type { ZikukAiResponse } from '../gatewayClient';

const zikukAiRequest = vi.hoisted(() => vi.fn());

vi.mock('../gatewayClient', async () => {
  const actual = await vi.importActual<typeof import('../gatewayClient')>('../gatewayClient');
  return {
    ...actual,
    zikukAiRequest: (...args: unknown[]) => zikukAiRequest(...args),
  };
});

const { NotebookTiptapCandidateSelectionToolbar } = await import(
  '../../../components/notebook/tiptap/NotebookTiptapCandidateSelectionToolbar'
);
const { useExplainSelectionController } = await import('./useExplainSelectionController');

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

function cleanup() {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  document.querySelectorAll('[data-nb-candidate-explain-panel]').forEach(el => el.remove());
  document.querySelectorAll('[data-nb-candidate-selection-toolbar]').forEach(el => el.remove());
}

function makeEditor(body: string): Editor {
  const doc = bodyToTiptapDoc(body);
  const ed = new Editor({
    extensions: createNotebookTiptapSandboxExtensions({ editable: true }),
    content: doc,
    editable: true,
  });
  // Attach to DOM so posToDOMRect / portal geometry work.
  const el = document.createElement('div');
  document.body.appendChild(el);
  ed.mount(el);
  return ed;
}

const AI_HOST = {
  userId: 'user-1',
  sectionId: 'section-1',
  notebookObjectId: 'nb-1',
  pageId: 'page-1',
  pageKey: 'page-1',
};

function selectAllText(ed: Editor) {
  const { doc } = ed.state;
  ed.view.dispatch(
    ed.state.tr.setSelection(TextSelection.create(doc, 1, Math.max(2, doc.content.size - 1))),
  );
}

describe('isExplainableFocus', () => {
  it('accepts text / math / table; rejects empty/image/handwriting', () => {
    expect(
      isExplainableFocus({
        kind: 'text',
        text: 'hello',
        from: 1,
        to: 6,
        blockKind: 'paragraph',
      }),
    ).toBe(true);
    expect(
      isExplainableFocus({
        kind: 'math_inline',
        latex: 'x^2',
        from: 1,
        to: 2,
        blockKind: 'paragraph',
      }),
    ).toBe(true);
    expect(
      isExplainableFocus({
        kind: 'table',
        mode: 'whole_table',
        rows: 2,
        cols: 2,
        from: 1,
        to: 10,
      }),
    ).toBe(true);
    expect(isExplainableFocus({ kind: 'empty' })).toBe(false);
    expect(
      isExplainableFocus({
        kind: 'image',
        assetKey: 'a',
        alt: '',
        from: 1,
        to: 2,
      }),
    ).toBe(false);
    expect(
      isExplainableFocus({
        kind: 'handwriting',
        assetKey: 'h',
        from: 1,
        to: 2,
      }),
    ).toBe(false);
  });
});

describe('Explain toolbar visibility', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows Explain for valid text selection and hides for empty caret', async () => {
    const ed = makeEditor('Hello derivative world');
    selectAllText(ed);
    mount(
      createElement(NotebookTiptapCandidateSelectionToolbar, {
        editor: ed,
        pageKey: 'page-1',
        aiHost: AI_HOST,
      }),
    );
    await act(async () => {
      ed.commands.focus();
      window.dispatchEvent(new Event('pointerup'));
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-fmt="explain"]')).toBeTruthy();
    });

    act(() => {
      ed.commands.setTextSelection(2);
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-fmt="explain"]')).toBeNull();
    });
    ed.destroy();
  });
});

describe('useExplainSelectionController', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function Harness({
    editor,
    pageKey = 'page-1',
    onReady,
  }: {
    editor: Editor;
    pageKey?: string;
    onReady: (api: ReturnType<typeof useExplainSelectionController>) => void;
  }) {
    const api = useExplainSelectionController({
      editor,
      host: AI_HOST,
      pageKey,
    });
    onReady(api);
    return createElement('div', {
      'data-phase': api.state.phase,
      'data-text': api.state.resultText ?? '',
      'data-error': api.state.errorMessage ?? '',
    });
  }

  it('captures frozen context before selection changes and sends explain_selection once', async () => {
    const ed = makeEditor('The derivative of x squared is 2x.');
    selectAllText(ed);
    const focusBefore = extractFocus(ed);
    expect(focusBefore.kind).toBe('text');

    let api!: ReturnType<typeof useExplainSelectionController>;
    let resolveReq!: (r: ZikukAiResponse) => void;
    zikukAiRequest.mockImplementation(
      () =>
        new Promise<ZikukAiResponse>(resolve => {
          resolveReq = resolve;
        }),
    );

    mount(
      createElement(Harness, {
        editor: ed,
        onReady: a => {
          api = a;
        },
      }),
    );

    act(() => {
      api.activateExplain();
    });

    // Mutate selection after activation — must not change frozen request context
    act(() => {
      ed.commands.setTextSelection(1);
    });

    expect(zikukAiRequest).toHaveBeenCalledTimes(1);
    const call = zikukAiRequest.mock.calls[0]?.[0] as {
      capability: string;
      context: ZikukAiContext;
    };
    expect(call.capability).toBe('explain_selection');
    expect(call.context.focus.kind).toBe('text');
    if (call.context.focus.kind === 'text' && focusBefore.kind === 'text') {
      expect(call.context.focus.text).toBe(focusBefore.text);
      expect(call.context.focus.from).toBe(focusBefore.from);
      expect(call.context.focus.to).toBe(focusBefore.to);
    }

    await act(async () => {
      resolveReq({
        version: 1,
        ok: true,
        result: { type: 'text', text: 'It means the slope.' },
      });
    });

    expect(api.state.phase).toBe('success');
    expect(api.state.resultText).toBe('It means the slope.');
    ed.destroy();
  });

  it('retry uses the same frozen context', async () => {
    const ed = makeEditor('Retry me please');
    selectAllText(ed);
    let api!: ReturnType<typeof useExplainSelectionController>;
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: false,
      error: { code: 'provider_unavailable', message: 'The AI service is temporarily unavailable.' },
    });

    mount(
      createElement(Harness, {
        editor: ed,
        onReady: a => {
          api = a;
        },
      }),
    );

    await act(async () => {
      api.activateExplain();
    });
    expect(api.state.phase).toBe('error');
    const firstCtx = api.state.frozenContext;
    expect(firstCtx).toBeTruthy();

    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: true,
      result: { type: 'text', text: 'ok after retry' },
    });

    await act(async () => {
      api.retry();
    });

    expect(zikukAiRequest).toHaveBeenCalledTimes(2);
    const second = zikukAiRequest.mock.calls[1]?.[0] as { context: ZikukAiContext };
    expect(second.context).toEqual(firstCtx);
    expect(api.state.phase).toBe('success');
    ed.destroy();
  });

  it('close while loading aborts and ignores stale success', async () => {
    const ed = makeEditor('Abort this request');
    selectAllText(ed);
    let api!: ReturnType<typeof useExplainSelectionController>;
    let resolveReq!: (r: ZikukAiResponse) => void;
    zikukAiRequest.mockImplementation(
      (_req: unknown, opts?: { signal?: AbortSignal }) =>
        new Promise<ZikukAiResponse>((resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
          resolveReq = resolve;
        }),
    );

    mount(
      createElement(Harness, {
        editor: ed,
        onReady: a => {
          api = a;
        },
      }),
    );

    act(() => {
      api.activateExplain();
    });
    expect(api.state.phase).toBe('loading');

    act(() => {
      api.close();
    });
    expect(api.state.phase).toBe('idle');

    await act(async () => {
      resolveReq({
        version: 1,
        ok: true,
        result: { type: 'text', text: 'stale should not win' },
      });
    });
    expect(api.state.phase).toBe('idle');
    expect(api.state.resultText).toBeNull();
    ed.destroy();
  });

  it('duplicate Explain while loading does not start a second request', async () => {
    const ed = makeEditor('First then second');
    selectAllText(ed);
    let api!: ReturnType<typeof useExplainSelectionController>;
    const resolvers: Array<(r: ZikukAiResponse) => void> = [];
    zikukAiRequest.mockImplementation(
      () =>
        new Promise<ZikukAiResponse>(resolve => {
          resolvers.push(resolve);
        }),
    );

    mount(
      createElement(Harness, {
        editor: ed,
        onReady: a => {
          api = a;
        },
      }),
    );

    act(() => {
      api.activateExplain();
    });
    expect(api.state.phase).toBe('loading');
    act(() => {
      api.activateExplain();
    });
    expect(zikukAiRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers[0]?.({
        version: 1,
        ok: true,
        result: { type: 'text', text: 'only-one' },
      });
    });
    expect(api.state.phase).toBe('success');
    expect(api.state.resultText).toBe('only-one');
    ed.destroy();
  });

  it('pageKey change aborts and clears the panel', async () => {
    const ed = makeEditor('Page change clears');
    selectAllText(ed);
    let api!: ReturnType<typeof useExplainSelectionController>;
    let pageKey = 'page-1';

    function PageHarness() {
      const a = useExplainSelectionController({
        editor: ed,
        host: AI_HOST,
        pageKey,
      });
      api = a;
      return createElement('div', { 'data-phase': a.state.phase });
    }

    zikukAiRequest.mockImplementation(
      () =>
        new Promise<ZikukAiResponse>(() => {
          /* pending */
        }),
    );

    mount(createElement(PageHarness));
    act(() => {
      api.activateExplain();
    });
    expect(api.state.phase).toBe('loading');

    pageKey = 'page-2';
    act(() => {
      root!.render(createElement(PageHarness));
    });
    expect(api.state.phase).toBe('idle');
    ed.destroy();
  });
});

describe('Explain panel UI', () => {
  beforeEach(() => {
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: true,
      result: { type: 'text', text: 'A clear explanation.' },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders loading then success without mutating the document', async () => {
    const ed = makeEditor('Explain this sentence now');
    const beforeJson = JSON.stringify(ed.getJSON());
    selectAllText(ed);

    mount(
      createElement(NotebookTiptapCandidateSelectionToolbar, {
        editor: ed,
        pageKey: 'page-1',
        aiHost: AI_HOST,
      }),
    );

    await act(async () => {
      window.dispatchEvent(new Event('pointerup'));
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-fmt="explain"]')).toBeTruthy();
    });

    const btn = document.querySelector('[data-nb-candidate-fmt="explain"]') as HTMLButtonElement;
    await act(async () => {
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, cancelable: true }));
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-explain-success]')).toBeTruthy();
    });
    expect(document.querySelector('[data-nb-candidate-explain-success]')?.textContent).toContain(
      'A clear explanation.',
    );
    expect(JSON.stringify(ed.getJSON())).toBe(beforeJson);
    expect(zikukAiRequest).toHaveBeenCalledTimes(1);
    ed.destroy();
  });

  it('Escape closes the explain panel', async () => {
    const ed = makeEditor('Close with escape key');
    selectAllText(ed);
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: true,
      result: { type: 'text', text: 'done' },
    });

    mount(
      createElement(NotebookTiptapCandidateSelectionToolbar, {
        editor: ed,
        pageKey: 'page-1',
        aiHost: AI_HOST,
      }),
    );
    await act(async () => {
      window.dispatchEvent(new Event('pointerup'));
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-fmt="explain"]')).toBeTruthy();
    });
    const btn = document.querySelector('[data-nb-candidate-fmt="explain"]') as HTMLButtonElement;
    await act(async () => {
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, cancelable: true }));
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-explain-panel]')).toBeTruthy();
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-explain-panel]')).toBeNull();
    });
    ed.destroy();
  });
});
