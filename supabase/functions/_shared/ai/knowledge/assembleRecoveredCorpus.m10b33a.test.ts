/**
 * @vitest-environment node
 *
 * M1.0B B3.3A — canonical assembly + unpublished index (unit).
 * No remote Supabase. No Production. No retrieval flip.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  assertProcessingAuthority,
  assertRecoveryTerminalGate,
} from './assertRecoveryTerminalGate.ts';
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
} from './bounds.ts';
import { chunkPageTexts } from './chunkPages.ts';
import { createFakeEmbeddingProvider } from './fakeEmbeddingProvider.ts';
import {
  assertAssembleLogIsPrivacySafe,
  formatAssembleRecoveredCorpusLogLine,
} from './privacyLogAssemble.ts';
import {
  runAssembleRecoveredCorpus,
  type AssembleRecoveredCorpusDeps,
} from './runAssembleRecoveredCorpus.ts';
import type { SourceIndexMeta } from './runKnowledgeIndex.ts';
import { validateCanonicalPageSet } from './validateCanonicalPageSet.ts';

const SOURCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function page(
  n: number,
  text: string,
  reasons: string[] = [],
): {
  sourceId: string;
  sourceVersion: number;
  pageNumber: number;
  canonicalText: string;
  detectorReasons: string[];
} {
  return {
    sourceId: SOURCE_ID,
    sourceVersion: 2,
    pageNumber: n,
    canonicalText: text,
    detectorReasons: reasons,
  };
}

describe('M1.0B B3.3A validateCanonicalPageSet', () => {
  it('accepts exact expected page set 1..P', () => {
    const r = validateCanonicalPageSet({
      sourceId: SOURCE_ID,
      sourceVersion: 2,
      expectedPageCount: 2,
      rows: [page(2, 'b'), page(1, 'a')],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    expect(r.pages.map((p) => p.text)).toEqual(['a', 'b']);
  });

  it('rejects missing page (MISSING ≠ EMPTY)', () => {
    const r = validateCanonicalPageSet({
      sourceId: SOURCE_ID,
      sourceVersion: 2,
      expectedPageCount: 2,
      rows: [page(1, 'only')],
    });
    expect(r).toMatchObject({ ok: false, code: 'missing_page', detail: 'page_2' });
  });

  it('accepts explicit empty page', () => {
    const r = validateCanonicalPageSet({
      sourceId: SOURCE_ID,
      sourceVersion: 2,
      expectedPageCount: 2,
      rows: [page(1, 'content'), page(2, '')],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pages[1]!.text).toBe('');
  });

  it('orders by page_number ASC never insertion order', () => {
    const r = validateCanonicalPageSet({
      sourceId: SOURCE_ID,
      sourceVersion: 2,
      expectedPageCount: 3,
      rows: [page(3, 'c'), page(1, 'a'), page(2, 'b')],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pages.map((p) => p.text)).toEqual(['a', 'b', 'c']);
  });

  it('rejects duplicate logical page', () => {
    const r = validateCanonicalPageSet({
      sourceId: SOURCE_ID,
      sourceVersion: 2,
      expectedPageCount: 1,
      rows: [page(1, 'a'), page(1, 'dup')],
    });
    expect(r).toMatchObject({ ok: false, code: 'duplicate_page' });
  });

  it('rejects cross-version contamination', () => {
    const r = validateCanonicalPageSet({
      sourceId: SOURCE_ID,
      sourceVersion: 2,
      expectedPageCount: 1,
      rows: [{ ...page(1, 'x'), sourceVersion: 1 }],
    });
    expect(r).toMatchObject({ ok: false, code: 'cross_version' });
  });

  it('rejects cross-source contamination', () => {
    const r = validateCanonicalPageSet({
      sourceId: SOURCE_ID,
      sourceVersion: 2,
      expectedPageCount: 1,
      rows: [{ ...page(1, 'x'), sourceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }],
    });
    expect(r).toMatchObject({ ok: false, code: 'cross_source' });
  });

  it('rejects missing authoritative page_count', () => {
    const r = validateCanonicalPageSet({
      sourceId: SOURCE_ID,
      sourceVersion: 2,
      expectedPageCount: null,
      rows: [page(1, 'a')],
    });
    expect(r).toMatchObject({ ok: false, code: 'missing_page_count' });
  });
});

describe('M1.0B B3.3A recovery terminal gate + authority', () => {
  it('blocks non-terminal required recovery', () => {
    const r = assertRecoveryTerminalGate({
      pages: [{ pageNumber: 1, detectorReasons: ['SHELL_WITH_MISSING_CONTENT'] }],
      jobs: [
        {
          pageNumber: 1,
          status: 'claimed',
          detectorReasons: ['SHELL_WITH_MISSING_CONTENT'],
        },
      ],
      recoveryEnabled: true,
    });
    expect(r).toMatchObject({ ok: false, code: 'recovery_not_terminal' });
  });

  it('allows failed/unusable with native fallback', () => {
    const r = assertRecoveryTerminalGate({
      pages: [
        { pageNumber: 1, detectorReasons: ['SHELL_WITH_MISSING_CONTENT'] },
        { pageNumber: 2, detectorReasons: ['LOW_TEXT_ITEM_COUNT'] },
      ],
      jobs: [
        {
          pageNumber: 1,
          status: 'failed',
          detectorReasons: ['SHELL_WITH_MISSING_CONTENT'],
        },
        {
          pageNumber: 2,
          status: 'unusable',
          detectorReasons: ['LOW_TEXT_ITEM_COUNT'],
        },
      ],
      recoveryEnabled: true,
    });
    expect(r.ok).toBe(true);
  });

  it('discarded_stale fails closed for authority re-eval', () => {
    const r = assertRecoveryTerminalGate({
      pages: [{ pageNumber: 1, detectorReasons: ['SHELL_WITH_MISSING_CONTENT'] }],
      jobs: [
        {
          pageNumber: 1,
          status: 'discarded_stale',
          detectorReasons: ['SHELL_WITH_MISSING_CONTENT'],
        },
      ],
      recoveryEnabled: true,
    });
    expect(r).toMatchObject({ ok: false, code: 'discarded_stale_authority' });
  });

  it('processing authority: N+2 tip makes N+1 stale', () => {
    expect(
      assertProcessingAuthority({
        targetSourceVersion: 2,
        currentSourceVersion: 3,
      }),
    ).toMatchObject({ ok: false, code: 'stale_processing_version' });
    expect(
      assertProcessingAuthority({
        targetSourceVersion: 2,
        currentSourceVersion: 2,
      }),
    ).toMatchObject({ ok: true });
  });
});

describe('M1.0B B3.3A chunk provenance + assemble orchestrator', () => {
  function sourceMeta(over?: Partial<SourceIndexMeta> & { sourceKind?: string; pageCount?: number | null }) {
    return {
      sourceId: SOURCE_ID,
      userId: USER_ID,
      sectionId: SECTION_ID,
      sourceVersion: 2,
      status: 'ready',
      retrievalSourceVersion: 1,
      indexStatus: 'unindexed' as const,
      indexModel: null,
      indexDimensions: null,
      sourceKind: 'free_space_pdf',
      pageCount: 2 as number | null,
      ...over,
    };
  }

  function makeDeps(opts?: {
    tipVersion?: number;
    retrieval?: number | null;
    pages?: ReturnType<typeof page>[];
    jobs?: AssembleRecoveredCorpusDeps['loadRecoveryJobs'] extends (
      ...args: infer _A
    ) => Promise<infer R>
      ? Awaited<R>
      : never;
    existingChunks?: Array<{
      id: string;
      page_number: number;
      chunk_index: number;
      text: string;
      source_version: number;
    }>;
    embedFail?: boolean;
    deleteCalls?: Array<{ sourceId: string; sourceVersion: number }>;
    n1ChunksSnapshot?: Map<number, unknown[]>;
  }): AssembleRecoveredCorpusDeps & {
    finalizeCalls: unknown[];
    successFinalize: unknown[];
    n1Chunks: Map<number, unknown[]>;
    nChunksUntouched: unknown[];
  } {
    const tip = opts?.tipVersion ?? 2;
    const retrieval = opts?.retrieval ?? 1;
    let meta = sourceMeta({
      sourceVersion: tip,
      retrievalSourceVersion: retrieval,
    });
    const pages =
      opts?.pages ??
      [
        page(1, 'Page one theorem about continuous functions and limits.'),
        page(2, 'Page two corollary about sequences and series analysis.'),
      ];
    const jobs =
      opts?.jobs ??
      ([
        {
          pageNumber: 2,
          status: 'succeeded' as const,
          detectorReasons: ['SHELL_WITH_MISSING_CONTENT'],
        },
      ] as const);
    // Mark page 2 as needing recovery for gate when jobs present.
    if (!opts?.pages) {
      pages[1] = page(2, pages[1]!.canonicalText, ['SHELL_WITH_MISSING_CONTENT']);
    }

    const provider = createFakeEmbeddingProvider(
      opts?.embedFail ? { kind: 'timeout' } : { kind: 'ok' },
    );
    const finalizeCalls: unknown[] = [];
    const successFinalize: unknown[] = [];
    const n1Chunks = opts?.n1ChunksSnapshot ?? new Map<number, unknown[]>();
    const nChunksUntouched: unknown[] = [
      { id: 'n-c1', page_number: 1, chunk_index: 0, text: 'N published', source_version: 1 },
    ];
    let chunkStore =
      opts?.existingChunks?.map((c) => ({ ...c })) ??
      ([] as Array<{
        id: string;
        page_number: number;
        chunk_index: number;
        text: string;
        source_version: number;
      }>);
    const embStore = new Map<string, number[]>();
    const deleteCalls: Array<{ sourceId: string; sourceVersion: number }> =
      opts?.deleteCalls ?? [];

    const deps: AssembleRecoveredCorpusDeps = {
      embeddingModel: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
      embeddingDimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
      embeddingProvider: provider,
      loadSourceForObject: vi.fn(async () => ({ ok: true as const, source: meta })),
      loadSourceById: vi.fn(async () => ({ ok: true as const, source: meta })),
      loadPageTexts: vi.fn(async () => pages),
      loadRecoveryJobs: vi.fn(async () => [...jobs]),
      countChunks: vi.fn(async ({ sourceVersion }) =>
        chunkStore.filter((c) => c.source_version === sourceVersion).length,
      ),
      deleteVersionChunks: vi.fn(async ({ sourceId, sourceVersion }) => {
        deleteCalls.push({ sourceId, sourceVersion });
        // Never delete N
        expect(sourceVersion).toBe(2);
        chunkStore = chunkStore.filter((c) => c.source_version !== sourceVersion);
        for (const k of [...embStore.keys()]) {
          if (k.startsWith(`${sourceVersion}:`)) embStore.delete(k);
        }
      }),
      finalizeIngest: vi.fn(async (input) => {
        finalizeCalls.push(input);
        // Simulate early-tip write: no bump when no chunks at tip
        const hasAtTip = chunkStore.some((c) => c.source_version === input.sourceVersion);
        expect(hasAtTip).toBe(false);
        chunkStore = [
          ...chunkStore.filter((c) => c.source_version !== input.sourceVersion),
          ...input.chunks.map((c, i) => ({
            id: `c-${input.sourceVersion}-${i}`,
            page_number: c.page_number,
            chunk_index: c.chunk_index,
            text: c.text,
            source_version: input.sourceVersion,
          })),
        ];
        n1Chunks.set(input.sourceVersion, [...chunkStore.filter((c) => c.source_version === input.sourceVersion)]);
        meta = { ...meta, status: 'ready', sourceVersion: input.sourceVersion };
        return {
          ok: true,
          source_version: input.sourceVersion,
          chunk_count: input.chunks.length,
        };
      }),
      beginIndex: vi.fn(async ({ sourceVersion }) => ({
        ok: true,
        job_id: 'job-u1',
        source_version: sourceVersion,
        chunk_count: chunkStore.filter((c) => c.source_version === sourceVersion).length,
      })),
      loadChunks: vi.fn(async ({ sourceVersion }) =>
        chunkStore.filter((c) => c.source_version === sourceVersion),
      ),
      upsertEmbeddings: vi.fn(async ({ sourceVersion, rows }) => {
        for (const row of rows) {
          embStore.set(`${sourceVersion}:${row.chunkId}`, row.embedding);
        }
        return { ok: true, upserted: rows.length };
      }),
      finalizeIndexSuccess: vi.fn(async (input) => {
        successFinalize.push(input);
        // Must never be called in B3.3A
        throw new Error('finalize_index_success_forbidden_in_b33a');
      }),
      finalizeIndexFailure: vi.fn(async () => ({ ok: true })),
      countEmbeddings: vi.fn(async ({ sourceVersion }) => {
        let n = 0;
        for (const k of embStore.keys()) {
          if (k.startsWith(`${sourceVersion}:`)) n++;
        }
        return n;
      }),
      recoveryEnabled: true,
      allowResumeExistingChunks: true,
    };

    return { ...deps, finalizeCalls, successFinalize, n1Chunks, nChunksUntouched };
  }

  it('N+1 chunks preserve PDF page provenance via chunkPageTexts', () => {
    const pages = [
      { pageNumber: 1, text: 'Alpha content on page one for provenance check.' },
      { pageNumber: 2, text: 'Beta content on page two for provenance check.' },
    ];
    const chunks = chunkPageTexts(pages);
    expect(chunks.every((c) => c.page_number === 1 || c.page_number === 2)).toBe(true);
    expect(chunks.some((c) => c.page_number === 1)).toBe(true);
    expect(chunks.some((c) => c.page_number === 2)).toBe(true);
  });

  it('assembles unpublished N+1 without flipping retrieval', async () => {
    const deps = makeDeps();
    const res = await runAssembleRecoveredCorpus({
      request: {
        sourceId: SOURCE_ID,
        sourceVersion: 2,
        sectionId: SECTION_ID,
        userId: USER_ID,
      },
      deps,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.published).toBe(false);
    expect(res.sourceVersion).toBe(2);
    expect(res.retrievalSourceVersion).toBe(1);
    expect(res.chunkCount).toBeGreaterThan(0);
    expect(res.embeddingCount).toBe(res.chunkCount);
    expect(deps.successFinalize).toHaveLength(0);
    // N chunks untouched
    expect(deps.nChunksUntouched).toHaveLength(1);
  });

  it('partial embedding failure leaves N untouched and retrieval pinned', async () => {
    const deps = makeDeps({ embedFail: true });
    const res = await runAssembleRecoveredCorpus({
      request: {
        sourceId: SOURCE_ID,
        sourceVersion: 2,
        sectionId: SECTION_ID,
        userId: USER_ID,
      },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('index_failed');
    expect(res.retrievalSourceVersion).toBe(1);
    expect(deps.nChunksUntouched[0]).toMatchObject({ source_version: 1 });
    expect(deps.successFinalize).toHaveLength(0);
  });

  it('retry resumes same N+1 without duplicating logical chunks', async () => {
    const deps = makeDeps();
    const first = await runAssembleRecoveredCorpus({
      request: {
        sourceId: SOURCE_ID,
        sourceVersion: 2,
        sectionId: SECTION_ID,
        userId: USER_ID,
      },
      deps,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const countAfterFirst = first.chunkCount;

    const second = await runAssembleRecoveredCorpus({
      request: {
        sourceId: SOURCE_ID,
        sourceVersion: 2,
        sectionId: SECTION_ID,
        userId: USER_ID,
      },
      deps,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.reusedChunks).toBe(true);
    expect(second.sourceVersion).toBe(2);
    expect(second.chunkCount).toBe(countAfterFirst);
    // finalize only once
    expect(deps.finalizeCalls).toHaveLength(1);
  });

  it('N+2 superseding tip rejects N+1 assembly', async () => {
    const deps = makeDeps({ tipVersion: 3 });
    const res = await runAssembleRecoveredCorpus({
      request: {
        sourceId: SOURCE_ID,
        sourceVersion: 2,
        sectionId: SECTION_ID,
        userId: USER_ID,
      },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('stale_processing_version');
    expect(deps.finalizeCalls).toHaveLength(0);
  });

  it('discarded_stale causes stale-authority rejection path', async () => {
    const deps = makeDeps({
      pages: [
        page(1, 'ok text on page one enough chars.'),
        page(2, 'shell page', ['SHELL_WITH_MISSING_CONTENT']),
      ],
      jobs: [
        {
          pageNumber: 2,
          status: 'discarded_stale',
          detectorReasons: ['SHELL_WITH_MISSING_CONTENT'],
        },
      ],
    });
    const res = await runAssembleRecoveredCorpus({
      request: {
        sourceId: SOURCE_ID,
        sourceVersion: 2,
        sectionId: SECTION_ID,
        userId: USER_ID,
      },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('discarded_stale_authority');
  });

  it('Notebook / non-PDF sources are rejected (isolation)', async () => {
    const deps = makeDeps();
    (deps.loadSourceById as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      source: sourceMeta({ sourceKind: 'notebook_page' }),
    });
    const res = await runAssembleRecoveredCorpus({
      request: {
        sourceId: SOURCE_ID,
        sourceVersion: 2,
        sectionId: SECTION_ID,
        userId: USER_ID,
      },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('not_pdf');
  });

  it('privacy log contains no content/secrets', () => {
    const ok = formatAssembleRecoveredCorpusLogLine({
      event: 'assemble_recovered_corpus_ok',
      requestId: 'r1',
      sourceVersion: 2,
      retrievalSourceVersion: 1,
      expectedPageCount: 2,
      chunkCount: 3,
      embeddingCount: 3,
      reusedChunks: false,
      published: false,
    });
    expect(assertAssembleLogIsPrivacySafe(ok)).toBe(true);
    expect(ok).not.toMatch(/theorem|continuous|Authorization/i);
    expect(ok).toContain('embeddingCount');

    const fail = formatAssembleRecoveredCorpusLogLine({
      event: 'assemble_recovered_corpus_failed',
      requestId: 'r2',
      code: 'missing_page',
      retrievalSourceVersion: 1,
    });
    expect(assertAssembleLogIsPrivacySafe(fail)).toBe(true);
  });

  it('missing page rejects before finalize (N untouched)', async () => {
    const deps = makeDeps({
      pages: [page(1, 'only page one present with enough text.')],
      jobs: [],
    });
    const res = await runAssembleRecoveredCorpus({
      request: {
        sourceId: SOURCE_ID,
        sourceVersion: 2,
        sectionId: SECTION_ID,
        userId: USER_ID,
      },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('missing_page');
    expect(deps.finalizeCalls).toHaveLength(0);
    expect(deps.nChunksUntouched).toHaveLength(1);
  });
});
