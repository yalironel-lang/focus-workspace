/**
 * @vitest-environment happy-dom
 */
import { act, createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as gatewayClient from '../gatewayClient';
import { readTutorSession } from './tutorSessionStorage';
import type { TutorCaptureIntent } from './tutorCaptureTypes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const zikukAiRequestMock = vi.fn();
vi.spyOn(gatewayClient, 'zikukAiRequest').mockImplementation(zikukAiRequestMock);

const { useStandaloneTutor } = await import('./useStandaloneTutor');

const selection: TutorCaptureIntent = {
  action: 'hint',
  mode: 'teach_me',
  attachment: {
    sourceKind: 'free_space_pdf',
    sourceObjectId: 'pdf-1',
    sectionId: 'sec-123',
    pageNumber: 2,
    regionNorm: { x: 0, y: 0, w: 1, h: 0.2 },
    attachmentType: 'text_selection',
    extractedText: 'Question 2. Find the equilibrium.',
  },
};

const ok = {
  ok: true,
  result: {
    type: 'ask_course',
    text: 'Start with the first equation.',
    sources: [],
  },
};

describe('Tutor active document contract', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    zikukAiRequestMock.mockResolvedValue(ok);
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

  async function mount(props: {
    sourceObjectId: string | null;
    visiblePage: number | null;
    initialIntent?: TutorCaptureIntent | null;
  }) {
    let capturedApi: ReturnType<typeof useStandaloneTutor> | null = null;
    function Harness() {
      const api = useStandaloneTutor({
        sectionId: 'sec-123',
        sourceObjectId: props.sourceObjectId,
        visiblePage: props.visiblePage,
        userId: 'user-1',
        initialIntent: props.initialIntent ?? null,
      });
      useEffect(() => {
        capturedApi = api;
      });
      return null;
    }
    await act(async () => {
      root!.render(createElement(Harness));
    });
    return {
      get api() {
        return capturedApi!;
      },
    };
  }

  it('sends the open PDF identity and visible page without a capture', async () => {
    const harness = await mount({ sourceObjectId: 'pdf-1', visiblePage: 6, initialIntent: null });
    await act(async () => {
      await harness.api.sendQuestion('Teach me this PDF question by question.');
    });
    expect(zikukAiRequestMock).toHaveBeenCalledWith(
      {
        version: 2,
        capability: 'ask_course',
        sectionId: 'sec-123',
        question: 'Teach me this PDF question by question.',
        teachingMode: 'explain',
        activeDocument: {
          sourceKind: 'free_space_pdf',
          sourceObjectId: 'pdf-1',
          pageNumber: 6,
        },
      },
      expect.any(Object),
    );
    const body = zikukAiRequestMock.mock.calls[0][0] as { capture?: unknown };
    expect(body.capture).toBeUndefined();
    const stored = readTutorSession('user-1', 'sec-123', 'pdf-1');
    expect(stored?.turns).toHaveLength(2);
    expect(stored).not.toHaveProperty('activeDocument');
    expect(JSON.stringify(stored)).not.toContain('activeDocument');
  });

  it('sends the stored window cursor on the following question', async () => {
    zikukAiRequestMock.mockResolvedValue({
      ok: true,
      result: {
        type: 'ask_course',
        text: 'Question 1 starts from the given equation.',
        sources: [],
        documentWindow: {
          sourceObjectId: 'pdf-1',
          fileName: 'Problem Set 4 Solutions.pdf',
          pageCount: 30,
          fromPage: 1,
          toPage: 2,
          resumeFromPage: 2,
          partial: true,
        },
      },
    });
    const harness = await mount({ sourceObjectId: 'pdf-1', visiblePage: 6, initialIntent: null });
    await act(async () => {
      await harness.api.sendQuestion('Teach me this PDF question by question.');
    });
    await act(async () => {
      await harness.api.sendQuestion('Next question');
    });
    const second = zikukAiRequestMock.mock.calls[1][0] as {
      documentCursor?: { sourceObjectId: string; resumeFromPage: number };
      activeDocument?: { pageNumber: number };
    };
    expect(second.documentCursor).toEqual({ sourceObjectId: 'pdf-1', resumeFromPage: 2 });
    expect(second.activeDocument?.pageNumber).toBe(6);
    const stored = readTutorSession('user-1', 'sec-123', 'pdf-1');
    expect(stored?.turns[1]?.documentWindow?.resumeFromPage).toBe(2);
  });

  it('uses the latest visible page after the viewer moves', async () => {
    const props = { sourceObjectId: 'pdf-1', visiblePage: 1 as number | null, initialIntent: null as TutorCaptureIntent | null };
    let capturedApi: ReturnType<typeof useStandaloneTutor> | null = null;
    function Harness() {
      const api = useStandaloneTutor({
        sectionId: 'sec-123',
        sourceObjectId: props.sourceObjectId,
        visiblePage: props.visiblePage,
        userId: 'user-1',
        initialIntent: null,
      });
      useEffect(() => {
        capturedApi = api;
      });
      return null;
    }
    await act(async () => {
      root!.render(createElement(Harness));
    });
    props.visiblePage = 9;
    await act(async () => {
      root!.render(createElement(Harness));
    });
    await act(async () => {
      await capturedApi!.sendQuestion('Explain question 2 on this page.');
    });
    const body = zikukAiRequestMock.mock.calls[0][0] as { activeDocument: { pageNumber: number } };
    expect(body.activeDocument.pageNumber).toBe(9);
  });

  it('keeps capture text separate from the active document', async () => {
    const harness = await mount({ sourceObjectId: 'pdf-1', visiblePage: 8, initialIntent: selection });
    await act(async () => {
      await harness.api.sendQuestion('Explain this selection.');
    });
    const body = zikukAiRequestMock.mock.calls[0][0] as {
      version: number;
      capture: { text: string; pageNumber: number };
      activeDocument: { pageNumber: number; sourceObjectId: string };
    };
    expect(body.version).toBe(3);
    expect(body.capture.text).toBe('Question 2. Find the equilibrium.');
    expect(body.capture.pageNumber).toBe(2);
    expect(body.activeDocument).toEqual({
      sourceKind: 'free_space_pdf',
      sourceObjectId: 'pdf-1',
      pageNumber: 8,
    });
  });

  it('drops selection grounding on detach and keeps the open PDF', async () => {
    const harness = await mount({ sourceObjectId: 'pdf-1', visiblePage: 8, initialIntent: selection });
    await act(async () => {
      harness.api.setAttachmentAttached(false);
    });
    await act(async () => {
      await harness.api.sendQuestion('Continue with the document.');
    });
    const body = zikukAiRequestMock.mock.calls[0][0] as { version: number; capture?: unknown; activeDocument: { pageNumber: number } };
    expect(body.version).toBe(2);
    expect(body.capture).toBeUndefined();
    expect(body.activeDocument.pageNumber).toBe(8);
    expect(harness.api.turns).toHaveLength(2);
  });

  it('switches the active document when the open PDF changes', async () => {
    const props = { sourceObjectId: 'pdf-1', visiblePage: 3 };
    let capturedApi: ReturnType<typeof useStandaloneTutor> | null = null;
    function Harness() {
      const [sourceObjectId, setSourceObjectId] = useState(props.sourceObjectId);
      const [visiblePage, setVisiblePage] = useState(props.visiblePage);
      const api = useStandaloneTutor({
        sectionId: 'sec-123',
        sourceObjectId,
        visiblePage,
        userId: 'user-1',
        initialIntent: null,
      });
      useEffect(() => {
        capturedApi = api;
        (Harness as { setSource?: (id: string, page: number) => void }).setSource = (id, page) => {
          setSourceObjectId(id);
          setVisiblePage(page);
        };
      });
      return null;
    }
    await act(async () => {
      root!.render(createElement(Harness));
    });
    await act(async () => {
      (Harness as { setSource?: (id: string, page: number) => void }).setSource?.('pdf-2', 1);
    });
    await act(async () => {
      await capturedApi!.sendQuestion('Teach me this PDF.');
    });
    const body = zikukAiRequestMock.mock.calls[0][0] as { activeDocument: { sourceObjectId: string; pageNumber: number } };
    expect(body.activeDocument).toEqual({
      sourceKind: 'free_space_pdf',
      sourceObjectId: 'pdf-2',
      pageNumber: 1,
    });
    expect(readTutorSession('user-1', 'sec-123', 'pdf-1')).toBeNull();
    expect(readTutorSession('user-1', 'sec-123', 'pdf-2')?.turns).toHaveLength(2);
  });
});
