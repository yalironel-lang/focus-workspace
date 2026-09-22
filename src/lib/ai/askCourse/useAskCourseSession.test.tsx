/**
 * @vitest-environment happy-dom
 *
 * M0.9C2 / M0.9C2.3 — Ask session turns + local continuity.
 */

import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZikukAiResponse } from '../gatewayClient';
import {
  ASK_CLIENT_MAX_PRIOR_ASSISTANT_TURNS,
  ASK_CLIENT_MAX_PRIOR_USER_CHARS,
  ASK_CLIENT_MAX_PRIOR_USER_TURNS,
  buildAskCourseRecentTurns,
} from './buildAskCourseRecentTurns';
import {
  askSessionStorageKey,
  clearAskSession,
  readAskSession,
} from './askSessionStorage';

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

const USER = 'user-continuity-1';

function Harness(props: {
  sectionId: string;
  open: boolean;
  userId?: string | null;
}) {
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

function mount(
  sectionId: string,
  open = true,
  userId: string | null = USER,
) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(createElement(Harness, { sectionId, open, userId }));
  });
}

function remount(
  sectionId: string,
  open = true,
  userId: string | null = USER,
) {
  act(() => {
    root!.render(createElement(Harness, { sectionId, open, userId }));
  });
}

function fullRemount(
  sectionId: string,
  open = true,
  userId: string | null = USER,
) {
  cleanup();
  mount(sectionId, open, userId);
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

async function ask(question: string) {
  await act(async () => {
    api!.setQuestion(question);
    api!.submit();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  zikukAiRequest.mockReset();
  api = null;
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
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
    await ask('Q1');

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
    await ask('Q1');
    await ask('Q2');

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
      await ask(q);
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
    await ask('Q1');
    await ask('Q2 fail');
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
    await ask('Q1');
    await ask('unknown');
    expect(api!.turns).toHaveLength(1);
    expect(api!.state.errorCode).toBe('knowledge_not_found');
    expect(api!.turns.some(t => t.answer.toLowerCase().includes('unknown'))).toBe(false);
  });

  it('new conversation clears turns and next ask has no recentTurns', async () => {
    zikukAiRequest.mockResolvedValue(ok('A1'));
    mount('sec-1');
    await ask('Q1');
    expect(api!.turns).toHaveLength(1);
    await act(async () => {
      api!.newConversation();
    });
    expect(api!.turns).toHaveLength(0);
    expect(api!.state.phase).toBe('idle');
    expect(api!.state.question).toBe('');

    await ask('Fresh');
    expect(zikukAiRequest.mock.calls.at(-1)![0]).toEqual({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Fresh',
    });
  });

  it('close preserves session and ignores stale in-flight response', async () => {
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
    // Close hides Ask but does not destroy conversation (none successful yet).
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
    // Pending question may remain as draft after abort; never as a successful turn.
    expect(readAskSession(USER, 'sec-1')?.turns ?? []).toHaveLength(0);
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
    zikukAiRequest.mockResolvedValueOnce(ok('From A'));
    await ask('About A');
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
    await ask('About B');
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
    await ask('Q1');
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

describe('M0.9C2.3 session continuity', () => {
  it('1. Turn 1 success persists active session', async () => {
    zikukAiRequest.mockResolvedValue(ok('A1'));
    mount('sec-1');
    await ask('Q1');
    const stored = readAskSession(USER, 'sec-1');
    expect(stored?.turns).toHaveLength(1);
    expect(stored?.turns[0]).toMatchObject({ question: 'Q1', answer: 'A1' });
  });

  it('2. unmount/remount same section restores both turns', async () => {
    zikukAiRequest
      .mockResolvedValueOnce(ok('A1'))
      .mockResolvedValueOnce(ok('A2'));
    mount('sec-1');
    await ask('Q1');
    await ask('Q2');
    fullRemount('sec-1');
    expect(api!.turns).toHaveLength(2);
    expect(api!.turns.map(t => t.question)).toEqual(['Q1', 'Q2']);
  });

  it('3. simulated refresh (new hook instance) restores both turns', async () => {
    zikukAiRequest
      .mockResolvedValueOnce(ok('A1'))
      .mockResolvedValueOnce(ok('A2'));
    mount('sec-1');
    await ask('Q1');
    await ask('Q2');
    fullRemount('sec-1', true);
    expect(api!.turns.map(t => [t.question, t.answer])).toEqual([
      ['Q1', 'A1'],
      ['Q2', 'A2'],
    ]);
  });

  it('4. restored session builds v2 recentTurns for Turn 3', async () => {
    zikukAiRequest
      .mockResolvedValueOnce(ok('A1'))
      .mockResolvedValueOnce(ok('A2'))
      .mockResolvedValueOnce(ok('A3'));
    mount('sec-1');
    await ask('Q1');
    await ask('Q2');
    fullRemount('sec-1');
    await ask('Q3');
    const body = zikukAiRequest.mock.calls.at(-1)![0];
    expect(body.version).toBe(2);
    expect(body.recentTurns).toEqual([
      { role: 'user', content: 'Q1' },
      { role: 'user', content: 'Q2' },
      { role: 'assistant', content: 'A2' },
    ]);
  });

  it('5. Back to course (close) then reopen preserves conversation', async () => {
    zikukAiRequest
      .mockResolvedValueOnce(ok('A1'))
      .mockResolvedValueOnce(ok('A2'));
    mount('sec-1', true);
    await ask('Q1');
    await ask('Q2');
    remount('sec-1', false);
    remount('sec-1', true);
    expect(api!.turns).toHaveLength(2);
    expect(api!.turns.map(t => t.question)).toEqual(['Q1', 'Q2']);
  });

  it('6. Escape path (close) then reopen preserves conversation', async () => {
    zikukAiRequest.mockResolvedValue(ok('A1'));
    mount('sec-1', true);
    await ask('Q1');
    remount('sec-1', false); // Escape → onClose → open=false
    remount('sec-1', true);
    expect(api!.turns).toHaveLength(1);
    expect(api!.turns[0]!.answer).toBe('A1');
  });

  it('7. New conversation clears visible + storage; next ask has no recentTurns', async () => {
    zikukAiRequest.mockResolvedValue(ok('A1'));
    mount('sec-1');
    await ask('Q1');
    expect(readAskSession(USER, 'sec-1')?.turns).toHaveLength(1);
    await act(async () => {
      api!.newConversation();
    });
    expect(api!.turns).toHaveLength(0);
    expect(readAskSession(USER, 'sec-1')).toBeNull();
    await ask('Fresh');
    expect(zikukAiRequest.mock.calls.at(-1)![0]).not.toHaveProperty('recentTurns');
    fullRemount('sec-1');
    expect(api!.turns).toHaveLength(1);
    expect(api!.turns[0]!.question).toBe('Fresh');
  });

  it('8–9. Course A never appears in B; returning to A restores A', async () => {
    zikukAiRequest.mockImplementation(async (req: { question: string }) =>
      ok(`Ans ${req.question}`),
    );
    mount('sec-a');
    await ask('About A');
    remount('sec-b');
    expect(api!.turns).toHaveLength(0);
    expect(api!.turns.some(t => t.question.includes('A'))).toBe(false);
    await ask('About B');
    expect(api!.turns).toHaveLength(1);
    expect(api!.turns[0]!.question).toBe('About B');
    remount('sec-a');
    expect(api!.turns).toHaveLength(1);
    expect(api!.turns[0]!.question).toBe('About A');
  });

  it('10–11. corrupt / oversized localStorage fails to empty session', async () => {
    localStorage.setItem(askSessionStorageKey(USER, 'sec-1'), '{bad');
    mount('sec-1');
    expect(api!.turns).toHaveLength(0);

    localStorage.setItem(
      askSessionStorageKey(USER, 'sec-2'),
      JSON.stringify({
        version: 1,
        sectionId: 'sec-2',
        turns: [
          {
            id: 't1',
            question: 'q',
            answer: 'a',
            sources: [{ broken: true }],
            status: 'success',
          },
        ],
        draft: '',
        updatedAt: 1,
      }),
    );
    remount('sec-2');
    expect(api!.turns).toHaveLength(0);
  });

  it('12–13. restored PDF + Notebook sources keep authoritative shapes for navigation', async () => {
    zikukAiRequest
      .mockResolvedValueOnce(
        ok('PDF ans', [
          {
            index: 1,
            sourceKind: 'free_space_pdf',
            sourceObjectId: 'pdf-obj',
            fileName: 'Doc.pdf',
            pageNumber: 7,
          },
        ]),
      )
      .mockResolvedValueOnce(
        ok('NB ans', [
          {
            index: 1,
            sourceKind: 'notebook_page',
            notebookObjectId: 'nb-obj',
            pageId: 'page-1',
            notebookTitle: 'NB',
            pageTitle: 'Intro',
          },
        ]),
      );
    mount('sec-1');
    await ask('PDF q');
    await ask('NB q');
    fullRemount('sec-1');
    expect(api!.turns[0]!.sources[0]).toEqual({
      index: 1,
      sourceKind: 'free_space_pdf',
      sourceObjectId: 'pdf-obj',
      fileName: 'Doc.pdf',
      pageNumber: 7,
    });
    expect(api!.turns[1]!.sources[0]).toEqual({
      index: 1,
      sourceKind: 'notebook_page',
      notebookObjectId: 'nb-obj',
      pageId: 'page-1',
      notebookTitle: 'NB',
      pageTitle: 'Intro',
    });
  });

  it('14. stale in-flight after New conversation does not repopulate storage', async () => {
    let resolve!: (v: ZikukAiResponse) => void;
    zikukAiRequest.mockImplementation(
      () =>
        new Promise<ZikukAiResponse>(r => {
          resolve = r;
        }),
    );
    mount('sec-1');
    await act(async () => {
      api!.setQuestion('pending');
      api!.submit();
    });
    await act(async () => {
      api!.newConversation();
    });
    expect(api!.turns).toHaveLength(0);
    clearAskSession(USER, 'sec-1');
    await act(async () => {
      resolve(ok('Late'));
      await Promise.resolve();
    });
    expect(api!.turns).toHaveLength(0);
    expect(readAskSession(USER, 'sec-1')).toBeNull();
  });

  it('15. stale response after course change does not contaminate new section', async () => {
    let resolve!: (v: ZikukAiResponse) => void;
    zikukAiRequest.mockImplementation(
      () =>
        new Promise<ZikukAiResponse>(r => {
          resolve = r;
        }),
    );
    mount('sec-a');
    await act(async () => {
      api!.setQuestion('A pending');
      api!.submit();
    });
    remount('sec-b');
    await act(async () => {
      resolve(ok('Late A'));
      await Promise.resolve();
    });
    expect(api!.turns).toHaveLength(0);
    expect(readAskSession(USER, 'sec-b')?.turns ?? []).toHaveLength(0);
    expect(readAskSession(USER, 'sec-a')?.turns ?? []).toHaveLength(0);
  });

  it('16. persistence does not alter buildAskCourseRecentTurns bounds', () => {
    const longQ = 'Q'.repeat(ASK_CLIENT_MAX_PRIOR_USER_CHARS + 50);
    const turns = [
      { question: 'u1', answer: 'a1' },
      { question: 'u2', answer: 'a2' },
      { question: longQ, answer: 'a3' },
    ];
    const recent = buildAskCourseRecentTurns(turns);
    expect(recent.filter(t => t.role === 'user')).toHaveLength(
      ASK_CLIENT_MAX_PRIOR_USER_TURNS,
    );
    expect(recent.filter(t => t.role === 'assistant')).toHaveLength(
      ASK_CLIENT_MAX_PRIOR_ASSISTANT_TURNS,
    );
    expect(recent.every(t => t.content.length <= ASK_CLIENT_MAX_PRIOR_USER_CHARS || t.role === 'assistant')).toBe(
      true,
    );
    const userMsgs = recent.filter(t => t.role === 'user');
    expect(userMsgs.every(t => t.content.length <= ASK_CLIENT_MAX_PRIOR_USER_CHARS)).toBe(
      true,
    );
  });
});
