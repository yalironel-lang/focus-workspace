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

describe('useTutorPdfCapture native-page fallback', () => {
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

  it('1. healthy native selection succeeds unchanged', async () => {
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
        attachment: expect.objectContaining({
          attachmentType: 'text_selection',
          extractedText: "Find f'(c) for the Mean Value Theorem.",
        }),
      }),
    );
    expect(toast.custom).not.toHaveBeenCalled();
    expect(fetchRecoveredPdfPageText).not.toHaveBeenCalled();
  });

  it('2. failed region on useful page offers native-page fallback (not OCR, not silent)', async () => {
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

  it('3. user declines native-page fallback — no attachment', async () => {
    let dismiss: (() => void) | null = null;
    toast.custom.mockImplementation((render: (t: { id: string }) => unknown) => {
      dismiss = findTestIdHandler(render({ id: 'toast-1' }), 'capture-native-page-dismiss');
      return 'toast-1';
    });

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
        pageText: 'Page native text about continuity definitions.',
        hasReadableText: true,
      }),
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.7, y: 0.7, w: 0.2, h: 0.2 });
    });
    await act(async () => {
      await getApi().chooseAction('hint');
    });

    expect(dismiss).toBeTypeOf('function');
    await act(async () => {
      dismiss?.();
    });

    expect(onIntent).not.toHaveBeenCalled();
    expect(getApi().pendingFullPage).toBeNull();
  });

  it('4. user confirms native-page fallback — emits native_page attachment', async () => {
    let confirm: (() => void) | null = null;
    toast.custom.mockImplementation((render: (t: { id: string }) => unknown) => {
      confirm = findTestIdHandler(render({ id: 'toast-1' }), 'capture-native-page-confirm');
      return 'toast-1';
    });

    const onIntent = vi.fn();
    const pageText = 'Full page native text for the Fundamental Theorem of Calculus.';
    const { getApi } = await mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 3,
      onIntent,
      extractText: async () => undefined,
      probePageTextLayer: async () => ({
        kind: 'useful',
        itemCount: 50,
        meaningfulCharCount: 300,
        pageText,
        hasReadableText: true,
      }),
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.05, y: 0.05, w: 0.1, h: 0.1 });
    });
    await act(async () => {
      await getApi().chooseAction('explain');
    });

    expect(confirm).toBeTypeOf('function');
    await act(async () => {
      confirm?.();
    });

    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: expect.objectContaining({
          attachmentType: 'native_page',
          extractedText: pageText,
          pageNumber: 3,
          regionNorm: { x: 0, y: 0, w: 1, h: 1 },
        }),
      }),
    );
  });

  it('5. empty/unusable page does not offer misleading native fallback', async () => {
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
    expect(getApi().pendingFullPage).toBeNull();
    // Visual Capture V1: offer visual instead of a plain miss toast when native/OCR unavailable.
    expect(toast.custom).toHaveBeenCalled();
    const offerCalls = toast.custom.mock.calls;
    let sawVisual = false;
    for (const call of offerCalls) {
      const tree = typeof call[0] === 'function' ? call[0]({ id: 'x' }) : null;
      expect(findTestIdHandler(tree, 'capture-native-page-confirm')).toBeNull();
      if (findTestIdHandler(tree, 'capture-visual-confirm')) sawVisual = true;
    }
    expect(sawVisual).toBe(true);
  });

  it('6. formula absent from text layer is not represented as successful region extract', async () => {
    const onIntent = vi.fn();
    const { getApi } = await mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
      onIntent,
      // Region over an image formula — extractor returns nothing.
      extractText: async () => undefined,
      probePageTextLayer: async () => ({
        kind: 'useful',
        itemCount: 20,
        meaningfulCharCount: 120,
        pageText: 'Surrounding prose without the selected integral formula glyphs.',
        hasReadableText: true,
      }),
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.3, y: 0.4, w: 0.3, h: 0.15 });
    });
    await act(async () => {
      await getApi().chooseAction('solve');
    });

    expect(onIntent).not.toHaveBeenCalled();
    expect(getApi().pendingFullPage?.attachmentType).toBe('native_page');
  });

  it('7. existing OCR recovery remains functional when page is not native-useful', async () => {
    fetchRecoveredPdfPageText.mockResolvedValue({
      ok: true,
      text: 'Recovered OCR page about continuity.',
      pageNumber: 2,
      sourceObjectId: 'pdf-1',
      sectionId: 'sec-1',
      extractionMethod: 'ocr_tesseract',
      truncated: false,
    });

    let confirm: (() => void) | null = null;
    toast.custom.mockImplementation((render: (t: { id: string }) => unknown) => {
      confirm = findTestIdHandler(render({ id: 'toast-1' }), 'capture-recovery-confirm');
      return 'toast-1';
    });

    const onIntent = vi.fn();
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

    expect(fetchRecoveredPdfPageText).toHaveBeenCalled();
    expect(confirm).toBeTypeOf('function');
    await act(async () => {
      confirm?.();
    });
    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: expect.objectContaining({ attachmentType: 'recovered_page' }),
      }),
    );
  });
});
