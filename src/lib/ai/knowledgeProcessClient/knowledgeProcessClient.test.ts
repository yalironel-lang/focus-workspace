/**
 * @vitest-environment happy-dom
 *
 * M0.7B.2 — knowledgeProcessClient (mocked invoke, no real network).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('../../supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invoke(...args),
    },
  },
}));

const {
  AI_KNOWLEDGE_PROCESS_FUNCTION_NAME,
  requestKnowledgeProcess,
} = await import('./index');

function httpError(status: number, body: unknown) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: response,
  };
}

const okBody = {
  version: 1 as const,
  ok: true as const,
  result: {
    type: 'knowledge_process' as const,
    ingest: {
      outcome: 'reused' as const,
      sourceVersion: 1,
      pageCount: 0,
      chunkCount: 0,
    },
    index: {
      outcome: 'reused' as const,
      retrievalSourceVersion: 1,
    },
  },
};

beforeEach(() => {
  invoke.mockReset();
});

describe('M0.7B.2 knowledgeProcessClient', () => {
  it('1. invokes ai-knowledge-process by name', async () => {
    invoke.mockResolvedValue({ data: okBody, error: null });
    await requestKnowledgeProcess({
      version: 1,
      sectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceObjectId: 'pdf-1',
    });
    expect(invoke).toHaveBeenCalledWith(
      AI_KNOWLEDGE_PROCESS_FUNCTION_NAME,
      expect.objectContaining({
        body: {
          version: 1,
          sectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sourceObjectId: 'pdf-1',
        },
      }),
    );
    expect(AI_KNOWLEDGE_PROCESS_FUNCTION_NAME).toBe('ai-knowledge-process');
  });

  it('2+26. request body is only version/sectionId/sourceObjectId', async () => {
    invoke.mockResolvedValue({ data: okBody, error: null });
    await requestKnowledgeProcess({
      version: 1,
      sectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceObjectId: 'pdf-1',
    });
    const body = invoke.mock.calls[0]![1].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['sectionId', 'sourceObjectId', 'version']);
    expect(JSON.stringify(body)).not.toMatch(/userId|storagePath|model|hash|embedding/i);
  });

  it('3. parses success contract', async () => {
    invoke.mockResolvedValue({ data: okBody, error: null });
    const res = await requestKnowledgeProcess({
      version: 1,
      sectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceObjectId: 'pdf-1',
    });
    expect(res).toEqual(okBody);
  });

  it('4. preserves structured non-2xx from error.context', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(422, {
        version: 1,
        ok: false,
        error: {
          code: 'no_extractable_text',
          message: 'This PDF has no extractable text layer.',
        },
      }),
    });
    const res = await requestKnowledgeProcess({
      version: 1,
      sectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceObjectId: 'pdf-1',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('no_extractable_text');
    expect(res.error.code).not.toBe('network_error');
  });

  it('5. malformed response → safe failure', async () => {
    invoke.mockResolvedValue({ data: { weird: true }, error: null });
    const res = await requestKnowledgeProcess({
      version: 1,
      sectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceObjectId: 'pdf-1',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('internal_error');
  });

  it('6. AbortSignal forwarded', async () => {
    const signal = new AbortController().signal;
    invoke.mockResolvedValue({ data: okBody, error: null });
    await requestKnowledgeProcess(
      {
        version: 1,
        sectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sourceObjectId: 'pdf-1',
      },
      { signal },
    );
    expect(invoke.mock.calls[0]![1].signal).toBe(signal);
  });
});
