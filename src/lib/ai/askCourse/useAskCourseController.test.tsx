/**
 * @vitest-environment happy-dom
 *
 * M0.6 Ask ZIKUK controller — lifecycle, allowlist, stale/section safety.
 */

import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZikukAiResponse } from '../gatewayClient';
import {
  isAskCourseRetryAllowed,
  userFacingAskCourseErrorMessage,
} from './userFacingAskCourseError';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const zikukAiRequest = vi.hoisted(() => vi.fn());

vi.mock('../gatewayClient', async () => {
  const actual = await vi.importActual<typeof import('../gatewayClient')>('../gatewayClient');
  return {
    ...actual,
    zikukAiRequest: (...args: unknown[]) => zikukAiRequest(...args),
  };
});

const { useAskCourseController } = await import('./useAskCourseController');

let root: Root | null = null;
let host: HTMLDivElement | null = null;

type HarnessApi = {
  state: ReturnType<typeof useAskCourseController>['state'];
  setQuestion: (q: string) => void;
  submit: () => void;
  retry: () => void;
  canSubmit: boolean;
  isLoading: boolean;
};

let api: HarnessApi | null = null;

function Harness(props: { sectionId: string; open: boolean }) {
  const c = useAskCourseController(props);
  useEffect(() => {
    api = c;
  });
  return createElement('div', {
    'data-phase': c.state.phase,
    'data-text': c.state.resultText ?? '',
  });
}

function mount(sectionId: string, open = true) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(createElement(Harness, { sectionId, open }));
  });
}

function remount(sectionId: string, open = true) {
  act(() => {
    root!.render(createElement(Harness, { sectionId, open }));
  });
}

function cleanup() {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  api = null;
}

function okResponse(text: string): ZikukAiResponse {
  return {
    version: 1,
    ok: true,
    result: {
      type: 'ask_course',
      text,
      sources: [
        {
          index: 1,
          sourceKind: 'free_space_pdf',
          sourceObjectId: 'pdf-1',
          fileName: 'Notes.pdf',
          pageNumber: 3,
        },
      ],
    },
  };
}

function errResponse(code: string, message = 'fail'): ZikukAiResponse {
  return {
    version: 1,
    ok: false,
    error: { code: code as never, message },
  };
}

beforeEach(() => {
  zikukAiRequest.mockReset();
  api = null;
});

afterEach(() => {
  cleanup();
});

describe('userFacingAskCourseError', () => {
  it('maps knowledge_not_found with specific guidance', () => {
    const msg = userFacingAskCourseErrorMessage('knowledge_not_found', 'raw');
    expect(msg).toContain("couldn't find enough support");
    expect(msg).toContain('more specific concept');
    expect(msg.toLowerCase()).not.toContain("doesn't know");
    expect(isAskCourseRetryAllowed('knowledge_not_found')).toBe(false);
  });

  it('maps auth and transient codes safely', () => {
    expect(userFacingAskCourseErrorMessage('unauthenticated', null)).toMatch(/Sign in/i);
    expect(userFacingAskCourseErrorMessage('quota_exceeded', null)).toMatch(/Daily AI limit/i);
    expect(isAskCourseRetryAllowed('provider_timeout')).toBe(true);
    expect(isAskCourseRetryAllowed('ai_disabled')).toBe(false);
  });
});

