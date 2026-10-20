/**
 * @vitest-environment happy-dom
 */
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as gatewayClient from '../gatewayClient';
import { readTutorSession, writeTutorSession } from './tutorSessionStorage';
import type { TutorCaptureIntent } from './tutorCaptureTypes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const zikukAiRequestMock = vi.fn();
vi.spyOn(gatewayClient, 'zikukAiRequest').mockImplementation(zikukAiRequestMock);

const { useStandaloneTutor } = await import('./useStandaloneTutor');

const dummyIntent: TutorCaptureIntent = {
  action: 'hint',
  attachment: {
    sourceKind: 'free_space_pdf',
    sourceObjectId: 'pdf-1',
    sectionId: 'sec-123',
    pageNumber: 1,
    regionNorm: { x: 0, y: 0, w: 1, h: 1 },
    attachmentType: 'text_selection',
    extractedText: 'Sample text',
  },
};

describe('useStandaloneTutor', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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

  it('sends question via gateway v2 contract and updates turns on success', async () => {
    let capturedApi: ReturnType<typeof useStandaloneTutor> | null = null;

    zikukAiRequestMock.mockResolvedValueOnce({
      ok: true,
      result: {
        type: 'ask_course',
        text: 'Consider the derivative of sin(x).',
        sources: [{ type: 'pdf', title: 'Calculus.pdf', page: 3 }],
      },
    });

    function TestHarness() {
      const api = useStandaloneTutor({
        sectionId: 'sec-123',
        sourceObjectId: 'pdf-1',
        userId: 'user-1',
        initialIntent: dummyIntent,
      });
      useEffect(() => {
        capturedApi = api;
      });
      return null;
    }

    await act(async () => {
      root!.render(createElement(TestHarness));
    });

    expect(capturedApi!.status).toBe('idle');

    await act(async () => {
      await capturedApi!.sendQuestion('How do I take this derivative?');
    });

    // Check gateway request contract with v3 capture
    expect(zikukAiRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 3,
        capability: 'ask_course',
        sectionId: 'sec-123',
        question: 'How do I take this derivative?',
        capture: {
          sourceKind: 'free_space_pdf',
          sourceObjectId: 'pdf-1',
          sectionId: 'sec-123',
          pageNumber: 1,
          text: 'Sample text',
        },
      }),
      expect.any(Object),
    );

    expect(capturedApi!.status).toBe('success');
    expect(capturedApi!.turns.length).toBe(2);
    expect(capturedApi!.turns[0].content).toBe('How do I take this derivative?');
    expect(capturedApi!.turns[1].content).toBe('Consider the derivative of sin(x).');
  });

  it('sends question via gateway v2 contract when no attachment is present', async () => {
    let capturedApi: ReturnType<typeof useStandaloneTutor> | null = null;

    zikukAiRequestMock.mockResolvedValueOnce({
      ok: true,
      result: {
        type: 'ask_course',
        text: 'General answer.',
        sources: [],
      },
    });

    function TestHarness() {
      const api = useStandaloneTutor({
        sectionId: 'sec-123',
        sourceObjectId: null,
        userId: 'user-1',
        initialIntent: null,
      });
      useEffect(() => {
        capturedApi = api;
      });
      return null;
    }

    await act(async () => {
      root!.render(createElement(TestHarness));
    });

    await act(async () => {
      await capturedApi!.sendQuestion('General course question');
    });

    expect(zikukAiRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 2,
        capability: 'ask_course',
        sectionId: 'sec-123',
        question: 'General course question',
      }),
      expect.any(Object),
    );
    expect(capturedApi!.status).toBe('success');
  });

  it('restores persisted conversation on mount', async () => {
    writeTutorSession('user-1', 'sec-123', 'pdf-1', {
      intent: dummyIntent,
      turns: [
        { id: 'u1', role: 'user', content: 'Prior question', timestamp: 100 },
        { id: 'a1', role: 'assistant', content: 'Prior answer', timestamp: 200 },
      ],
    });

    let capturedApi: ReturnType<typeof useStandaloneTutor> | null = null;

    function TestHarness() {
      const api = useStandaloneTutor({
        sectionId: 'sec-123',
        sourceObjectId: 'pdf-1',
        userId: 'user-1',
        initialIntent: dummyIntent,
      });
      useEffect(() => {
        capturedApi = api;
      });
      return null;
    }

    await act(async () => {
      root!.render(createElement(TestHarness));
    });

    expect(capturedApi!.turns.length).toBe(2);
    expect(capturedApi!.turns[0].content).toBe('Prior question');
    expect(capturedApi!.turns[1].content).toBe('Prior answer');
  });

  it('handles error gracefully when gateway returns failure', async () => {
    let capturedApi: ReturnType<typeof useStandaloneTutor> | null = null;

    zikukAiRequestMock.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Service temporarily unavailable' },
    });

    function TestHarness() {
      const api = useStandaloneTutor({
        sectionId: 'sec-123',
        sourceObjectId: 'pdf-1',
        userId: 'user-1',
        initialIntent: dummyIntent,
      });
      useEffect(() => {
        capturedApi = api;
      });
      return null;
    }

    await act(async () => {
      root!.render(createElement(TestHarness));
    });

    await act(async () => {
      await capturedApi!.sendQuestion('Test fail');
    });

    expect(capturedApi!.status).toBe('error');
    expect(capturedApi!.errorMessage).toBe('Service temporarily unavailable');
  });

  it('detaches and re-attaches PDF context without dropping conversation history', async () => {
    let capturedApi: ReturnType<typeof useStandaloneTutor> | null = null;

    zikukAiRequestMock.mockResolvedValue({
      ok: true,
      result: {
        type: 'ask_course',
        text: 'The divergence theorem equates flux to a volume integral.',
        sources: [],
        knowledgeTier: 'general_academic',
        contextAvailable: { hasIndexedChunks: false, hasPdfCapture: false },
      },
    });

    function TestHarness() {
      const api = useStandaloneTutor({
        sectionId: 'sec-123',
        sourceObjectId: 'pdf-1',
        userId: 'user-1',
        initialIntent: dummyIntent,
      });
      useEffect(() => {
        capturedApi = api;
      });
      return null;
    }

    await act(async () => {
      root!.render(createElement(TestHarness));
    });

    await act(async () => {
      capturedApi!.setAttachmentAttached(false);
    });
    await act(async () => {
      root!.render(createElement(TestHarness));
    });

    await act(async () => {
      await capturedApi!.sendQuestion('Explain the divergence theorem.');
    });

    expect(zikukAiRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 2,
        question: 'Explain the divergence theorem.',
      }),
      expect.any(Object),
    );
    const detachedCall = zikukAiRequestMock.mock.calls[0][0] as { capture?: unknown };
    expect(detachedCall.capture).toBeUndefined();
    expect(capturedApi!.turns).toHaveLength(2);
    expect(capturedApi!.turns[1].knowledgeTier).toBe('general_academic');
    expect(capturedApi!.attachmentAttached).toBe(false);

    await act(async () => {
      root!.unmount();
    });
    root = createRoot(host!);
    await act(async () => {
      root!.render(createElement(TestHarness));
    });
    expect(capturedApi!.attachmentAttached).toBe(false);
    expect(capturedApi!.turns).toHaveLength(2);
    expect(capturedApi!.turns[1].knowledgeTier).toBe('general_academic');

    await act(async () => {
      capturedApi!.setAttachmentAttached(true);
    });
    await act(async () => {
      root!.render(createElement(TestHarness));
    });
    await act(async () => {
      await capturedApi!.sendQuestion('What does this paragraph say?');
    });

    expect(zikukAiRequestMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        version: 3,
        capture: expect.objectContaining({ text: 'Sample text' }),
      }),
      expect.any(Object),
    );
    expect(capturedApi!.turns.length).toBeGreaterThanOrEqual(2);
  });

  it('saves and reloads a conversation that never had a PDF selection', async () => {
    let capturedApi: ReturnType<typeof useStandaloneTutor> | null = null;

    zikukAiRequestMock.mockResolvedValueOnce({
      ok: true,
      result: { type: 'ask_course', text: 'Course-level answer.', sources: [] },
    });

    function TestHarness() {
      const api = useStandaloneTutor({
        sectionId: 'sec-123',
        sourceObjectId: 'pdf-1',
        userId: 'user-1',
        initialIntent: null,
      });
      useEffect(() => {
        capturedApi = api;
      });
      return null;
    }

    await act(async () => {
      root!.render(createElement(TestHarness));
    });

    expect(capturedApi!.captureIntent).toBeNull();

    await act(async () => {
      await capturedApi!.sendQuestion('What is a derivative?');
    });

    expect(zikukAiRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 2,
        question: 'What is a derivative?',
      }),
      expect.any(Object),
    );
    const request = zikukAiRequestMock.mock.calls[0][0] as { capture?: unknown };
    expect(request.capture).toBeUndefined();

    const stored = readTutorSession('user-1', 'sec-123', 'pdf-1');
    expect(stored?.intent).toBeNull();
    expect(stored?.turns.map(turn => turn.content)).toEqual([
      'What is a derivative?',
      'Course-level answer.',
    ]);

    await act(async () => {
      root!.unmount();
    });
    root = createRoot(host!);
    await act(async () => {
      root!.render(createElement(TestHarness));
    });

    expect(capturedApi!.captureIntent).toBeNull();
    expect(capturedApi!.turns.map(turn => turn.content)).toEqual([
      'What is a derivative?',
      'Course-level answer.',
    ]);
    expect(capturedApi!.attachmentAttached).toBe(false);
  });

  it('keeps a stored selection when Tutor opens without a new capture', async () => {
    writeTutorSession('user-1', 'sec-123', 'pdf-1', {
      intent: dummyIntent,
      mode: 'exam_prep',
      turns: [
        { id: 'u1', role: 'user', content: 'Prior question', timestamp: 100 },
        { id: 'a1', role: 'assistant', content: 'Prior answer', timestamp: 200, mode: 'exam_prep' },
      ],
      attachmentAttached: true,
    });

    let capturedApi: ReturnType<typeof useStandaloneTutor> | null = null;
    zikukAiRequestMock.mockResolvedValueOnce({
      ok: true,
      result: { type: 'ask_course', text: 'Follow-up.', sources: [] },
    });

    function TestHarness() {
      const api = useStandaloneTutor({
        sectionId: 'sec-123',
        sourceObjectId: 'pdf-1',
        userId: 'user-1',
        initialIntent: null,
      });
      useEffect(() => {
        capturedApi = api;
      });
      return null;
    }

    await act(async () => {
      root!.render(createElement(TestHarness));
    });

    expect(capturedApi!.mode).toBe('exam_prep');
    expect(capturedApi!.captureIntent?.attachment.extractedText).toBe('Sample text');
    expect(capturedApi!.turns).toHaveLength(2);

    await act(async () => {
      await capturedApi!.sendQuestion('One more check.');
    });

    expect(zikukAiRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 3,
        capture: expect.objectContaining({ text: 'Sample text' }),
      }),
      expect.any(Object),
    );
  });
});
