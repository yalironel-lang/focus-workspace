/**
 * @vitest-environment happy-dom
 */
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNTHETIC_JPEG_BASE64 } from '../visualCapture/syntheticJpeg';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toast = Object.assign(vi.fn(), {
  custom: vi.fn((_render: (t: { id: string }) => ReturnType<typeof createElement>, _options?: { duration: number }) => 'toast-visual'),
  dismiss: vi.fn(),
});

vi.mock('react-hot-toast', () => ({ default: toast }));

vi.mock('./fetchRecoveredPdfPageText', () => ({
  fetchRecoveredPdfPageText: vi.fn(async () => ({ ok: false, code: 'no_recovered_text' })),
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

function mountHook(options: Parameters<typeof useTutorPdfCapture>[0]) {
  let api: CaptureApi | null = null;
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root: Root | null = createRoot(host);

  function Probe() {
    const value = useTutorPdfCapture(options);
    useEffect(() => {
      api = value;
    });
    return null;
  }

  act(() => {
    root!.render(createElement(Probe));
  });

  return {
    getApi: () => {
      if (!api) throw new Error('hook not ready');
      return api;
    },
    unmount: () => {
      act(() => {
        root?.unmount();
      });
      root = null;
      host.remove();
    },
  };
}

describe('useTutorPdfCapture visual_selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('offers visual when region text fails and no native/recovery path', async () => {
    const onIntent = vi.fn();
    const { getApi, unmount } = mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
      onIntent,
      extractText: async () => '',
      probePageTextLayer: async () => ({
        kind: 'empty',
        itemCount: 0,
        meaningfulCharCount: 0,
        hasReadableText: false,
      }),
      renderRegionImage: async () => ({
        ok: true,
        mime: 'image/jpeg',
        widthPx: 64,
        heightPx: 48,
        bytes: new Uint8Array(8),
        dataUrl: `data:image/jpeg;base64,${SYNTHETIC_JPEG_BASE64}`,
      }),
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.1, y: 0.1, w: 0.4, h: 0.3 });
    });
    await act(async () => {
      await getApi().chooseAction('explain');
    });

    expect(onIntent).not.toHaveBeenCalled();
    expect(toast.custom).toHaveBeenCalled();
    const tree = toast.custom.mock.calls[toast.custom.mock.calls.length - 1]?.[0]({ id: 't' });
    expect(findTestIdHandler(tree, 'capture-visual-confirm')).toBeTruthy();
    expect(findTestIdHandler(tree, 'capture-visual-dismiss')).toBeTruthy();
    unmount();
  });

  it('emits visual_selection after explicit confirm', async () => {
    const onIntent = vi.fn();
    const renderRegionImage = vi.fn(async () => ({
      ok: true as const,
      mime: 'image/jpeg' as const,
      widthPx: 64,
      heightPx: 48,
      bytes: new Uint8Array(8),
      dataUrl: `data:image/jpeg;base64,${SYNTHETIC_JPEG_BASE64}`,
    }));

    const { getApi, unmount } = mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
      onIntent,
      extractText: async () => '',
      probePageTextLayer: async () => ({
        kind: 'empty',
        itemCount: 0,
        meaningfulCharCount: 0,
        hasReadableText: false,
      }),
      renderRegionImage,
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.2, y: 0.2, w: 0.3, h: 0.25 });
    });
    await act(async () => {
      await getApi().chooseAction('solve');
    });

    expect(renderRegionImage).not.toHaveBeenCalled();
    const tree = toast.custom.mock.calls[toast.custom.mock.calls.length - 1]?.[0]({ id: 't' });
    const confirm = findTestIdHandler(tree, 'capture-visual-confirm');
    expect(confirm).toBeTruthy();
    await act(async () => {
      confirm!();
    });

    expect(renderRegionImage).toHaveBeenCalled();
    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: expect.objectContaining({
          attachmentType: 'visual_selection',
          visual: expect.objectContaining({
            mime: 'image/jpeg',
            imageBase64: SYNTHETIC_JPEG_BASE64,
            widthPx: 64,
            heightPx: 48,
          }),
        }),
      }),
    );
    unmount();
  });

  it('cancel does not render or emit', async () => {
    const onIntent = vi.fn();
    const renderRegionImage = vi.fn();
    const { getApi, unmount } = mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
      onIntent,
      extractText: async () => '',
      probePageTextLayer: async () => ({
        kind: 'empty',
        itemCount: 0,
        meaningfulCharCount: 0,
        hasReadableText: false,
      }),
      renderRegionImage,
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
    });
    await act(async () => {
      await getApi().chooseAction('hint');
    });

    const tree = toast.custom.mock.calls[toast.custom.mock.calls.length - 1]?.[0]({ id: 't' });
    const dismiss = findTestIdHandler(tree, 'capture-visual-dismiss');
    await act(async () => {
      dismiss!();
    });

    expect(renderRegionImage).not.toHaveBeenCalled();
    expect(onIntent).not.toHaveBeenCalled();
    unmount();
  });

  it('surfaces render failure without emitting intent', async () => {
    const onIntent = vi.fn();
    const { getApi, unmount } = mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
      onIntent,
      extractText: async () => '',
      probePageTextLayer: async () => ({
        kind: 'empty',
        itemCount: 0,
        meaningfulCharCount: 0,
        hasReadableText: false,
      }),
      renderRegionImage: async () => ({ ok: false, code: 'encode_failed' }),
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
    });
    await act(async () => {
      await getApi().chooseAction('hint');
    });

    const tree = toast.custom.mock.calls[toast.custom.mock.calls.length - 1]?.[0]({ id: 't' });
    const confirm = findTestIdHandler(tree, 'capture-visual-confirm');
    await act(async () => {
      confirm!();
    });

    expect(toast).toHaveBeenCalled();
    expect(onIntent).not.toHaveBeenCalled();
    unmount();
  });

  it('offers visual when extracted text is an isolated question label (Question number included, e.g. "3.")', async () => {
    const onIntent = vi.fn();
    const renderRegionImage = vi.fn(async () => ({
      ok: true as const,
      mime: 'image/jpeg' as const,
      widthPx: 64,
      heightPx: 48,
      bytes: new Uint8Array(8),
      dataUrl: `data:image/jpeg;base64,${SYNTHETIC_JPEG_BASE64}`,
    }));

    const { getApi, unmount } = mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 2,
      onIntent,
      // Extracted text contains only the question label "3."
      extractText: async () => '3.',
      probePageTextLayer: async () => ({
        kind: 'sparse',
        itemCount: 2,
        meaningfulCharCount: 2,
        hasReadableText: false,
      }),
      renderRegionImage,
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      // Large question bounding box
      getApi().commitSelection({ x: 0.1, y: 0.2, w: 0.6, h: 0.2 });
    });
    await act(async () => {
      await getApi().chooseAction('solve');
    });

    // Must NOT immediately emit text_selection with "3."
    expect(onIntent).not.toHaveBeenCalled();
    // Must offer visual capture toast
    expect(toast.custom).toHaveBeenCalled();
    const tree = toast.custom.mock.calls[toast.custom.mock.calls.length - 1]?.[0]({ id: 't' });
    const confirm = findTestIdHandler(tree, 'capture-visual-confirm');
    expect(confirm).toBeTruthy();

    await act(async () => {
      confirm!();
    });

    expect(renderRegionImage).toHaveBeenCalled();
    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'solve',
        attachment: expect.objectContaining({
          attachmentType: 'visual_selection',
        }),
      }),
    );
    unmount();
  });

  it('routes directly to text_selection when extracted text is a genuine multi-word statement', async () => {
    const onIntent = vi.fn();
    const { getApi, unmount } = mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
      onIntent,
      extractText: async () => 'The function f(x, y) is continuously differentiable near (1, 3).',
      probePageTextLayer: async () => ({
        kind: 'useful',
        itemCount: 10,
        meaningfulCharCount: 65,
        hasReadableText: true,
      }),
      renderRegionImage: vi.fn(),
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.1, y: 0.1, w: 0.4, h: 0.1 });
    });
    await act(async () => {
      await getApi().chooseAction('explain');
    });

    // Genuinely useful text routes directly without visual toast
    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'explain',
        attachment: expect.objectContaining({
          attachmentType: 'text_selection',
          extractedText: 'The function f(x, y) is continuously differentiable near (1, 3).',
        }),
      }),
    );
    unmount();
  });

  it('explicit visual override forces visual offer even when extracted text is useful', async () => {
    const onIntent = vi.fn();
    const renderRegionImage = vi.fn(async () => ({
      ok: true as const,
      mime: 'image/jpeg' as const,
      widthPx: 64,
      heightPx: 48,
      bytes: new Uint8Array(8),
      dataUrl: `data:image/jpeg;base64,${SYNTHETIC_JPEG_BASE64}`,
    }));

    const { getApi, unmount } = mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
      onIntent,
      extractText: async () => 'The function f(x, y) is continuously differentiable near (1, 3).',
      probePageTextLayer: async () => ({
        kind: 'useful',
        itemCount: 10,
        meaningfulCharCount: 65,
        hasReadableText: true,
      }),
      renderRegionImage,
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.1, y: 0.1, w: 0.4, h: 0.1 });
    });
    await act(async () => {
      // User explicitly requested visual interpretation
      await getApi().chooseAction('explain', { forceVisual: true });
    });

    // Should NOT emit text_selection
    expect(onIntent).not.toHaveBeenCalled();
    // Must show visual offer toast
    const tree = toast.custom.mock.calls[toast.custom.mock.calls.length - 1]?.[0]({ id: 't' });
    const confirm = findTestIdHandler(tree, 'capture-visual-confirm');
    expect(confirm).toBeTruthy();

    await act(async () => {
      confirm!();
    });

    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: expect.objectContaining({
          attachmentType: 'visual_selection',
        }),
      }),
    );
    unmount();
  });

  it('cancellation and retry lifecycle resets state cleanly', async () => {
    const onIntent = vi.fn();
    const renderRegionImage = vi.fn(async () => ({
      ok: true as const,
      mime: 'image/jpeg' as const,
      widthPx: 64,
      heightPx: 48,
      bytes: new Uint8Array(8),
      dataUrl: `data:image/jpeg;base64,${SYNTHETIC_JPEG_BASE64}`,
    }));

    const { getApi, unmount } = mountHook({
      enabled: true,
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
      onIntent,
      extractText: async () => '',
      probePageTextLayer: async () => ({ kind: 'empty', itemCount: 0, meaningfulCharCount: 0, hasReadableText: false }),
      renderRegionImage,
    });

    await act(async () => {
      getApi().setCaptureMode(true);
      getApi().commitSelection({ x: 0.1, y: 0.1, w: 0.3, h: 0.3 });
    });
    await act(async () => {
      await getApi().chooseAction('hint');
    });

    // Cancel the first attempt
    const tree1 = toast.custom.mock.calls[toast.custom.mock.calls.length - 1]?.[0]({ id: 't1' });
    const dismiss = findTestIdHandler(tree1, 'capture-visual-dismiss');
    await act(async () => {
      dismiss!();
    });
    expect(renderRegionImage).not.toHaveBeenCalled();
    expect(onIntent).not.toHaveBeenCalled();

    // User re-selects and chooses action again
    await act(async () => {
      getApi().commitSelection({ x: 0.15, y: 0.15, w: 0.35, h: 0.35 });
    });
    await act(async () => {
      await getApi().chooseAction('solve');
    });

    // Confirm the second attempt
    const tree2 = toast.custom.mock.calls[toast.custom.mock.calls.length - 1]?.[0]({ id: 't2' });
    const confirm = findTestIdHandler(tree2, 'capture-visual-confirm');
    await act(async () => {
      confirm!();
    });

    expect(renderRegionImage).toHaveBeenCalledTimes(1);
    expect(onIntent).toHaveBeenCalledTimes(1);
    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'solve',
        attachment: expect.objectContaining({ attachmentType: 'visual_selection' }),
      }),
    );
    unmount();
  });
});
