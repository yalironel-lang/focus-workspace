/**
 * @vitest-environment happy-dom
 */
import { act, createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as gatewayClient from '../gatewayClient';
import type { TutorCaptureIntent } from './tutorCaptureTypes';
import { PDF_VISUAL_SELECTION_MARKER } from '../visualCapture/visualSelectionContract';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const zikukAiRequestMock = vi.fn();
vi.spyOn(gatewayClient, 'zikukAiRequest').mockImplementation(zikukAiRequestMock);

const { useStandaloneTutor } = await import('./useStandaloneTutor');

const visualIntent: TutorCaptureIntent = {
  action: 'explain',
  attachment: {
    sourceKind: 'free_space_pdf',
    sourceObjectId: 'pdf-1',
    sectionId: 'sec-123',
    pageNumber: 1,
    regionNorm: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 },
    attachmentType: 'visual_selection',
    extractedText: PDF_VISUAL_SELECTION_MARKER,
    visual: {
      mime: 'image/jpeg',
      imageBase64: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAFA3PEY8MlBGQUFBOUI8SUVORERE',
      widthPx: 120,
      heightPx: 80,
    },
  },
};

describe('Visual Capture Lifecycle Investigation', () => {
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

  it('scenario 1: useStandaloneTutor mounted with null initialIntent then updated to visualIntent', async () => {
    let capturedApi: ReturnType<typeof useStandaloneTutor> | null = null;
    let setIntentProp: (intent: TutorCaptureIntent | null) => void = () => {};

    zikukAiRequestMock.mockResolvedValueOnce({
      ok: true,
      result: {
        type: 'ask_course',
        text: 'Transcribed successfully',
        sources: [],
      },
    });

    function TestHarness() {
      const [currentIntent, setCurrentIntent] = useState<TutorCaptureIntent | null>(null);
      setIntentProp = setCurrentIntent;
      const api = useStandaloneTutor({
        sectionId: 'sec-123',
        sourceObjectId: 'pdf-1',
        userId: 'user-1',
        initialIntent: currentIntent,
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
    expect(capturedApi!.attachmentAttached).toBe(false);

    // Now user makes visual selection:
    await act(async () => {
      setIntentProp(visualIntent);
    });

    expect(capturedApi!.captureIntent).toEqual(visualIntent);
    expect(capturedApi!.attachmentAttached).toBe(true);

    await act(async () => {
      await capturedApi!.sendQuestion('Transcribe the objective function');
    });

    expect(zikukAiRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 3,
        capability: 'ask_course',
        capture: expect.objectContaining({
          attachmentType: 'visual_selection',
          textKind: 'visual_selection',
          mime: 'image/jpeg',
          userConfirmedVisual: true,
        }),
      }),
      expect.anything(),
    );
  });

  it('scenario 2: ContextualTutorCard mounted with null intent then updated to visualIntent', async () => {
    const { ContextualTutorCard } = await import('../../../components/project-space/ContextualTutorCard');
    let setIntentProp: (intent: TutorCaptureIntent | null) => void = () => {};

    zikukAiRequestMock.mockResolvedValueOnce({
      ok: true,
      result: {
        type: 'ask_course',
        text: 'Transcribed successfully',
        sources: [],
      },
    });

    const tokens = {
      cardBg: '#0f172a',
      cardBorder: '#334155',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      wellBg: '#020617',
    } as any;

    function TestHarness() {
      const [currentIntent, setCurrentIntent] = useState<TutorCaptureIntent | null>(null);
      setIntentProp = setCurrentIntent;
      return createElement(ContextualTutorCard, {
        tokens,
        sectionId: 'sec-123',
        sourceObjectId: 'pdf-1',
        visiblePage: 1,
        pdfTitle: 'Calculus.pdf',
        userId: 'user-1',
        intent: currentIntent,
        onClose: () => {},
        embedded: true,
      });
    }

    await act(async () => {
      root!.render(createElement(TestHarness));
    });

    // Check DOM for attachment badge
    expect(host!.querySelector('[data-testid="tutor-context-attached"]')).toBeNull();
    expect(host!.querySelector('[data-testid="tutor-dock-attachment"]')).toBeNull();

    // Now update intent to visualIntent:
    await act(async () => {
      setIntentProp(visualIntent);
    });

    const contextAttached = host!.querySelector('[data-testid="tutor-context-attached"]');
    expect(contextAttached?.textContent).toBe('Visual selection attached');

    // Submit initial form:
    const form = host!.querySelector('form');
    expect(form).not.toBeNull();
    if (form) {
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    }

    expect(zikukAiRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 3,
        capability: 'ask_course',
        capture: expect.objectContaining({
          attachmentType: 'visual_selection',
          userConfirmedVisual: true,
        }),
      }),
      expect.anything(),
    );

    const contextAttachedAfter = host!.querySelector('[data-testid="tutor-context-attached"]');
    expect(contextAttachedAfter?.textContent).toBe('Visual selection attached');
  });

  it('scenario 3: user already has an existing session in localStorage, then mounts Tutor with visualIntent', async () => {
    const { writeTutorSession } = await import('./tutorSessionStorage');
    const { ContextualTutorCard } = await import('../../../components/project-space/ContextualTutorCard');

    // Pre-populate session (e.g. from prior visit or prior question)
    writeTutorSession('user-1', 'sec-123', 'pdf-1', {
      intent: null,
      turns: [],
      mode: 'explain',
      attachmentAttached: false,
    });

    zikukAiRequestMock.mockResolvedValueOnce({
      ok: true,
      result: {
        type: 'ask_course',
        text: 'Transcribed successfully',
        sources: [],
      },
    });

    const tokens = {
      cardBg: '#0f172a',
      cardBorder: '#334155',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      wellBg: '#020617',
    } as any;

    function TestHarness() {
      return createElement(ContextualTutorCard, {
        tokens,
        sectionId: 'sec-123',
        sourceObjectId: 'pdf-1',
        visiblePage: 1,
        pdfTitle: 'Calculus.pdf',
        userId: 'user-1',
        intent: visualIntent,
        onClose: () => {},
        embedded: true,
        focusToken: 1,
      });
    }

    await act(async () => {
      root!.render(createElement(TestHarness));
    });

    const contextAttached = host!.querySelector('[data-testid="tutor-context-attached"]');
    expect(contextAttached?.textContent).toBe('Visual selection attached');

    const form = host!.querySelector('form');
    expect(form).not.toBeNull();
    if (form) {
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    }

    expect(zikukAiRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 3,
        capability: 'ask_course',
        capture: expect.objectContaining({
          attachmentType: 'visual_selection',
          userConfirmedVisual: true,
        }),
      }),
      expect.anything(),
    );
  });

  it('scenario 4: user switches mode before sending question — visual attachment stays attached', async () => {
    const { ContextualTutorCard } = await import('../../../components/project-space/ContextualTutorCard');

    zikukAiRequestMock.mockResolvedValueOnce({
      ok: true,
      result: {
        type: 'ask_course',
        text: 'Transcribed successfully',
        sources: [],
      },
    });

    const tokens = {
      cardBg: '#0f172a',
      cardBorder: '#334155',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      wellBg: '#020617',
    } as any;

    function TestHarness() {
      return createElement(ContextualTutorCard, {
        tokens,
        sectionId: 'sec-123',
        sourceObjectId: 'pdf-1',
        visiblePage: 1,
        pdfTitle: 'Calculus.pdf',
        userId: 'user-1',
        intent: visualIntent,
        onClose: () => {},
        embedded: true,
        focusToken: 1,
      });
    }

    await act(async () => {
      root!.render(createElement(TestHarness));
    });

    // Switch mode to 'teach_me'
    const teachMeBtn = host!.querySelector('[data-testid="tutor-mode-teach_me"]') as HTMLButtonElement | null;
    expect(teachMeBtn).not.toBeNull();
    if (teachMeBtn) {
      await act(async () => {
        teachMeBtn.click();
      });
    }

    const contextAttached = host!.querySelector('[data-testid="tutor-context-attached"]');
    expect(contextAttached?.textContent).toBe('Visual selection attached');

    const form = host!.querySelector('form');
    if (form) {
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    }

    expect(zikukAiRequestMock.mock.calls[0]?.[0]?.capture).toBeDefined();
    expect(zikukAiRequestMock.mock.calls[0]?.[0]?.teachingMode).toBe('teach_me');
  });
});
