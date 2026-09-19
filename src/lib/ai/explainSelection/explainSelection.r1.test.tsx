/**
 * @vitest-environment happy-dom
 *
 * Release 1 — Explain Beta polish (labels, errors, retry policy, viewport clamp).
 */

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { bodyToTiptapDoc } from '../../notebookTiptap/blocksToTiptapDoc';
import { createNotebookTiptapSandboxExtensions } from '../../notebookTiptap/sandboxExtensions';
import type { ZikukAiContext } from '../context/types';
import type { ZikukAiErrorCode, ZikukAiResponse } from '../gatewayClient';
import { computeExplainPanelTop } from './computeExplainPanelTop';
import {
  isExplainRetryAllowed,
  userFacingExplainErrorMessage,
} from './userFacingExplainError';
import type { ExplainSelectionState } from './useExplainSelectionController';

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
const { NotebookExplainSelectionPanel } = await import(
  '../../../components/notebook/tiptap/NotebookExplainSelectionPanel'
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

const FROZEN: ZikukAiContext = {
  version: 1,
  capturedAt: '2026-01-01T00:00:00.000Z',
  identity: { userId: 'user-1' },
  academic: { sectionId: 'section-1' },
  surface: {
    type: 'notebook',
    notebookObjectId: 'nb-1',
    pageId: 'page-1',
    pageKey: 'page-1',
  },
  focus: { kind: 'text', text: 'hello', from: 1, to: 6, blockKind: 'paragraph' },
  surroundings: { blocks: [], truncated: false },
};

function selectAllText(ed: Editor) {
  const { doc } = ed.state;
  ed.view.dispatch(
    ed.state.tr.setSelection(TextSelection.create(doc, 1, Math.max(2, doc.content.size - 1))),
  );
}

function errorState(code: ZikukAiErrorCode, message: string): ExplainSelectionState {
  return {
    phase: 'error',
    frozenContext: FROZEN,
    resultText: null,
    errorMessage: message,
    errorCode: code,
    localUnavailable: null,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('userFacingExplainErrorMessage / retry policy', () => {
  it('maps Release 1 safe copy for quota / rate / disabled / provider / timeout / internal', () => {
    expect(userFacingExplainErrorMessage('quota_exceeded', 'raw')).toBe(
      'Daily AI limit reached. Try again tomorrow.',
    );
    expect(userFacingExplainErrorMessage('rate_limited', 'raw')).toBe(
      'Too many requests. Try again shortly.',
    );
    expect(userFacingExplainErrorMessage('ai_disabled', 'raw')).toBe(
      'AI is disabled for this account.',
    );
    expect(userFacingExplainErrorMessage('provider_unavailable', 'raw')).toBe(
      'The AI service is temporarily unavailable. Try again shortly.',
    );
    expect(userFacingExplainErrorMessage('provider_timeout', 'raw')).toBe(
      'The AI service timed out. Try again.',
    );
    expect(userFacingExplainErrorMessage('internal_error', 'raw')).toBe(
      'AI is temporarily unavailable. Try again later.',
    );
  });

  it('Retry allowed only for recoverable codes', () => {
    expect(isExplainRetryAllowed('rate_limited')).toBe(true);
    expect(isExplainRetryAllowed('provider_unavailable')).toBe(true);
    expect(isExplainRetryAllowed('provider_timeout')).toBe(true);
    expect(isExplainRetryAllowed('internal_error')).toBe(true);
    expect(isExplainRetryAllowed('quota_exceeded')).toBe(false);
    expect(isExplainRetryAllowed('ai_disabled')).toBe(false);
  });
});

describe('computeExplainPanelTop', () => {
  it('clamps preferred top so the panel stays within the viewport', () => {
    expect(
      computeExplainPanelTop({
        anchorTop: 700,
        viewportHeight: 800,
        maxHeightPx: 320,
        padding: 12,
        gapBelowToolbar: 44,
      }),
    ).toBe(800 - 12 - 320);
    expect(
      computeExplainPanelTop({
        anchorTop: 40,
        viewportHeight: 800,
        maxHeightPx: 320,
        padding: 12,
        gapBelowToolbar: 44,
      }),
    ).toBe(84);
  });
});

describe('Explain panel error UX + Retry', () => {
  it('quota_exceeded shows safe copy and hides Retry', () => {
    mount(
      createElement(NotebookExplainSelectionPanel, {
        state: errorState('quota_exceeded', 'Daily AI limit reached. Try again tomorrow.'),
        anchor: { top: 40, left: 20, width: 320 },
        onClose: vi.fn(),
        onRetry: vi.fn(),
      }),
    );
    const panel = document.querySelector('[data-nb-candidate-explain-panel]');
    expect(panel?.getAttribute('aria-label')).toBe('Explanation · Beta');
    expect(panel?.textContent).toContain('Explanation · Beta');
    expect(document.querySelector('[data-nb-candidate-explain-error]')?.textContent).toContain(
      'Daily AI limit reached. Try again tomorrow.',
    );
    expect(document.querySelector('[data-nb-candidate-explain-retry]')).toBeNull();
  });

  it('rate_limited shows safe copy and keeps Retry', () => {
    const onRetry = vi.fn();
    mount(
      createElement(NotebookExplainSelectionPanel, {
        state: errorState('rate_limited', 'Too many requests. Try again shortly.'),
        anchor: { top: 40, left: 20, width: 320 },
        onClose: vi.fn(),
        onRetry,
      }),
    );
    expect(document.querySelector('[data-nb-candidate-explain-error]')?.textContent).toContain(
      'Too many requests. Try again shortly.',
    );
    const retry = document.querySelector('[data-nb-candidate-explain-retry]') as HTMLButtonElement;
    expect(retry).toBeTruthy();
    act(() => {
      retry.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, cancelable: true }));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('ai_disabled shows safe copy and hides Retry', () => {
    mount(
      createElement(NotebookExplainSelectionPanel, {
        state: errorState('ai_disabled', 'AI is disabled for this account.'),
        anchor: { top: 40, left: 20, width: 320 },
        onClose: vi.fn(),
        onRetry: vi.fn(),
      }),
    );
    expect(document.querySelector('[data-nb-candidate-explain-error]')?.textContent).toContain(
      'AI is disabled for this account.',
    );
    expect(document.querySelector('[data-nb-candidate-explain-retry]')).toBeNull();
  });

  it('normalizes provider_unavailable copy even if transport message differs', () => {
    mount(
      createElement(NotebookExplainSelectionPanel, {
        state: errorState('provider_unavailable', 'AI Gateway is temporarily unavailable.'),
        anchor: { top: 40, left: 20, width: 320 },
        onClose: vi.fn(),
        onRetry: vi.fn(),
      }),
    );
    expect(document.querySelector('[data-nb-candidate-explain-error]')?.textContent).toContain(
      'The AI service is temporarily unavailable. Try again shortly.',
    );
    expect(document.querySelector('[data-nb-candidate-explain-retry]')).toBeTruthy();
  });
});

describe('Beta label + loading duplicate guard (toolbar)', () => {
  it('shows Explain · Beta and disables while loading; no second request', async () => {
    const ed = makeEditor('Beta label selection text');
    selectAllText(ed);
    let resolveReq!: (r: ZikukAiResponse) => void;
    zikukAiRequest.mockImplementation(
      () =>
        new Promise<ZikukAiResponse>(resolve => {
          resolveReq = resolve;
        }),
    );

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
    expect(btn.getAttribute('aria-label') || btn.getAttribute('title')).toBe('Explain · Beta');

    await act(async () => {
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, cancelable: true }));
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-explain-loading]')).toBeTruthy();
    });
    expect(zikukAiRequest).toHaveBeenCalledTimes(1);

    const busy = document.querySelector('[data-nb-candidate-fmt="explain"]') as HTMLButtonElement;
    expect(busy.disabled).toBe(true);

    await act(async () => {
      busy.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, cancelable: true }));
      busy.click();
    });
    expect(zikukAiRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveReq({
        version: 1,
        ok: true,
        result: { type: 'text', text: 'done' },
      });
    });
    ed.destroy();
  });
});

