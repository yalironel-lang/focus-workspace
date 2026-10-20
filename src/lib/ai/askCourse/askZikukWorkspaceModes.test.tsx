/**
 * @vitest-environment happy-dom
 *
 * TQ1.2.3 — Ask ZIKUK Workspace Chat Teaching Modes integration tests.
 * Verifies default Explain mode, 4-mode dropdown, draft preservation,
 * wire request cleanliness, turn badge rendering, course persistence,
 * and new conversation reset.
 */

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const zikukAiRequest = vi.hoisted(() => vi.fn());

const READY_READINESS = vi.hoisted(() => ({
  kind: 'ready' as const,
  askUsable: true,
  readyCount: 1,
  preparingCount: 0,
  attentionCount: 0,
  unenrolledCount: 0,
  partialPreparing: false,
  partialAttention: false,
  emptyReason: null as null,
}));

vi.mock('../gatewayClient', async () => {
  const actual = await vi.importActual<typeof import('../gatewayClient')>('../gatewayClient');
  return {
    ...actual,
    zikukAiRequest: (...args: unknown[]) => zikukAiRequest(...args),
  };
});

vi.mock('./useCourseKnowledgeReadiness', () => ({
  useCourseKnowledgeReadiness: () => ({
    readiness: { ...READY_READINESS },
    refresh: () => {},
    loading: false,
  }),
  COURSE_KNOWLEDGE_READINESS_POLL_MS: 8_000,
}));

const { AskZikukWorkspace } = await import('../../../components/ai/AskZikukWorkspace');

const TOKENS = {
  pageBg: '#14100c',
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textGhost: '#64748b',
  cardBg: '#1e293b',
  wellBg: '#0f172a',
  cardBorder: '#334155',
  divider: 'rgba(255,255,255,0.08)',
  focusBorder: '#38bdf8',
  accent: '#38bdf8',
} as unknown as AtmosphereTokens;

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
  document.body.querySelectorAll('[data-ask-zikuk-workspace]').forEach(n => n.remove());
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function workspaceRoot(): HTMLElement {
  const el = document.body.querySelector('[data-ask-zikuk-workspace]') as HTMLElement | null;
  if (!el) throw new Error('Ask workspace not mounted');
  return el;
}