describe('useAskCourseController', () => {
  it('successful ask_course request with exact allowlist shape', async () => {
    zikukAiRequest.mockResolvedValue(okResponse('Grounded answer.'));
    mount('sec-1');
    await act(async () => {
      api!.setQuestion('What is natural law?');
    });
    await act(async () => {
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(zikukAiRequest).toHaveBeenCalledTimes(1);
    const [body, opts] = zikukAiRequest.mock.calls[0];
    expect(body).toEqual({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'What is natural law?',
    });
    expect(opts).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(Object.keys(body).sort()).toEqual(['capability', 'question', 'sectionId', 'version']);
    expect(api!.state.phase).toBe('success');
    expect(api!.state.resultText).toBe('Grounded answer.');
    expect(api!.state.sources).toHaveLength(1);
    expect(api!.state.submittedQuestion).toBe('What is natural law?');
    expect(api!.state.question).toBe('');
  });

  it('sends recentTurns from getRecentTurns and sessions return to idle on success', async () => {
    const onAskSuccess = vi.fn();
    const getRecentTurns = vi.fn(() => [
      { role: 'user' as const, content: 'Prior Q' },
      { role: 'assistant' as const, content: 'Prior A' },
    ]);

    function SessionHarness(props: { sectionId: string; open: boolean }) {
      const c = useAskCourseController({
        ...props,
        getRecentTurns,
        onAskSuccess,
      });
      useEffect(() => {
        api = c;
      });
      return createElement('div', { 'data-phase': c.state.phase });
    }

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(createElement(SessionHarness, { sectionId: 'sec-1', open: true }));
    });

    zikukAiRequest.mockResolvedValue(okResponse('Follow-up answer'));
    await act(async () => {
      api!.setQuestion('Follow up?');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getRecentTurns).toHaveBeenCalled();
    expect(zikukAiRequest.mock.calls[0][0]).toEqual({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Follow up?',
      recentTurns: [
        { role: 'user', content: 'Prior Q' },
        { role: 'assistant', content: 'Prior A' },
      ],
    });
    expect(onAskSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'Follow up?',
        text: 'Follow-up answer',
      }),
    );
    expect(api!.state.phase).toBe('idle');
    expect(api!.state.question).toBe('');
    expect(api!.state.resultText).toBeNull();
  });

  it('omits empty recentTurns from the request body', async () => {
    zikukAiRequest.mockResolvedValue(okResponse('A'));
    function SessionHarness(props: { sectionId: string; open: boolean }) {
      const c = useAskCourseController({
        ...props,
        getRecentTurns: () => [],
      });
      useEffect(() => {
        api = c;
      });
      return createElement('div');
    }
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(createElement(SessionHarness, { sectionId: 'sec-1', open: true }));
    });
    await act(async () => {
      api!.setQuestion('First');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(zikukAiRequest.mock.calls[0][0]).toEqual({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'First',
    });
    expect(zikukAiRequest.mock.calls[0][0]).not.toHaveProperty('recentTurns');
  });

  it('preserves composer question on error for retry', async () => {
    zikukAiRequest.mockResolvedValue(errResponse('provider_timeout', 'timeout'));
    mount('sec-1');
    await act(async () => {
      api!.setQuestion('Keep me');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.state.phase).toBe('error');
    expect(api!.state.question).toBe('Keep me');
    expect(api!.state.submittedQuestion).toBeNull();
  });

  it('blocks empty question and duplicate loading submit', async () => {
    let resolve!: (v: ZikukAiResponse) => void;
    zikukAiRequest.mockImplementation(
      () =>
        new Promise<ZikukAiResponse>(r => {
          resolve = r;
        }),
    );
    mount('sec-1');
    await act(async () => {
      api!.setQuestion('   ');
      api!.submit();
    });
    expect(zikukAiRequest).not.toHaveBeenCalled();

    await act(async () => {
      api!.setQuestion('Q1');
      api!.submit();
    });
    expect(zikukAiRequest).toHaveBeenCalledTimes(1);
    expect(api!.isLoading).toBe(true);

    await act(async () => {
      api!.submit();
    });
    expect(zikukAiRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(okResponse('A1'));
      await Promise.resolve();
    });
    expect(api!.state.phase).toBe('success');
  });

  it('aborts on close and ignores stale response', async () => {
    let resolve!: (v: ZikukAiResponse) => void;
    zikukAiRequest.mockImplementation(
      (_req: unknown, opts?: { signal?: AbortSignal }) =>
        new Promise<ZikukAiResponse>((r, rej) => {
          resolve = r;
          opts?.signal?.addEventListener('abort', () => {
            rej(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    mount('sec-1', true);
    await act(async () => {
      api!.setQuestion('stale?');
      api!.submit();
    });
    expect(api!.state.phase).toBe('loading');

    remount('sec-1', false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.state.phase).toBe('idle');
    expect(api!.state.resultText).toBeNull();

    await act(async () => {
      try {
        resolve(okResponse('should not paint'));
      } catch {
        /* aborted */
      }
      await Promise.resolve();
    });
    expect(api!.state.phase).toBe('idle');
    expect(api!.state.resultText).toBeNull();
  });

  it('section change clears and invalidates in-flight', async () => {
    let resolve!: (v: ZikukAiResponse) => void;
    zikukAiRequest.mockImplementation(
      () =>
        new Promise<ZikukAiResponse>(r => {
          resolve = r;
        }),
    );
    mount('sec-a');
    await act(async () => {
      api!.setQuestion('About A');
      api!.submit();
    });
    remount('sec-b');
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.state.phase).toBe('idle');
    expect(api!.state.resultText).toBeNull();

    await act(async () => {
      resolve(okResponse('Answer for A'));
      await Promise.resolve();
    });
    expect(api!.state.phase).toBe('idle');
    expect(api!.state.resultText).toBeNull();
  });

  it('retry creates exactly one intentional new request', async () => {
    zikukAiRequest
      .mockResolvedValueOnce(errResponse('provider_timeout', 'timeout'))
      .mockResolvedValueOnce(okResponse('Recovered'));
    mount('sec-1');
    await act(async () => {
      api!.setQuestion('Retry me');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.state.phase).toBe('error');
    expect(api!.state.errorCode).toBe('provider_timeout');

    await act(async () => {
      api!.retry();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(zikukAiRequest).toHaveBeenCalledTimes(2);
    expect(zikukAiRequest.mock.calls[1][0].question).toBe('Retry me');
    expect(api!.state.phase).toBe('success');
    expect(api!.state.resultText).toBe('Recovered');
  });

  it('second successful ask replaces first result', async () => {
    zikukAiRequest
      .mockResolvedValueOnce({
        version: 1,
        ok: true,
        result: {
          type: 'ask_course',
          text: 'First',
          sources: [
            { index: 1, sourceObjectId: 'a', fileName: 'A.pdf', pageNumber: 1 },
          ],
        },
      })
      .mockResolvedValueOnce({
        version: 1,
        ok: true,
        result: {
          type: 'ask_course',
          text: 'Second',
          sources: [
            { index: 1, sourceObjectId: 'b', fileName: 'B.pdf', pageNumber: 2 },
          ],
        },
      });
    mount('sec-1');
    await act(async () => {
      api!.setQuestion('Q1');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.state.resultText).toBe('First');

    await act(async () => {
      api!.setQuestion('Q2');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.state.resultText).toBe('Second');
    expect(api!.state.sources[0]?.sourceObjectId).toBe('b');
    expect(zikukAiRequest).toHaveBeenCalledTimes(2);
  });
});
