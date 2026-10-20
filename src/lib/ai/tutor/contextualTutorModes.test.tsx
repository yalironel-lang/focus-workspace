/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as gatewayClient from '../gatewayClient';
import { writeTutorSession, readTutorSession } from './tutorSessionStorage';
import type { TutorCaptureIntent } from './tutorCaptureTypes';
import { ContextualTutorCard } from '../../../components/project-space/ContextualTutorCard';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dummyTokens: AtmosphereTokens = {
  cardBg: 'rgb(15, 23, 42)',
  cardBorder: 'rgba(255, 255, 255, 0.15)',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  accentPrimary: '#6366f1',
} as unknown as AtmosphereTokens;

const dummyAttachment = {
  sourceKind: 'free_space_pdf' as const,
  sourceObjectId: 'pdf-chem-101',
  sectionId: 'sec-chem',
  pageNumber: 12,
  regionNorm: { x: 0.1, y: 0.1, w: 0.8, h: 0.5 },
  attachmentType: 'text_selection' as const,
  extractedText: 'Le Chatelier principle states that if an equilibrium system is disturbed, it adjusts to counteract.',
};

describe('ContextualTutorCard — Teaching Modes (TQ1.2.2)', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  const zikukAiRequestMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(gatewayClient, 'zikukAiRequest').mockImplementation(zikukAiRequestMock);
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

  it('defaults to Explain mode when initialized with legacy explain action', async () => {
    const intent: TutorCaptureIntent = {
      action: 'explain',
      attachment: dummyAttachment,
    };

    await act(async () => {
      root!.render(
        createElement(ContextualTutorCard, {
          tokens: dummyTokens,
          sectionId: 'sec-chem',
          sourceObjectId: 'pdf-chem-101',
          userId: 'student-1',
          intent,
          onClose: () => {},
        }),
      );
    });

    const headerTrigger = host!.querySelector('[data-testid="tutor-header-mode-trigger"]');
    expect(headerTrigger).not.toBeNull();
    expect(headerTrigger!.textContent).toContain('Explain');

    const explainBtn = host!.querySelector('[data-testid="tutor-mode-explain"]');
    expect(explainBtn).not.toBeNull();
    expect(explainBtn!.className).toContain('border-sky-500');

    const textarea = host!.querySelector<HTMLTextAreaElement>('[data-testid="tutor-initial-question-input"]');
    expect(textarea).not.toBeNull();
    expect(textarea!.value).toBe('Can you explain this concept step by step?');
  });

  it('migrates legacy hint action to Teach Me mode and updates initial draft', async () => {
    const intent: TutorCaptureIntent = {
      action: 'hint',
      attachment: dummyAttachment,
    };

    await act(async () => {
      root!.render(
        createElement(ContextualTutorCard, {
          tokens: dummyTokens,
          sectionId: 'sec-chem',
          sourceObjectId: 'pdf-chem-101',
          userId: 'student-1',
          intent,
          onClose: () => {},
        }),
      );
    });

    const headerTrigger = host!.querySelector('[data-testid="tutor-header-mode-trigger"]');
    expect(headerTrigger!.textContent).toContain('Teach Me');

    const teachMeBtn = host!.querySelector('[data-testid="tutor-mode-teach_me"]');
    expect(teachMeBtn).not.toBeNull();
    expect(teachMeBtn!.className).toContain('border-amber-500');

    const textarea = host!.querySelector<HTMLTextAreaElement>('[data-testid="tutor-initial-question-input"]');
    expect(textarea!.value).toBe('Guide me through this step-by-step.');
  });

  it('switching modes updates the default draft prompt when unmodified', async () => {
    const intent: TutorCaptureIntent = {
      action: 'explain',
      attachment: dummyAttachment,
    };

    await act(async () => {
      root!.render(
        createElement(ContextualTutorCard, {
          tokens: dummyTokens,
          sectionId: 'sec-chem',
          sourceObjectId: 'pdf-chem-101',
          userId: 'student-1',
          intent,
          onClose: () => {},
        }),
      );
    });

    const examPrepBtn = host!.querySelector<HTMLButtonElement>('[data-testid="tutor-mode-exam_prep"]');
    expect(examPrepBtn).not.toBeNull();

    await act(async () => {
      examPrepBtn!.click();
    });

    const headerTrigger = host!.querySelector('[data-testid="tutor-header-mode-trigger"]');
    expect(headerTrigger!.textContent).toContain('Exam Prep');

    const textarea = host!.querySelector<HTMLTextAreaElement>('[data-testid="tutor-initial-question-input"]');
    expect(textarea!.value).toBe('How is this concept tested on exams, and what common traps should I avoid?');
  });

  it('preserves user-authored draft text when switching modes', async () => {
    const intent: TutorCaptureIntent = {
      action: 'explain',
      attachment: dummyAttachment,
    };

    await act(async () => {
      root!.render(
        createElement(ContextualTutorCard, {
          tokens: dummyTokens,
          sectionId: 'sec-chem',
          sourceObjectId: 'pdf-chem-101',
          userId: 'student-1',
          intent,
          onClose: () => {},
        }),
      );
    });

    const textarea = host!.querySelector<HTMLTextAreaElement>('[data-testid="tutor-initial-question-input"]')!;
    // Student writes custom question
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set;
      nativeSetter?.call(textarea, 'How does pressure affect an equilibrium with equal gas moles?');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Switch mode to Just Answer
    const justAnswerBtn = host!.querySelector<HTMLButtonElement>('[data-testid="tutor-mode-just_answer"]')!;
    await act(async () => {
      justAnswerBtn.click();
    });

    // Ensure custom draft was preserved
    expect(textarea.value).toBe('How does pressure affect an equilibrium with equal gas moles?');
  });

  it('submits initial question with clean prompt and teachingMode in gateway request', async () => {
    const intent: TutorCaptureIntent = {
      action: 'explain',
      attachment: dummyAttachment,
    };

    zikukAiRequestMock.mockResolvedValueOnce({
      ok: true,
      result: {
        type: 'ask_course',
        text: 'When pressure increases, the system favors fewer moles of gas.',
        sources: [{ type: 'pdf', title: 'Chem101.pdf', page: 12 }],
      },
    });

    await act(async () => {
      root!.render(
        createElement(ContextualTutorCard, {
          tokens: dummyTokens,
          sectionId: 'sec-chem',
          sourceObjectId: 'pdf-chem-101',
          userId: 'student-1',
          intent,
          onClose: () => {},
        }),
      );
    });

    // Click Teach Me mode
    const teachMeBtn = host!.querySelector<HTMLButtonElement>('[data-testid="tutor-mode-teach_me"]')!;
    await act(async () => {
      teachMeBtn.click();
    });

    // Submit
    const submitBtn = host!.querySelector<HTMLButtonElement>('[data-testid="tutor-submit-initial-btn"]')!;
    await act(async () => {
      submitBtn.click();
    });

    expect(zikukAiRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 3,
        capability: 'ask_course',
        sectionId: 'sec-chem',
        question: 'Guide me through this step-by-step.',
        teachingMode: 'teach_me',
        capture: expect.objectContaining({
          pageNumber: 12,
          text: dummyAttachment.extractedText,
        }),
      }),
      expect.any(Object),
    );

    // Verify turn renders turn-level mode badge
    const modeBadge = host!.querySelector('[data-testid="tutor-turn-mode-badge"]');
    expect(modeBadge).not.toBeNull();
    expect(modeBadge!.textContent).toContain('Teach Me');
  });

  it('allows mid-conversation mode switching via dropdown and follow-up sending with new mode', async () => {
    // Seed existing conversation in storage
    writeTutorSession('student-1', 'sec-chem', 'pdf-chem-101', {
      intent: {
        action: 'explain',
        mode: 'explain',
        attachment: dummyAttachment,
      },
      mode: 'explain',
      turns: [
        { id: 'u1', role: 'user', content: 'What is equilibrium?', timestamp: 100 },
        { id: 'a1', role: 'assistant', content: 'Equilibrium is dynamic balance.', mode: 'explain', timestamp: 200 },
      ],
    });

    zikukAiRequestMock.mockResolvedValueOnce({
      ok: true,
      result: {
        type: 'ask_course',
        text: 'Common exam trap: confusing reaction rate with position of equilibrium.',
        sources: [],
      },
    });

    await act(async () => {
      root!.render(
        createElement(ContextualTutorCard, {
          tokens: dummyTokens,
          sectionId: 'sec-chem',
          sourceObjectId: 'pdf-chem-101',
          userId: 'student-1',
          intent: { action: 'explain', attachment: dummyAttachment },
          onClose: () => {},
        }),
      );
    });

    // Conversation view is displayed
    const turnsContainer = host!.querySelector('[data-testid="tutor-turns-container"]');
    expect(turnsContainer).not.toBeNull();

    // Toggle header mode dropdown
    const headerTrigger = host!.querySelector<HTMLButtonElement>('[data-testid="tutor-header-mode-trigger"]')!;
    await act(async () => {
      headerTrigger.click();
    });

    const dropdown = host!.querySelector('[data-testid="tutor-mode-dropdown"]');
    expect(dropdown).not.toBeNull();

    // Select Exam Prep from dropdown
    const examPrepOption = host!.querySelector<HTMLButtonElement>('[data-testid="tutor-dropdown-mode-exam_prep"]')!;
    expect(examPrepOption).not.toBeNull();
    await act(async () => {
      examPrepOption.click();
    });

    // Dropdown is now closed and mode is Exam Prep
    expect(host!.querySelector('[data-testid="tutor-mode-dropdown"]')).toBeNull();
    expect(headerTrigger.textContent).toContain('Exam Prep');

    // Follow-up input shows updated placeholder and allows follow-up send
    const followupInput = host!.querySelector<HTMLInputElement>('[data-testid="tutor-followup-input"]')!;
    expect(followupInput.placeholder).toContain('Exam Prep');

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set;
      nativeSetter?.call(followupInput, 'What should I watch out for on tests?');
      followupInput.dispatchEvent(new Event('input', { bubbles: true }));
      followupInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const followupBtn = host!.querySelector<HTMLButtonElement>('[data-testid="tutor-followup-send-btn"]')!;
    await act(async () => {
      followupBtn.click();
    });

    expect(zikukAiRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 3,
        capability: 'ask_course',
        question: 'What should I watch out for on tests?',
        teachingMode: 'exam_prep',
        recentTurns: [
          { role: 'user', content: 'What is equilibrium?' },
          { role: 'assistant', content: 'Equilibrium is dynamic balance.' },
        ],
      }),
      expect.any(Object),
    );

    // Persisted session reflects new mode
    const persisted = readTutorSession('student-1', 'sec-chem', 'pdf-chem-101');
    expect(persisted?.mode).toBe('exam_prep');
  });

  it('migrates legacy solve action to Just Answer mode', async () => {
    const intent: TutorCaptureIntent = {
      action: 'solve',
      attachment: dummyAttachment,
    };

    await act(async () => {
      root!.render(
        createElement(ContextualTutorCard, {
          tokens: dummyTokens,
          sectionId: 'sec-chem',
          sourceObjectId: 'pdf-chem-101',
          userId: 'student-1',
          intent,
          onClose: () => {},
        }),
      );
    });

    const headerTrigger = host!.querySelector('[data-testid="tutor-header-mode-trigger"]');
    expect(headerTrigger!.textContent).toContain('Just Answer');

    const justAnswerBtn = host!.querySelector('[data-testid="tutor-mode-just_answer"]');
    expect(justAnswerBtn).not.toBeNull();
    expect(justAnswerBtn!.className).toContain('border-emerald-500');

    const textarea = host!.querySelector<HTMLTextAreaElement>('[data-testid="tutor-initial-question-input"]');
    expect(textarea!.value).toBe('What is the direct answer or solution to this?');
  });

  it('displays mode badge when card is minimized', async () => {
    const intent: TutorCaptureIntent = {
      action: 'explain',
      mode: 'exam_prep',
      attachment: dummyAttachment,
    };

    await act(async () => {
      root!.render(
        createElement(ContextualTutorCard, {
          tokens: dummyTokens,
          sectionId: 'sec-chem',
          sourceObjectId: 'pdf-chem-101',
          userId: 'student-1',
          intent,
          onClose: () => {},
        }),
      );
    });

    const minimizeBtn = host!.querySelector<HTMLButtonElement>('[data-testid="contextual-tutor-minimize-btn"]')!;
    await act(async () => {
      minimizeBtn.click();
    });

    const minimizedPill = host!.querySelector('[data-testid="contextual-tutor-minimized-pill"]');
    expect(minimizedPill).not.toBeNull();
    expect(minimizedPill!.textContent).toContain('Exam Prep');
  });

  it('closes dropdown when Escape key is pressed without closing card', async () => {
    const onCloseSpy = vi.fn();
    const intent: TutorCaptureIntent = {
      action: 'explain',
      attachment: dummyAttachment,
    };

    await act(async () => {
      root!.render(
        createElement(ContextualTutorCard, {
          tokens: dummyTokens,
          sectionId: 'sec-chem',
          sourceObjectId: 'pdf-chem-101',
          userId: 'student-1',
          intent,
          onClose: onCloseSpy,
        }),
      );
    });

    // Open dropdown
    const headerTrigger = host!.querySelector<HTMLButtonElement>('[data-testid="tutor-header-mode-trigger"]')!;
    await act(async () => {
      headerTrigger.click();
    });
    expect(host!.querySelector('[data-testid="tutor-mode-dropdown"]')).not.toBeNull();

    // Press Escape
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    // Dropdown is closed, card onClose was NOT called
    expect(host!.querySelector('[data-testid="tutor-mode-dropdown"]')).toBeNull();
    expect(onCloseSpy).not.toHaveBeenCalled();

    // Pressing Escape again closes the card
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });

  it('detaches the selection, shows provenance, and re-attaches', async () => {
    const intent: TutorCaptureIntent = {
      action: 'explain',
      attachment: dummyAttachment,
    };

    zikukAiRequestMock.mockResolvedValueOnce({
      ok: true,
      result: {
        type: 'ask_course',
        text: 'The divergence theorem equates flux to a volume integral. [1]',
        sources: [],
        knowledgeTier: 'general_academic',
        contextAvailable: { hasIndexedChunks: false, hasPdfCapture: false },
      },
    });

    await act(async () => {
      root!.render(
        createElement(ContextualTutorCard, {
          tokens: dummyTokens,
          sectionId: 'sec-chem',
          sourceObjectId: 'pdf-chem-101',
          userId: 'student-1',
          intent,
          onClose: () => {},
        }),
      );
    });

    act(() => {
      host!.querySelector<HTMLButtonElement>('[data-testid="tutor-context-toggle"]')!.click();
    });
    const toggle = host!.querySelector<HTMLButtonElement>('[data-testid="tutor-attachment-toggle"]')!;
    expect(toggle.textContent).toContain('Detach');
    await act(async () => {
      toggle.click();
    });
    expect(host!.querySelector('[data-testid="tutor-attachment-toggle"]')!.textContent).toContain('Re-attach');
    expect(host!.querySelector('[data-testid="tutor-attachment-detached-note"]')).not.toBeNull();

    const submitBtn = host!.querySelector<HTMLButtonElement>('[data-testid="tutor-submit-initial-btn"]')!;
    await act(async () => {
      submitBtn.click();
    });

    expect(zikukAiRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ version: 2, teachingMode: 'explain' }),
      expect.any(Object),
    );
    const body = zikukAiRequestMock.mock.calls[0][0] as { capture?: unknown };
    expect(body.capture).toBeUndefined();
    const badge = host!.querySelector('[data-testid="knowledge-provenance"]');
    expect(badge?.textContent).toContain('General academic knowledge');
    expect(host!.textContent).not.toContain('[1]');

    const reattach = host!.querySelector<HTMLButtonElement>('[data-testid="tutor-attachment-toggle"]')!;
    await act(async () => {
      reattach.click();
    });
    expect(host!.querySelector('[data-testid="tutor-attachment-toggle"]')!.textContent).toContain('Detach');
    expect(readTutorSession('student-1', 'sec-chem', 'pdf-chem-101')?.attachmentAttached).toBe(true);
    expect(readTutorSession('student-1', 'sec-chem', 'pdf-chem-101')?.turns.length).toBeGreaterThan(0);
  });

  async function mountAndSubmit() {
    const intent: TutorCaptureIntent = {
      action: 'explain',
      attachment: dummyAttachment,
    };
    await act(async () => {
      root!.render(
        createElement(ContextualTutorCard, {
          tokens: dummyTokens,
          sectionId: 'sec-chem',
          sourceObjectId: 'pdf-chem-101',
          userId: 'student-retry',
          intent,
          onClose: () => {},
        }),
      );
    });
    const submitBtn = host!.querySelector<HTMLButtonElement>('[data-testid="tutor-submit-initial-btn"]')!;
    await act(async () => {
      submitBtn.click();
    });
  }

  it('hides Retry when the gateway returns output_budget_exhausted and keeps the error copy', async () => {
    const message = "The AI couldn't complete this explanation. Try asking for a shorter section.";
    zikukAiRequestMock.mockResolvedValueOnce({
      ok: false,
      error: { code: 'output_budget_exhausted', message },
    });
    await mountAndSubmit();
    const banner = host!.querySelector('[data-testid="tutor-error-banner"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain(message);
    expect(host!.querySelector('[data-testid="tutor-retry-btn"]')).toBeNull();
    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
  });

  it('keeps Retry for a provider timeout', async () => {
    zikukAiRequestMock.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'provider_timeout',
        message: 'The AI service timed out. Try again.',
      },
    });
    await mountAndSubmit();
    expect(host!.querySelector('[data-testid="tutor-error-banner"]')?.textContent).toContain(
      'The AI service timed out. Try again.',
    );
    expect(host!.querySelector('[data-testid="tutor-retry-btn"]')).not.toBeNull();
  });
});
