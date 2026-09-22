/**
 * @vitest-environment happy-dom
 *
 * M0.9C2 — ephemeral Ask session (turns, recentTurns, stale/course safety).
 */

import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZikukAiResponse } from '../gatewayClient';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const zikukAiRequest = vi.hoisted(() => vi.fn());

vi.mock('../gatewayClient', async () => {
  const actual = await vi.importActual<typeof import('../gatewayClient')>('../gatewayClient');
  return {
    ...actual,
    zikukAiRequest: (...args: unknown[]) => zikukAiRequest(...args),
  };
});

const { useAskCourseSession } = await import('./useAskCourseSession');

let root: Root | null = null;
let host: HTMLDivElement | null = null;

type SessionApi = ReturnType<typeof useAskCourseSession>;
let api: SessionApi | null = null;

function Harness(props: { sectionId: string; open: boolean }) {
  const s = useAskCourseSession(props);
  useEffect(() => {
    api = s;
  });
  return createElement('div', {
    'data-turns': String(s.turns.length),
    'data-phase': s.state.phase,
    'data-pending': s.activePendingQuestion ?? '',
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

function ok(
  text: string,
  sources: Array<Record<string, unknown>> = [],
): ZikukAiResponse {
  return {
    version: 1,
    ok: true,
    result: {
      type: 'ask_course',
      text,
      sources: sources as never,
    },
  };
}

beforeEach(() => {
  zikukAiRequest.mockReset();
  api = null;
});

afterEach(() => {
  cleanup();
});

describe('useAskCourseSession', () => {
  it('first ask sends v2 without recentTurns and appends turn', async () => {
    zikukAiRequest.mockResolvedValue(
      ok('A1', [
        {
          index: 1,
          sourceKind: 'free_space_pdf',
          sourceObjectId: 'pdf-1',
          fileName: 'Notes.pdf',
          pageNumber: 3,
        },
      ]),
    );
    mount('sec-1');
    await act(async () => {
      api!.setQuestion('Q1');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(zikukAiRequest.mock.calls[0][0]).toEqual({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Q1',
    });
    expect(api!.turns).toHaveLength(1);
    expect(api!.turns[0]).toMatchObject({
      question: 'Q1',
      answer: 'A1',
      status: 'success',
    });
    expect(api!.turns[0]!.sources[0]).toMatchObject({ sourceObjectId: 'pdf-1' });
    expect(api!.state.question).toBe('');
    expect(api!.state.phase).toBe('idle');
  });

  it('follow-up sends bounded recentTurns from prior turns only', async () => {
    zikukAiRequest
      .mockResolvedValueOnce(ok('A1'))
      .mockResolvedValueOnce(ok('A2'));
    mount('sec-1');
    await act(async () => {
      api!.setQuestion('Q1');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      api!.setQuestion('Q2');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const body = zikukAiRequest.mock.calls[1][0];
    expect(body.question).toBe('Q2');
    expect(body.version).toBe(2);
    expect(body.recentTurns).toEqual([
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
    ]);
    expect(JSON.stringify(body.recentTurns)).not.toContain('source');
    expect(api!.turns).toHaveLength(2);
    expect(api!.turns.map(t => t.question)).toEqual(['Q1', 'Q2']);
  });

  it('keeps older visible turns while bounding model context', async () => {
    zikukAiRequest.mockImplementation(async (req: { question: string }) =>
      ok(`Answer for ${req.question}`),
    );
    mount('sec-1');
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']) {
      await act(async () => {
        api!.setQuestion(q);
        api!.submit();
      });
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(api!.turns).toHaveLength(5);
    const last = zikukAiRequest.mock.calls[4][0];
    expect(last.question).toBe('Q5');
    expect(last.recentTurns).toEqual([
      { role: 'user', content: 'Q3' },
      { role: 'user', content: 'Q4' },
      { role: 'assistant', content: 'Answer for Q4' },
    ]);
    expect(api!.turns[0]!.question).toBe('Q1');
  });

  it('preserves prior turns on failure and restores composer', async () => {
    zikukAiRequest
      .mockResolvedValueOnce(ok('A1'))
      .mockResolvedValueOnce({
        version: 1,
        ok: false,
        error: { code: 'provider_timeout', message: 'timeout' },
      });
    mount('sec-1');
    await act(async () => {
      api!.setQuestion('Q1');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      api!.setQuestion('Q2 fail');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.turns).toHaveLength(1);
    expect(api!.turns[0]!.answer).toBe('A1');
    expect(api!.state.phase).toBe('error');
    expect(api!.state.question).toBe('Q2 fail');
  });

  it('knowledge_not_found keeps prior turns without fabricating an answer', async () => {
    zikukAiRequest
      .mockResolvedValueOnce(ok('A1'))
      .mockResolvedValueOnce({
        version: 1,
        ok: false,
        error: { code: 'knowledge_not_found', message: 'raw' },
      });
    mount('sec-1');
    await act(async () => {
      api!.setQuestion('Q1');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      api!.setQuestion('unknown');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.turns).toHaveLength(1);
    expect(api!.state.errorCode).toBe('knowledge_not_found');
    expect(api!.turns.some(t => t.answer.toLowerCase().includes('unknown'))).toBe(false);
  });

  it('new conversation clears turns and next ask has no recentTurns', async () => {
    zikukAiRequest.mockResolvedValue(ok('A1'));
    mount('sec-1');
    await act(async () => {
      api!.setQuestion('Q1');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.turns).toHaveLength(1);
    await act(async () => {
      api!.newConversation();
    });
    expect(api!.turns).toHaveLength(0);
    expect(api!.state.phase).toBe('idle');
    expect(api!.state.question).toBe('');

    await act(async () => {
      api!.setQuestion('Fresh');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(zikukAiRequest.mock.calls.at(-1)![0]).toEqual({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Fresh',
    });
  });

  it('close clears session and ignores stale response', async () => {
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
      api!.setQuestion('stale');
      api!.submit();
    });
    remount('sec-1', false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.turns).toHaveLength(0);
    expect(api!.state.phase).toBe('idle');

    await act(async () => {
      try {
        resolve(ok('should not append'));
      } catch {
        /* aborted */
      }
      await Promise.resolve();
    });
    remount('sec-1', true);
    expect(api!.turns).toHaveLength(0);
  });

  it('section change resets and blocks cross-course recentTurns / stale append', async () => {
    let resolve!: (v: ZikukAiResponse) => void;
    zikukAiRequest.mockImplementation(
      () =>
        new Promise<ZikukAiResponse>(r => {
          resolve = r;
        }),
    );
    mount('sec-a');
    // Complete turn in A first via immediate resolve path after...
    zikukAiRequest.mockResolvedValueOnce(ok('From A'));
    await act(async () => {
      api!.setQuestion('About A');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.turns).toHaveLength(1);

    zikukAiRequest.mockImplementation(
      () =>
        new Promise<ZikukAiResponse>(r => {
          resolve = r;
        }),
    );
    await act(async () => {
      api!.setQuestion('Still A');
      api!.submit();
    });
    remount('sec-b');
    await act(async () => {
      await Promise.resolve();
    });
    expect(api!.turns).toHaveLength(0);
    expect(api!.getRecentTurnsForTest()).toEqual([]);

    await act(async () => {
      resolve(ok('Late A'));
      await Promise.resolve();
    });
    expect(api!.turns).toHaveLength(0);

    zikukAiRequest.mockResolvedValue(ok('From B'));
    await act(async () => {
      api!.setQuestion('About B');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(zikukAiRequest.mock.calls.at(-1)![0]).toEqual({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-b',
      question: 'About B',
    });
    expect(api!.turns).toHaveLength(1);
    expect(api!.turns[0]!.answer).toBe('From B');
  });

  it('shows pending question while loading without erasing prior turns', async () => {
    let resolve!: (v: ZikukAiResponse) => void;
    zikukAiRequest
      .mockResolvedValueOnce(ok('A1'))
      .mockImplementation(
        () =>
          new Promise<ZikukAiResponse>(r => {
            resolve = r;
          }),
      );
    mount('sec-1');
    await act(async () => {
      api!.setQuestion('Q1');
      api!.submit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      api!.setQuestion('Q2');
      api!.submit();
    });
    expect(api!.turns).toHaveLength(1);
    expect(api!.activePendingQuestion).toBe('Q2');
    expect(api!.state.question).toBe('');
    expect(api!.isLoading).toBe(true);

    await act(async () => {
      resolve(ok('A2'));
      await Promise.resolve();
    });
    expect(api!.turns).toHaveLength(2);
    expect(api!.activePendingQuestion).toBeNull();
  });
});
