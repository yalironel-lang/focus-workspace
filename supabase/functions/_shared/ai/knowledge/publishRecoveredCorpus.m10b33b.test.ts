/**
 * @vitest-environment node
 *
 * M1.0B B3.3B — atomic publication (unit + schema contract).
 * No Production. No remote by default.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  assertPublishLogIsPrivacySafe,
  formatPublishRecoveredCorpusLogLine,
} from './privacyLogPublish.ts';
import {
  runPublishRecoveredCorpus,
  type PublishRecoveredCorpusDeps,
} from './runPublishRecoveredCorpus.ts';

const SOURCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type SimSource = {
  sourceKind: string;
  sourceVersion: number;
  retrievalSourceVersion: number | null;
  status: string;
  pageCount: number | null;
};

type SimPage = { pageNumber: number; detectorReasons: string[] };
type SimJob = { pageNumber: number; status: string };
type SimIndex = {
  status: string;
  embeddingModel: string;
  embeddingDimensions: number;
};
type SimState = {
  source: SimSource;
  pages: SimPage[];
  jobs: SimJob[];
  index: SimIndex | null;
  chunkCount: number;
  embedCount: number;
  nChunksPreserved: number;
};

/**
 * Soft transactional model mirroring 019 publish RPC (for unit concurrency).
 */
function simPublish(
  state: SimState,
  expected: number,
): { ok: true; already: boolean; state: SimState } | { ok: false; code: string; state: SimState } {
  const s = { ...state, source: { ...state.source } };
  if (s.source.sourceKind !== 'free_space_pdf') {
    return { ok: false, code: 'not_pdf', state: s };
  }
  if (s.source.retrievalSourceVersion === expected) {
    if (!s.index || s.index.status !== 'indexed') {
      return { ok: false, code: 'incomplete_index', state: s };
    }
    if (s.chunkCount < 1 || s.embedCount !== s.chunkCount) {
      return { ok: false, code: 'incomplete_embeddings', state: s };
    }
    return { ok: true, already: true, state: s };
  }
  if (
    s.source.retrievalSourceVersion != null &&
    s.source.retrievalSourceVersion > expected
  ) {
    return { ok: false, code: 'stale_processing_version', state: s };
  }
  if (s.source.sourceVersion !== expected) {
    return { ok: false, code: 'stale_processing_version', state: s };
  }
  if (s.source.status !== 'ready') {
    return { ok: false, code: 'not_ready', state: s };
  }
  const P = s.source.pageCount;
  if (P == null || P < 1) return { ok: false, code: 'missing_page_count', state: s };
  if (s.pages.length !== P) return { ok: false, code: 'missing_page', state: s };
  const nums = new Set(s.pages.map((p) => p.pageNumber));
  if (nums.size !== P) return { ok: false, code: 'duplicate_page', state: s };
  for (let i = 1; i <= P; i++) {
    if (!nums.has(i)) return { ok: false, code: 'missing_page', state: s };
  }
  if (s.jobs.some((j) => j.status === 'discarded_stale')) {
    return { ok: false, code: 'discarded_stale_authority', state: s };
  }
  if (s.jobs.some((j) => !['succeeded', 'unusable', 'failed'].includes(j.status))) {
    return { ok: false, code: 'recovery_not_terminal', state: s };
  }
  for (const page of s.pages) {
    const needs = page.detectorReasons.some(
      (r) => r === 'SHELL_WITH_MISSING_CONTENT' || r === 'LOW_TEXT_ITEM_COUNT',
    );
    if (needs && !s.jobs.some((j) => j.pageNumber === page.pageNumber)) {
      return { ok: false, code: 'missing_required_job', state: s };
    }
  }
  if (!s.index || s.index.status === 'index_failed' || s.index.status === 'unindexed') {
    return { ok: false, code: 'incomplete_index', state: s };
  }
  if (s.chunkCount < 1 || s.embedCount !== s.chunkCount) {
    return { ok: false, code: 'incomplete_embeddings', state: s };
  }
  s.index = { ...s.index, status: 'indexed' };
  s.source.retrievalSourceVersion = expected;
  return { ok: true, already: false, state: s };
}