describe('Retry uses frozen context (no recapture)', () => {
  function Harness({
    editor,
    onReady,
  }: {
    editor: Editor;
    onReady: (api: ReturnType<typeof useExplainSelectionController>) => void;
  }) {
    const api = useExplainSelectionController({
      editor,
      host: AI_HOST,
      pageKey: 'page-1',
    });
    onReady(api);
    return createElement('div', { 'data-phase': api.state.phase });
  }

  it('recoverable error Retry resends the same frozen context', async () => {
    const ed = makeEditor('Frozen retry path');
    selectAllText(ed);
    let api!: ReturnType<typeof useExplainSelectionController>;
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: false,
      error: { code: 'rate_limited', message: 'Too many requests. Try again shortly.' },
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
    const frozen = api.state.frozenContext;
    expect(frozen).toBeTruthy();

    act(() => {
      ed.commands.setTextSelection(1);
    });

    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: true,
      result: { type: 'text', text: 'after rate limit' },
    });

    await act(async () => {
      api.retry();
    });

    expect(zikukAiRequest).toHaveBeenCalledTimes(2);
    const second = zikukAiRequest.mock.calls[1]?.[0] as { context: ZikukAiContext };
    expect(second.context).toEqual(frozen);
    expect(api.state.phase).toBe('success');
    ed.destroy();
  });
});
