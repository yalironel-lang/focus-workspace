/**
 * @vitest-environment happy-dom
 */
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toast = Object.assign(vi.fn(), {
  custom: vi.fn((_render: (t: { id: string }) => unknown, _options?: { duration: number }) => 'toast-1'),
  dismiss: vi.fn(),
});

vi.mock('react-hot-toast', () => ({ default: toast }));

const fetchRecoveredPdfPageText = vi.fn();
vi.mock('./fetchRecoveredPdfPageText', () => ({
  fetchRecoveredPdfPageText: (...args: unknown[]) => fetchRecoveredPdfPageText(...args),
  RECOVERED_PAGE_TEXT_MAX_CHARS: 4000,
}));

vi.mock('../../ui/overlayStack', () => ({
  pushEscapeHandler: () => () => undefined,
}));

const { useTutorPdfCapture } = await import('./useTutorPdfCapture');

type CaptureApi = ReturnType<typeof useTutorPdfCapture>;

function findTestIdHandler(el: unknown, testId: string): (() => void) | null {
  if (!el || typeof el !== 'object') return null;
  const anyEl = el as {
    props?: {
      'data-testid'?: string;
      onClick?: () => void;
      children?: unknown;
    };
  };
  if (anyEl.props?.['data-testid'] === testId && anyEl.props.onClick) {
    return anyEl.props.onClick;
  }
  const kids = anyEl.props?.children;
  if (Array.isArray(kids)) {
    for (const kid of kids) {
      const hit = findTestIdHandler(kid, testId);
      if (hit) return hit;
    }
  } else if (kids) {
    return findTestIdHandler(kids, testId);
  }
  return null;
}

function findConfirmHandler(el: unknown): (() => void) | null {
  return findTestIdHandler(el, 'capture-recovery-confirm');
}

describe('useTutorPdfCapture recovery bridge', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    toast.mockClear();
    toast.custom.mockClear();
    toast.dismiss.mockClear();
    fetchRecoveredPdfPageText.mockReset();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
  });

  async function mountHook(
    options: Parameters<typeof useTutorPdfCapture>[0],
  ): Promise<{ getApi: () => CaptureApi }> {
    let capturedApi: CaptureApi | null = null;

    function TestHarness() {
      const api = useTutorPdfCapture(options);
      useEffect(() => {
        capturedApi = api;
      });
      return null;
    }

    await act(async () => {
      root!.render(createElement(TestHarness));
    });

    if (!capturedApi) throw new Error('hook did not mount');
    return {
      getApi: () => {
        if (!capturedApi) throw new Error('hook api missing');
        return capturedApi;
      },
    };
  }

  it('emits native text_selection when PDF.js extract succeeds', async () => {
    const onIntent = vi.fn();
    const { getApi } = await mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 2,
      onIntent,
      extractText: async () => "Find f'(c) for the Mean Value Theorem.",
      probePageTextLayer: async () => ({
        kind: 'useful',
        itemCount: 12,
        meaningfulCharCount: 40,
        hasReadableText: true,
      }),
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.1, y: 0.1, w: 0.5, h: 0.2 });
    });

    await act(async () => {
      await getApi().chooseAction('explain');
    });

    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'explain',
        attachment: expect.objectContaining({
          attachmentType: 'text_selection',
          extractedText: "Find f'(c) for the Mean Value Theorem.",
        }),
      }),
    );
    expect(fetchRecoveredPdfPageText).not.toHaveBeenCalled();
  });

  it('offers recovered page text and requires confirmation', async () => {
    fetchRecoveredPdfPageText.mockResolvedValue({
      ok: true,
      text: 'Recovered full page OCR text about continuity.',
      pageNumber: 2,
      sourceObjectId: 'pdf-1',
      sectionId: 'sec-1',
      extractionMethod: 'ocr_tesseract',
      truncated: false,
    });

    const onIntent = vi.fn();
    let confirmUse: (() => void) | null = null;
    toast.custom.mockImplementation((render: (t: { id: string }) => unknown) => {
      confirmUse = findConfirmHandler(render({ id: 'toast-1' }));
      return 'toast-1';
    });

    const { getApi } = await mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 2,
      onIntent,
      extractText: async () => undefined,
      probePageTextLayer: async () => ({
        kind: 'empty',
        itemCount: 0,
        meaningfulCharCount: 0,
        hasReadableText: false,
      }),
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.2, y: 0.2, w: 0.4, h: 0.3 });
    });

    await act(async () => {
      await getApi().chooseAction('explain');
    });

    expect(onIntent).not.toHaveBeenCalled();
    expect(toast.custom).toHaveBeenCalled();
    expect(getApi().pendingRecovery?.text).toContain('Recovered full page');
    expect(confirmUse).toBeTypeOf('function');

    await act(async () => {
      confirmUse?.();
    });

    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: expect.objectContaining({
          attachmentType: 'recovered_page',
          extractedText: 'Recovered full page OCR text about continuity.',
          pageNumber: 2,
        }),
      }),
    );
  });

  it('offers visual when recovery source_not_found and layer is empty/sparse', async () => {
    fetchRecoveredPdfPageText.mockResolvedValue({ ok: false, code: 'source_not_found' });
    const { getApi } = await mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
      extractText: async () => undefined,
      probePageTextLayer: async () => ({
        kind: 'empty',
        itemCount: 0,
        meaningfulCharCount: 0,
        hasReadableText: false,
      }),
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
    });
    await act(async () => {
      await getApi().chooseAction('hint');
    });

    expect(toast.custom).toHaveBeenCalled();
    const tree = toast.custom.mock.calls[toast.custom.mock.calls.length - 1]?.[0]({ id: 'x' });
    expect(findTestIdHandler(tree, 'capture-visual-confirm')).toBeTruthy();
  });

  it('offers native-page fallback when useful page text exists outside the selection', async () => {
    fetchRecoveredPdfPageText.mockResolvedValue({ ok: false, code: 'no_recovered_text' });
    const onIntent = vi.fn();
    const { getApi } = await mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
      onIntent,
      extractText: async () => undefined,
      probePageTextLayer: async () => ({
        kind: 'useful',
        itemCount: 40,
        meaningfulCharCount: 200,
        pageText: 'Find f(c) using the Mean Value Theorem on this page.',
        hasReadableText: true,
      }),
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.8, y: 0.8, w: 0.1, h: 0.1 });
    });
    await act(async () => {
      await getApi().chooseAction('solve');
    });

    expect(onIntent).not.toHaveBeenCalled();
    expect(fetchRecoveredPdfPageText).not.toHaveBeenCalled();
    expect(toast.custom).toHaveBeenCalled();
    expect(getApi().pendingFullPage?.attachmentType).toBe('native_page');
  });

  it('offers visual when only residual glyphs exist and recovery is missing', async () => {
    fetchRecoveredPdfPageText.mockResolvedValue({ ok: false, code: 'no_recovered_text' });
    const { getApi } = await mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
      extractText: async () => undefined,
      probePageTextLayer: async () => ({
        kind: 'sparse',
        itemCount: 1,
        meaningfulCharCount: 1,
        hasReadableText: false,
      }),
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.2, y: 0.2, w: 0.4, h: 0.3 });
    });
    await act(async () => {
      await getApi().chooseAction('explain');
    });

    expect(toast.custom).toHaveBeenCalled();
    const tree = toast.custom.mock.calls[toast.custom.mock.calls.length - 1]?.[0]({ id: 'x' });
    expect(findTestIdHandler(tree, 'capture-visual-confirm')).toBeTruthy();
  });
});