function baseReady(): SimState {
  return {
    source: {
      sourceKind: 'free_space_pdf',
      sourceVersion: 2,
      retrievalSourceVersion: 1,
      status: 'ready',
      pageCount: 2,
    },
    pages: [
      { pageNumber: 1, detectorReasons: [] },
      { pageNumber: 2, detectorReasons: ['SHELL_WITH_MISSING_CONTENT'] },
    ],
    jobs: [{ pageNumber: 2, status: 'succeeded' }],
    index: {
      status: 'indexing',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
    },
    chunkCount: 3,
    embedCount: 3,
    nChunksPreserved: 2,
  };
}

describe('M1.0B B3.3B schema contract', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/019_ai_knowledge_publish_recovered_corpus.sql'),
    'utf8',
  );

  it('defines dedicated publish RPC (does not alter finalize_index_success)', () => {
    expect(sql).toContain('ai_knowledge_publish_recovered_corpus');
    expect(sql).toContain("source_kind is distinct from 'free_space_pdf'");
    expect(sql).toContain('for update');
    expect(sql).toContain("retrieval_source_version = p_expected_source_version");
    expect(sql).toContain("status = 'indexed'");
    expect(sql).toContain('already_published');
    expect(sql).toContain('stale_processing_version');
    expect(sql).toContain('recovery_not_terminal');
    expect(sql).toContain('missing_page');
    expect(sql).not.toMatch(/create or replace function public\.ai_knowledge_finalize_index_success/i);
    expect(sql).not.toMatch(/delete from public\.ai_knowledge_chunks/i);
  });
});

describe('M1.0B B3.3B transactional publish model', () => {
  it('publishes N→N+1 atomically and retains N chunks', () => {
    const before = baseReady();
    const r = simPublish(before, 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.already).toBe(false);
    expect(r.state.source.retrievalSourceVersion).toBe(2);
    expect(r.state.index?.status).toBe('indexed');
    expect(r.state.nChunksPreserved).toBe(2);
  });

  it('idempotent already-published retry', () => {
    let s = baseReady();
    const first = simPublish(s, 2);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    s = first.state;
    const second = simPublish(s, 2);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.already).toBe(true);
    expect(second.state.source.retrievalSourceVersion).toBe(2);
  });

  it('rejects missing page / non-terminal recovery / incomplete embeddings', () => {
    expect(simPublish({ ...baseReady(), pages: [{ pageNumber: 1, detectorReasons: [] }] }, 2)).toMatchObject({
      ok: false,
      code: 'missing_page',
    });
    expect(
      simPublish(
        {
          ...baseReady(),
          jobs: [{ pageNumber: 2, status: 'queued' }],
        },
        2,
      ),
    ).toMatchObject({ ok: false, code: 'recovery_not_terminal' });
    expect(simPublish({ ...baseReady(), embedCount: 1 }, 2)).toMatchObject({
      ok: false,
      code: 'incomplete_embeddings',
    });
  });

  it('rejects stale N+1 when tip is N+2; never moves pointer backward', () => {
    const superseded = baseReady();
    superseded.source.sourceVersion = 3;
    expect(simPublish(superseded, 2)).toMatchObject({
      ok: false,
      code: 'stale_processing_version',
    });

    const published = simPublish(baseReady(), 2);
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    // Attempt to "publish" older version while retrieval already at 2
    const back = {
      ...published.state,
      source: {
        ...published.state.source,
        sourceVersion: 2,
        retrievalSourceVersion: 2,
      },
    };
    // Idempotent at 2 is ok; publishing would not go to 1 because we only set to expected.
    const stay = simPublish(back, 2);
    expect(stay.ok).toBe(true);
    if (!stay.ok) return;
    expect(stay.state.source.retrievalSourceVersion).toBe(2);

    const newerRetrieval = {
      ...published.state,
      source: {
        ...published.state.source,
        sourceVersion: 3,
        retrievalSourceVersion: 3,
      },
    };
    expect(simPublish(newerRetrieval, 2)).toMatchObject({
      ok: false,
      code: 'stale_processing_version',
    });
  });

  it('concurrent: only one tip-matching publish wins mental model', () => {
    const a = baseReady();
    const b = {
      ...baseReady(),
      source: { ...baseReady().source, sourceVersion: 3 },
    };
    const pubA = simPublish(a, 2);
    const pubB = simPublish(b, 2);
    expect(pubA.ok).toBe(true);
    expect(pubB.ok).toBe(false);
    if (!pubB.ok) expect(pubB.code).toBe('stale_processing_version');
  });

  it('rejects notebook kind', () => {
    const nb = baseReady();
    nb.source.sourceKind = 'notebook_page';
    expect(simPublish(nb, 2)).toMatchObject({ ok: false, code: 'not_pdf' });
  });
});

