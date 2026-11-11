/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextualTutorCard } from '../../../components/project-space/ContextualTutorCard';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import * as gatewayClient from '../gatewayClient';
import { writeTutorSession } from './tutorSessionStorage';
import type { TutorCaptureIntent } from './tutorCaptureTypes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../gatewayClient', async importOriginal => {
  const actual = await importOriginal<typeof import('../gatewayClient')>();
  return {
    ...actual,
    zikukAiRequest: vi.fn(),
  };
});

const tokens = {
  accent: '#f59e0b',
  cardBg: '#111',
  cardBorder: '#333',
  textPrimary: '#fff',
  textSecondary: '#aaa',
  textMuted: '#777',
  wellBg: '#000',
  pageBg: '#000',
} as unknown as AtmosphereTokens;

const dummyIntent: TutorCaptureIntent = {
  action: 'explain',
  mode: 'exam_prep',
  attachment: {
    sourceKind: 'free_space_pdf',
    sourceObjectId: 'pdf-1',
    sectionId: 'sec-1',
    pageNumber: 1,
    regionNorm: { x: 0, y: 0, w: 1, h: 1 },
    attachmentType: 'text_selection',
    extractedText: 'Sample text for test',
  },
};

describe('Tutor Follow-up Composer UX', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;
  const zikukAiRequestMock = vi.mocked(gatewayClient.zikukAiRequest);

  beforeEach(() => {
    localStorage.clear();
    zikukAiRequestMock.mockReset();
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

  function mountTutorWithConversation(onNavigateToSource?: (page: number) => void) {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      mode: 'exam_prep',
      turns: [
        { id: 'u1', role: 'user', content: 'First question', timestamp: 1 },
        { id: 'a1', role: 'assistant', content: 'First answer', timestamp: 2, mode: 'exam_prep' },
      ],
    });

    act(() => {
      root!.render(
        createElement(ContextualTutorCard, {
          tokens,
          sectionId: 'sec-1',
          sourceObjectId: 'pdf-1',
          visiblePage: 1,
          pdfTitle: 'Lecture.pdf',
          userId: 'user-1',
          onNavigateToSource,
          intent: dummyIntent,
          onClose: () => {},
          embedded: false,
        }),
      );
    });
  }

  function setFollowUpInput(value: string) {
    const input = host!.querySelector('[data-testid="tutor-followup-input"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return input;
  }

  it('7M ties the rendered live answer to its ephemeral receipt, never persists it, and expires it', async () => {
    mountTutorWithConversation();
    expect(zikukAiRequestMock).not.toHaveBeenCalled();
    zikukAiRequestMock.mockResolvedValue({ version: 1, ok: true,
      result: { type: 'ask_course', text: 'New synthetic pilot answer.', sources: [], knowledgeTier: 'general_academic' },
      meta: { capability: 'ask_course', pilotRenderEvidence: { requestId: 'synthetic-request-id', expiresAt: Date.now() + 500, verified: true } },
    });
    const input = setFollowUpInput('Synthetic pilot question');
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    const turn = host!.querySelector('[data-pilot-request-id="synthetic-request-id"]');
    expect(turn?.textContent).toContain('New synthetic pilot answer.');
    expect(turn?.getAttribute('data-pilot-verified')).toBe('true');
    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('focus.tutor_conversation_v1:user-1:sec-1:pdf-1')).not.toContain('synthetic-request-id');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
    expect(host!.querySelector('[data-pilot-request-id]')).toBeNull();
  });

  it('7M navigates matching PDF citations and disables cross-document jumps without inference', async () => {
    const navigate = vi.fn();
    mountTutorWithConversation(navigate);
    zikukAiRequestMock.mockResolvedValue({ version: 1, ok: true,
      result: { type: 'ask_course', text: 'Synthetic evidence [1] and other evidence [2].', knowledgeTier: 'course_material', sources: [
        { index: 1, sourceKind: 'free_space_pdf', sourceObjectId: 'pdf-1', fileName: 'Synthetic.pdf', pageNumber: 2 },
        { index: 2, sourceKind: 'free_space_pdf', sourceObjectId: 'other-pdf', fileName: 'Other.pdf', pageNumber: 8 },
      ] },
    });
    const input = setFollowUpInput('Show synthetic sources');
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    const local = host!.querySelector('[data-ask-zikuk-citation="1"]') as HTMLButtonElement;
    const foreign = host!.querySelector('[data-ask-zikuk-citation="2"]') as HTMLButtonElement;
    expect(local.disabled).toBe(false); expect(foreign.disabled).toBe(true);
    act(() => { local.click(); foreign.click(); });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(2);
    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
  });

  it('7M ignores a late paid-response mock after changing user and course', async () => {
    mountTutorWithConversation();
    let finish!: (response: Awaited<ReturnType<typeof gatewayClient.zikukAiRequest>>) => void;
    zikukAiRequestMock.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const input = setFollowUpInput('Old course question');
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    act(() => { root!.render(createElement(ContextualTutorCard, {
      tokens, sectionId: 'sec-2', sourceObjectId: 'pdf-2', userId: 'user-2', intent: null, onClose: () => {}, embedded: false,
    })); });
    await act(async () => { finish({ version: 1, ok: true, result: { type: 'ask_course', text: 'PRIVATE OLD COURSE ANSWER', sources: [] } }); });
    expect(host!.textContent).not.toContain('PRIVATE OLD COURSE ANSWER');
    expect(localStorage.getItem('focus.tutor_conversation_v1:user-2:sec-2:pdf-2') ?? '').not.toContain('PRIVATE OLD COURSE ANSWER');
    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
  });

  it('submits on Enter key when question is nonempty', async () => {
    mountTutorWithConversation();
    zikukAiRequestMock.mockImplementation(() => new Promise(() => {}));

    const input = setFollowUpInput('What happens next?');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
    const body = zikukAiRequestMock.mock.calls[0][0] as { question: string };
    expect(body.question).toBe('What happens next?');
  });

  it('does not submit on Shift+Enter in follow-up input', async () => {
    mountTutorWithConversation();
    zikukAiRequestMock.mockImplementation(() => new Promise(() => {}));

    const input = setFollowUpInput('Drafting question');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    });

    expect(zikukAiRequestMock).not.toHaveBeenCalled();
  });

  it('does not submit when IME composition is active', async () => {
    mountTutorWithConversation();
    zikukAiRequestMock.mockImplementation(() => new Promise(() => {}));

    const input = setFollowUpInput('Composing question');
    act(() => {
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    });

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(zikukAiRequestMock).not.toHaveBeenCalled();

    // After composition ends, Enter should submit
    act(() => {
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
  });

  it('does not submit empty questions or whitespace-only questions', async () => {
    mountTutorWithConversation();
    zikukAiRequestMock.mockImplementation(() => new Promise(() => {}));

    const sendBtn = host!.querySelector('[data-testid="tutor-followup-send-btn"]') as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);

    const input = setFollowUpInput('   ');
    expect(sendBtn.disabled).toBe(true);

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(zikukAiRequestMock).not.toHaveBeenCalled();
  });

  it('prevents duplicate submissions while loading', async () => {
    mountTutorWithConversation();
    zikukAiRequestMock.mockImplementation(() => new Promise(() => {}));

    const input = setFollowUpInput('Single question');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      // Immediate second Enter press while loading
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
  });

  it('supports mobile keyboard form submission', async () => {
    mountTutorWithConversation();
    zikukAiRequestMock.mockImplementation(() => new Promise(() => {}));

    setFollowUpInput('Mobile submitted question');
    const form = host!.querySelector('[data-testid="tutor-followup-input"]')?.closest('form') as HTMLFormElement;
    expect(form).toBeTruthy();

    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
    const body = zikukAiRequestMock.mock.calls[0][0] as { question: string };
    expect(body.question).toBe('Mobile submitted question');
  });
});