async function typeQuestion(value: string) {
  const input = workspaceRoot().querySelector('[data-ask-zikuk-input]') as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('AskZikukWorkspace — Teaching Modes (TQ1.2.3)', () => {
  beforeEach(() => {
    zikukAiRequest.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. defaults to Explain mode for fresh conversations', async () => {
    mount(
      <AskZikukWorkspace
        open={true}
        onClose={() => {}}
        sectionId="sec-history"
        sectionTitle="History 101"
        userId="user-test-1"
        tokens={TOKENS}
        accent={TOKENS.accent}
        onOpenSource={() => {}}
      />,
    );
    await flush();

    const modeTrigger = workspaceRoot().querySelector('[data-ask-zikuk-mode-trigger="1"]');
    expect(modeTrigger).not.toBeNull();
    expect(modeTrigger!.textContent).toContain('Explain');
  });

  it('2. opens mode dropdown with all 4 approved teaching modes', async () => {
    mount(
      <AskZikukWorkspace
        open={true}
        onClose={() => {}}
        sectionId="sec-history"
        userId="user-test-1"
        tokens={TOKENS}
        accent={TOKENS.accent}
        onOpenSource={() => {}}
      />,
    );
    await flush();

    const modeTrigger = workspaceRoot().querySelector('[data-ask-zikuk-mode-trigger="1"]') as HTMLButtonElement;
    expect(modeTrigger).not.toBeNull();

    // Click trigger to open dropdown
    await act(async () => {
      modeTrigger.click();
    });
    await flush();

    const menu = workspaceRoot().querySelector('[data-testid="ask-zikuk-mode-dropdown"]');
    expect(menu).not.toBeNull();

    const options = menu!.querySelectorAll('button[role="option"]');
    expect(options.length).toBe(4);

    expect(menu!.querySelector('[data-testid="ask-zikuk-dropdown-mode-explain"]')?.textContent).toContain('Explain');
    expect(menu!.querySelector('[data-testid="ask-zikuk-dropdown-mode-teach_me"]')?.textContent).toContain('Teach Me');
    expect(menu!.querySelector('[data-testid="ask-zikuk-dropdown-mode-just_answer"]')?.textContent).toContain('Just Answer');
    expect(menu!.querySelector('[data-testid="ask-zikuk-dropdown-mode-exam_prep"]')?.textContent).toContain('Exam Prep');
  });

  it('3. switches mode and preserves user draft question without clearing or modifying it', async () => {
    mount(
      <AskZikukWorkspace
        open={true}
        onClose={() => {}}
        sectionId="sec-history"
        userId="user-test-1"
        tokens={TOKENS}
        accent={TOKENS.accent}
        onOpenSource={() => {}}
      />,
    );
    await flush();

    // Type a draft
    await typeQuestion('Explain the Treaty of Versailles in depth.');
    const input = workspaceRoot().querySelector('[data-ask-zikuk-input]') as HTMLTextAreaElement;
    expect(input.value).toBe('Explain the Treaty of Versailles in depth.');

    // Open dropdown and select "Teach Me"
    const modeTrigger = workspaceRoot().querySelector('[data-ask-zikuk-mode-trigger="1"]') as HTMLButtonElement;
    await act(async () => {
      modeTrigger.click();
    });
    await flush();

    const teachMeOption = workspaceRoot().querySelector('[data-testid="ask-zikuk-dropdown-mode-teach_me"]') as HTMLButtonElement;
    await act(async () => {
      teachMeOption.click();
    });
    await flush();

    // Mode is updated
    expect(modeTrigger.textContent).toContain('Teach Me');

    // Draft is strictly preserved!
    expect(input.value).toBe('Explain the Treaty of Versailles in depth.');
  });

  it('4. submits request with teachingMode wire property and clean student prompt', async () => {
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: true,
      result: {
        type: 'ask_course',
        text: 'Let us begin by exploring Article 231. What was its significance?',
        sources: [],
      },
    });

    mount(
      <AskZikukWorkspace
        open={true}
        onClose={() => {}}
        sectionId="sec-history"
        userId="user-test-1"
        tokens={TOKENS}
        accent={TOKENS.accent}
        onOpenSource={() => {}}
      />,
    );
    await flush();

    // Select "Teach Me"
    const modeTrigger = workspaceRoot().querySelector('[data-ask-zikuk-mode-trigger="1"]') as HTMLButtonElement;
    await act(async () => {
      modeTrigger.click();
    });
    await flush();

    const teachMeOption = workspaceRoot().querySelector('[data-testid="ask-zikuk-dropdown-mode-teach_me"]') as HTMLButtonElement;
    await act(async () => {
      teachMeOption.click();
    });
    await flush();

    // Type and submit question
    const questionText = 'How did the Treaty of Versailles impact Weimar Germany?';
    await typeQuestion(questionText);

    const submitBtn = workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });
    await flush();

    expect(zikukAiRequest).toHaveBeenCalledTimes(1);
    expect(zikukAiRequest.mock.calls[0][0]).toEqual({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-history',
      question: questionText,
      teachingMode: 'teach_me',
    });

    // Verify question is completely clean (no mode boilerplate or prefix)
    expect(zikukAiRequest.mock.calls[0][0].question).toBe(questionText);
  });

  it('5. renders turn-level teaching mode badge on assistant response', async () => {
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: true,
      result: {
        type: 'ask_course',
        text: 'Direct answer: Article 231 placed full responsibility on Germany.',
        sources: [],
      },
    });

    mount(
      <AskZikukWorkspace
        open={true}
        onClose={() => {}}
        sectionId="sec-history"
        userId="user-test-1"
        tokens={TOKENS}
        accent={TOKENS.accent}
        onOpenSource={() => {}}
      />,
    );
    await flush();

    // Select "Just Answer"
    const modeTrigger = workspaceRoot().querySelector('[data-ask-zikuk-mode-trigger="1"]') as HTMLButtonElement;
    await act(async () => {
      modeTrigger.click();
    });
    await flush();

    const justAnswerOption = workspaceRoot().querySelector('[data-testid="ask-zikuk-dropdown-mode-just_answer"]') as HTMLButtonElement;
    await act(async () => {
      justAnswerOption.click();
    });
    await flush();

    // Submit question
    await typeQuestion('What was Article 231?');
    const submitBtn = workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });
    await flush();

    // Wait for response to render
    await vi.waitFor(() => {
      expect(workspaceRoot().textContent).toContain('Direct answer: Article 231');
    });

    // Check rendered badge
    const badge = workspaceRoot().querySelector('[data-testid="teaching-mode-badge-just_answer"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain('Just Answer');
  });

  it('6. allows mid-conversation mode switching between turns', async () => {
    zikukAiRequest
      .mockResolvedValueOnce({
        version: 1,
        ok: true,
        result: {
          type: 'ask_course',
          text: 'Explanation of photosynthesis light reactions.',
          sources: [],
        },
      })
      .mockResolvedValueOnce({
        version: 1,
        ok: true,
        result: {
          type: 'ask_course',
          text: 'Exam tip: Be ready to diagram the Calvin cycle vs Light reactions.',
          sources: [],
        },
      });

    mount(
      <AskZikukWorkspace
        open={true}
        onClose={() => {}}
        sectionId="sec-bio"
        userId="user-test-1"
        tokens={TOKENS}
        accent={TOKENS.accent}
        onOpenSource={() => {}}
      />,
    );
    await flush();

    // Turn 1 with default Explain
    await typeQuestion('Explain photosynthesis.');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();

    await vi.waitFor(() => {
      expect(workspaceRoot().textContent).toContain('Explanation of photosynthesis');
    });

    expect(zikukAiRequest.mock.calls[0][0].teachingMode).toBe('explain');

    // Switch mode to Exam Prep for Turn 2
    const modeTrigger = workspaceRoot().querySelector('[data-ask-zikuk-mode-trigger="1"]') as HTMLButtonElement;
    await act(async () => {
      modeTrigger.click();
    });
    await flush();

    const examPrepOption = workspaceRoot().querySelector('[data-testid="ask-zikuk-dropdown-mode-exam_prep"]') as HTMLButtonElement;
    await act(async () => {
      examPrepOption.click();
    });
    await flush();

    // Turn 2
    await typeQuestion('What questions usually appear on this topic in finals?');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();

    await vi.waitFor(() => {
      expect(workspaceRoot().textContent).toContain('Exam tip: Be ready to diagram');
    });

    expect(zikukAiRequest.mock.calls[1][0].teachingMode).toBe('exam_prep');

    // Verify both badges render appropriately in history
    const explainBadge = workspaceRoot().querySelector('[data-testid="teaching-mode-badge-explain"]');
    const examBadge = workspaceRoot().querySelector('[data-testid="teaching-mode-badge-exam_prep"]');
    expect(explainBadge).not.toBeNull();
    expect(examBadge).not.toBeNull();
  });

  it('7. restores course-specific mode across section switching', async () => {
    // Session in Math course set to 'just_answer'
    mount(
      <AskZikukWorkspace
        open={true}
        onClose={() => {}}
        sectionId="sec-math"
        userId="user-test-1"
        tokens={TOKENS}
        accent={TOKENS.accent}
        onOpenSource={() => {}}
      />,
    );
    await flush();

    const modeTrigger = workspaceRoot().querySelector('[data-ask-zikuk-mode-trigger="1"]') as HTMLButtonElement;
    await act(async () => {
      modeTrigger.click();
    });
    await flush();

    const justAnswerOption = workspaceRoot().querySelector('[data-testid="ask-zikuk-dropdown-mode-just_answer"]') as HTMLButtonElement;
    await act(async () => {
      justAnswerOption.click();
    });
    await flush();

    cleanup();

    // Open Physics course — should default to Explain
    mount(
      <AskZikukWorkspace
        open={true}
        onClose={() => {}}
        sectionId="sec-physics"
        userId="user-test-1"
        tokens={TOKENS}
        accent={TOKENS.accent}
        onOpenSource={() => {}}
      />,
    );
    await flush();

    const physTrigger = workspaceRoot().querySelector('[data-ask-zikuk-mode-trigger="1"]');
    expect(physTrigger?.textContent).toContain('Explain');

    cleanup();

    // Reopen Math course — should restore Just Answer
    mount(
      <AskZikukWorkspace
        open={true}
        onClose={() => {}}
        sectionId="sec-math"
        userId="user-test-1"
        tokens={TOKENS}
        accent={TOKENS.accent}
        onOpenSource={() => {}}
      />,
    );
    await flush();

    const mathTrigger = workspaceRoot().querySelector('[data-ask-zikuk-mode-trigger="1"]');
    expect(mathTrigger?.textContent).toContain('Just Answer');
  });

  it('8. newConversation clears conversation and resets mode to explain', async () => {
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: true,
      result: {
        type: 'ask_course',
        text: 'Answer to question.',
        sources: [],
      },
    });

    mount(
      <AskZikukWorkspace
        open={true}
        onClose={() => {}}
        sectionId="sec-math"
        userId="user-test-1"
        tokens={TOKENS}
        accent={TOKENS.accent}
        onOpenSource={() => {}}
      />,
    );
    await flush();

    // Switch to Exam Prep
    const modeTrigger = workspaceRoot().querySelector('[data-ask-zikuk-mode-trigger="1"]') as HTMLButtonElement;
    await act(async () => {
      modeTrigger.click();
    });
    await flush();

    const examPrepOption = workspaceRoot().querySelector('[data-testid="ask-zikuk-dropdown-mode-exam_prep"]') as HTMLButtonElement;
    await act(async () => {
      examPrepOption.click();
    });
    await flush();

    // Submit question so New Conversation button appears
    await typeQuestion('Sample question');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();

    await vi.waitFor(() => {
      expect(workspaceRoot().textContent).toContain('Answer to question.');
    });

    expect(workspaceRoot().querySelector('[data-ask-zikuk-mode-trigger="1"]')?.textContent).toContain('Exam Prep');

    // Click "New conversation" button
    const newConvBtn = workspaceRoot().querySelector('[data-ask-zikuk-new-conversation="1"]') as HTMLButtonElement;
    expect(newConvBtn).not.toBeNull();
    await act(async () => {
      newConvBtn.click();
    });
    await flush();

    // Mode is reset to Explain
    expect(workspaceRoot().querySelector('[data-ask-zikuk-mode-trigger="1"]')?.textContent).toContain('Explain');
  });

  it('9. closes dropdown on Escape key', async () => {
    mount(
      <AskZikukWorkspace
        open={true}
        onClose={() => {}}
        sectionId="sec-history"
        userId="user-test-1"
        tokens={TOKENS}
        accent={TOKENS.accent}
        onOpenSource={() => {}}
      />,
    );
    await flush();

    const modeTrigger = workspaceRoot().querySelector('[data-ask-zikuk-mode-trigger="1"]') as HTMLButtonElement;
    await act(async () => {
      modeTrigger.click();
    });
    await flush();

    expect(workspaceRoot().querySelector('[data-testid="ask-zikuk-mode-dropdown"]')).not.toBeNull();

    // Press Escape
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await flush();

    expect(workspaceRoot().querySelector('[data-testid="ask-zikuk-mode-dropdown"]')).toBeNull();
  });
});