describe('M1.0B B3.3B runPublishRecoveredCorpus orchestrator', () => {
  function makeDeps(
    rpcImpl: PublishRecoveredCorpusDeps['publishRecoveredCorpus'],
    opts?: { sourceKind?: string },
  ): PublishRecoveredCorpusDeps & {
    logs: string[];
    publishSpy: ReturnType<typeof vi.fn>;
  } {
    const logs: string[] = [];
    const publishSpy = vi.fn(rpcImpl);
    return {
      logs,
      publishSpy,
      loadSourceById: vi.fn(async () => ({
        ok: true as const,
        source: {
          sourceId: SOURCE_ID,
          userId: USER_ID,
          sectionId: SECTION_ID,
          sourceKind: opts?.sourceKind ?? 'free_space_pdf',
          sourceVersion: 2,
          retrievalSourceVersion: 1,
        },
      })),
      publishRecoveredCorpus: publishSpy,
      requestId: 't1',
      onLog: (line) => logs.push(line),
    };
  }

  it('success path maps RPC result', async () => {
    const deps = makeDeps(async () => ({
      ok: true,
      already_published: false,
      source_version: 2,
      retrieval_source_version: 2,
      previous_retrieval_source_version: 1,
      chunk_count: 4,
      page_count: 2,
    }));
    const res = await runPublishRecoveredCorpus({
      request: {
        sourceId: SOURCE_ID,
        expectedSourceVersion: 2,
        sectionId: SECTION_ID,
        userId: USER_ID,
      },
      deps,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.retrievalSourceVersion).toBe(2);
    expect(res.previousRetrievalSourceVersion).toBe(1);
    expect(res.alreadyPublished).toBe(false);
    expect(deps.logs.every((l) => assertPublishLogIsPrivacySafe(l))).toBe(true);
  });

  it('maps rejection codes and leaves privacy-safe logs', async () => {
    const deps = makeDeps(async () => ({
      ok: false,
      code: 'recovery_not_terminal',
    }));
    const res = await runPublishRecoveredCorpus({
      request: {
        sourceId: SOURCE_ID,
        expectedSourceVersion: 2,
        sectionId: SECTION_ID,
        userId: USER_ID,
      },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('recovery_not_terminal');
    expect(deps.logs.every((l) => assertPublishLogIsPrivacySafe(l))).toBe(true);
  });

  it('rejects notebook before RPC', async () => {
    const deps = makeDeps(
      async () => ({ ok: true, source_version: 1, retrieval_source_version: 1 }),
      { sourceKind: 'notebook_page' },
    );
    const res = await runPublishRecoveredCorpus({
      request: {
        sourceId: SOURCE_ID,
        expectedSourceVersion: 1,
        sectionId: SECTION_ID,
        userId: USER_ID,
      },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('not_pdf');
    expect(deps.publishSpy).not.toHaveBeenCalled();
  });

  it('privacy formatter never embeds content keys', () => {
    const line = formatPublishRecoveredCorpusLogLine({
      event: 'publish_recovered_corpus_ok',
      requestId: 'r',
      sourceVersion: 2,
      retrievalSourceVersion: 2,
      previousRetrievalSourceVersion: 1,
      alreadyPublished: false,
      chunkCount: 3,
    });
    expect(assertPublishLogIsPrivacySafe(line)).toBe(true);
    expect(line).not.toMatch(/theorem|OCR|embedding\[/i);
  });
});
