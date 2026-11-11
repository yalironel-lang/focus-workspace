import { describe, it, expect, vi } from 'vitest';
import { runAskCoursePipeline, estimateEmbeddingInputTokens } from './runAskCourse.ts';
import type { AskCourseDeps } from './runAskCourse.ts';
import { createFakeEmbeddingProvider } from '../knowledge/fakeEmbeddingProvider.ts';
import { createMemoryEnforcementStore } from '../enforcement.ts';
import type { AiProvider } from '../types.ts';
import type { ZikukAiRequest } from '../requestTypes.ts';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const SECTION_ID = 'section-math-101';

function makeRequest(overrides?: Partial<Extract<ZikukAiRequest, { capability: 'ask_course' }>>): Extract<ZikukAiRequest, { capability: 'ask_course' }> {
  return {
    version: 1,
    capability: 'ask_course',
    sectionId: SECTION_ID,
    question: 'What is the definition of a limit in calculus?',
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<AskCourseDeps>): { deps: AskCourseDeps; onDispatch: ReturnType<typeof vi.fn> } {
  const onDispatch = vi.fn();
  const emb = createFakeEmbeddingProvider({ kind: 'ok' });
  const gen: AiProvider = {
    async complete() {
      return {
        ok: true,
        text: 'A limit describes the value a function approaches.',
        latencyMs: 15,
        usage: { inputTokens: 400, outputTokens: 80, totalTokens: 480 },
      };
    },
  };

  const deps: AskCourseDeps = {
    loadSectionOwner: async () => ({ userId: USER_ID }),
    embeddingProvider: emb,
    searchKnowledge: async () => ({
      ok: true,
      raw: [
        {
          source_kind: 'free_space_pdf',
          source_object_id: 'pdf-obj-1',
          notebook_object_id: null,
          file_name: 'calculus.pdf',
          page_number: 1,
          chunk_index: 0,
          text: 'Formal limit definition with epsilon and delta.',
          similarity: 0.92,
        },
      ],
    }),
    loadNotebookFsoForCitation: async () => null,
    generationProvider: gen,
    routerConfig: { model: 'gpt-5.6-luna' },
    enforcement: createMemoryEnforcementStore(),
    onProviderDispatch: onDispatch,
    ...overrides,
  };

  return { deps, onDispatch };
}

describe('ask_course Embedding Cost Coverage & Reservation Accounting (Phase 6F.1)', () => {
  it('1. estimates embedding tokens conservatively based on query text', () => {
    expect(estimateEmbeddingInputTokens('')).toBe(0);
    expect(estimateEmbeddingInputTokens('short question')).toBe(21); // ceil(14/3) + 16 = 5 + 16 = 21
    const longQuery = 'a'.repeat(300);
    expect(estimateEmbeddingInputTokens(longQuery)).toBe(116); // 100 + 16
  });

  it('2. dispatches reservation BEFORE upstream embedding call', async () => {
    const events: string[] = [];

    const onDispatch = vi.fn(async () => {
      events.push('dispatch');
    });

    const fakeEmbedder = {
      async embed(input: any) {
        events.push('embed');
        return {
          ok: true as const,
          embeddings: [new Array(1536).fill(0.01)],
          model: 'text-embedding-3-small',
          dimensions: 1536,
          usage: { inputTokens: 25, totalTokens: 25 },
          latencyMs: 10,
          providerRequestId: 'req-embed-1',
          retryable: false as const,
        };
      },
    };

    const { deps } = makeDeps({
      embeddingProvider: fakeEmbedder as any,
      onProviderDispatch: onDispatch,
    });

    const result = await runAskCoursePipeline({
      authUserId: USER_ID,
      request: makeRequest(),
      deps,
    });

    expect(result.response.ok).toBe(true);
    // Verified: dispatch occurred before embed!
    expect(events[0]).toBe('dispatch');
    expect(events[1]).toBe('embed');
    expect(events).toEqual(['dispatch', 'embed', 'dispatch']);
  });

  it('3. accounts for embedding tokens alongside generation tokens without double-counting', async () => {
    const fakeEmbedder = {
      async embed() {
        return {
          ok: true as const,
          embeddings: [new Array(1536).fill(0.01)],
          model: 'text-embedding-3-small',
          dimensions: 1536,
          usage: { inputTokens: 30, totalTokens: 30 },
          latencyMs: 12,
          providerRequestId: 'req-embed-30',
          retryable: false as const,
        };
      },
    };

    const fakeGen: AiProvider = {
      async complete() {
        return {
          ok: true,
          text: 'The limit is L.',
          latencyMs: 25,
          usage: { inputTokens: 500, outputTokens: 100, totalTokens: 600 },
        };
      },
    };

    const { deps } = makeDeps({
      embeddingProvider: fakeEmbedder as any,
      generationProvider: fakeGen,
    });

    const result = await runAskCoursePipeline({
      authUserId: USER_ID,
      request: makeRequest(),
      deps,
    });

    expect(result.response.ok).toBe(true);
    expect(result.meta.embeddingInputTokens).toBe(30);
    expect(result.meta.inputTokens).toBe(500);
    expect(result.meta.outputTokens).toBe(100);
    // Total tokens is exactly embedding (30) + generation (600) = 630
    expect(result.meta.totalTokens).toBe(630);
  });

  it('4. accounts for embedding tokens when embedding fails after dispatch', async () => {
    const { deps, onDispatch } = makeDeps({
      embeddingProvider: createFakeEmbeddingProvider({ kind: 'timeout' }),
    });

    const result = await runAskCoursePipeline({
      authUserId: USER_ID,
      request: makeRequest(),
      deps,
    });

    expect(result.response.ok).toBe(false);
    if (!result.response.ok) {
      expect(result.response.error.code).toBe('provider_timeout');
    }

    // Dispatch must have occurred
    expect(onDispatch).toHaveBeenCalledTimes(1);

    // Conservative embedding tokens must be preserved in meta so the gateway can settle
    expect(result.meta.embeddingInputTokens).toBeGreaterThan(0);
    expect(result.meta.totalTokens).toBe(result.meta.embeddingInputTokens);
  });

  it('5. accounts for embedding tokens when retrieval returns zero chunks', async () => {
    const { deps, onDispatch } = makeDeps({
      searchKnowledge: async () => ({ ok: true, raw: [] }), // 0 chunks found
    });

    const result = await runAskCoursePipeline({
      authUserId: USER_ID,
      request: makeRequest(),
      deps,
    });

    expect(result.response.ok).toBe(false);
    if (!result.response.ok) {
      expect(result.response.error.code).toBe('knowledge_not_found');
    }

    // Provider was dispatched for embedding
    expect(onDispatch).toHaveBeenCalledTimes(1);

    // Total tokens preserves the consumed embedding tokens
    expect(result.meta.embeddingInputTokens).toBeGreaterThan(0);
    expect(result.meta.totalTokens).toBe(result.meta.embeddingInputTokens);
  });

  it('6. does not dispatch provider or count tokens on preflight failure', async () => {
    const { deps, onDispatch } = makeDeps({
      loadSectionOwner: async () => null, // Section not found
    });

    const result = await runAskCoursePipeline({
      authUserId: USER_ID,
      request: makeRequest(),
      deps,
    });

    expect(result.response.ok).toBe(false);
    if (!result.response.ok) {
      expect(result.response.error.code).toBe('not_found');
    }

    // Never dispatched upstream
    expect(onDispatch).not.toHaveBeenCalled();
    expect(result.meta.embeddingInputTokens).toBeUndefined();
    expect(result.meta.totalTokens).toBeUndefined();
  });
});
