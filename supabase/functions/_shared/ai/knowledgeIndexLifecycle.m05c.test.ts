/**
 * M0.5C Phase 1 — Version / retrieval lifecycle model (pure unit tests).
 *
 * Proves the state machine before relying on migration 012 SQL:
 * CURRENT TEXT VERSION (source_version) ≠ CURRENT RETRIEVAL VERSION
 * (retrieval_source_version) during re-index.
 *
 * No Postgres. No provider. No remote.
 */

import { describe, expect, it } from 'vitest';

type IndexStatus = 'unindexed' | 'indexing' | 'indexed' | 'index_failed';

type VersionIndex = {
  sourceVersion: number;
  status: IndexStatus;
  jobId: string | null;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
  errorCode: string | null;
};

type SourceState = {
  sourceVersion: number;
  retrievalSourceVersion: number | null;
  textStatus: 'ready';
  versions: Map<number, VersionIndex>;
  chunksByVersion: Map<number, number>; // version → chunk count
  embeddingsByVersion: Map<string, number>; // `${version}:${model}:1536` → count
};

const MODEL = 'text-embedding-3-small';
const DIMS = 1536;

function newSource(): SourceState {
  return {
    sourceVersion: 0,
    retrievalSourceVersion: null,
    textStatus: 'ready',
    versions: new Map(),
    chunksByVersion: new Map(),
    embeddingsByVersion: new Map(),
  };
}

function finalizeText(state: SourceState, chunkCount: number): SourceState {
  const next =
    state.chunksByVersion.size === 0 ? Math.max(state.sourceVersion, 1) : state.sourceVersion + 1;
  const versions = new Map(state.versions);
  versions.set(next, {
    sourceVersion: next,
    status: 'unindexed',
    jobId: null,
    embeddingModel: null,
    embeddingDimensions: null,
    errorCode: null,
  });
  const chunksByVersion = new Map(state.chunksByVersion);
  chunksByVersion.set(next, chunkCount);
  return {
    ...state,
    sourceVersion: next,
    // retrieval pointer unchanged on text finalize
    retrievalSourceVersion: state.retrievalSourceVersion,
    versions,
    chunksByVersion,
  };
}

function beginIndex(
  state: SourceState,
  version: number,
  jobId: string,
): { ok: true; state: SourceState } | { ok: false; code: 'stale_job' | 'invalid_request' } {
  if (version !== state.sourceVersion) return { ok: false, code: 'stale_job' };
  if ((state.chunksByVersion.get(version) ?? 0) < 1) return { ok: false, code: 'invalid_request' };
  const versions = new Map(state.versions);
  versions.set(version, {
    sourceVersion: version,
    status: 'indexing',
    jobId,
    embeddingModel: MODEL,
    embeddingDimensions: DIMS,
    errorCode: null,
  });
  return { ok: true, state: { ...state, versions } };
}

function writeEmbeddings(state: SourceState, version: number, count: number): SourceState {
  const embeddingsByVersion = new Map(state.embeddingsByVersion);
  embeddingsByVersion.set(`${version}:${MODEL}:${DIMS}`, count);
  return { ...state, embeddingsByVersion };
}

function finalizeIndexSuccess(
  state: SourceState,
  version: number,
  jobId: string,
):
  | { ok: true; state: SourceState; previousRetrieval: number | null }
  | { ok: false; code: 'stale_job' | 'incomplete_embeddings' } {
  if (version !== state.sourceVersion) return { ok: false, code: 'stale_job' };
  const idx = state.versions.get(version);
  if (!idx || idx.status !== 'indexing' || idx.jobId !== jobId) {
    return { ok: false, code: 'stale_job' };
  }
  const need = state.chunksByVersion.get(version) ?? 0;
  const have = state.embeddingsByVersion.get(`${version}:${MODEL}:${DIMS}`) ?? 0;
  if (need < 1 || have !== need) return { ok: false, code: 'incomplete_embeddings' };

  const versions = new Map(state.versions);
  versions.set(version, { ...idx, status: 'indexed', errorCode: null });
  const previousRetrieval = state.retrievalSourceVersion;
  return {
    ok: true,
    previousRetrieval,
    state: {
      ...state,
      versions,
      retrievalSourceVersion: version, // atomic flip only
    },
  };
}

function finalizeIndexFailure(
  state: SourceState,
  version: number,
  jobId: string,
): { state: SourceState; ignored: boolean } {
  const idx = state.versions.get(version);
  if (
    version !== state.sourceVersion ||
    !idx ||
    idx.status !== 'indexing' ||
    idx.jobId !== jobId
  ) {
    return { state, ignored: true };
  }
  const versions = new Map(state.versions);
  versions.set(version, {
    ...idx,
    status: 'index_failed',
    errorCode: 'provider_unavailable',
  });
  return {
    ignored: false,
    state: {
      ...state,
      versions,
      // retrieval unchanged
      retrievalSourceVersion: state.retrievalSourceVersion,
    },
  };
}

function gcEligibleVersions(state: SourceState): number[] {
  const keep = new Set<number>();
  keep.add(state.sourceVersion);
  if (state.retrievalSourceVersion != null) keep.add(state.retrievalSourceVersion);
  return [...state.chunksByVersion.keys()].filter((v) => !keep.has(v));
}

describe('M0.5C version lifecycle model A–G', () => {
  it('A. v1 READY text, no vectors, retrieval null', () => {
    let s = newSource();
    s = finalizeText(s, 8);
    expect(s.sourceVersion).toBe(1);
    expect(s.retrievalSourceVersion).toBeNull();
    expect(s.versions.get(1)?.status).toBe('unindexed');
  });

  it('B. v1 indexed → retrieval_source_version = 1', () => {
    let s = finalizeText(newSource(), 8);
    const begin = beginIndex(s, 1, 'job-1');
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    s = writeEmbeddings(begin.state, 1, 8);
    const fin = finalizeIndexSuccess(s, 1, 'job-1');
    expect(fin.ok).toBe(true);
    if (!fin.ok) return;
    expect(fin.state.retrievalSourceVersion).toBe(1);
    expect(fin.state.versions.get(1)?.status).toBe('indexed');
  });

  it('C. v2 text succeeds while v1 remains retrieval-active', () => {
    let s = finalizeText(newSource(), 8);
    let b = beginIndex(s, 1, 'job-1');
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    s = writeEmbeddings(b.state, 1, 8);
    const ok1 = finalizeIndexSuccess(s, 1, 'job-1');
    expect(ok1.ok).toBe(true);
    if (!ok1.ok) return;
    s = finalizeText(ok1.state, 5);
    expect(s.sourceVersion).toBe(2);
    expect(s.retrievalSourceVersion).toBe(1);
    expect(s.versions.get(2)?.status).toBe('unindexed');
    expect(s.chunksByVersion.get(1)).toBe(8);
    expect(s.chunksByVersion.get(2)).toBe(5);
  });

  it('D. v2 indexing fails → v1 stays retrieval-active; v2 retryable', () => {
    let s = finalizeText(newSource(), 8);
    let b = beginIndex(s, 1, 'job-1');
    if (!b.ok) throw new Error('begin v1');
    s = writeEmbeddings(b.state, 1, 8);
    const ok1 = finalizeIndexSuccess(s, 1, 'job-1');
    if (!ok1.ok) throw new Error('index v1');
    s = finalizeText(ok1.state, 5);
    b = beginIndex(s, 2, 'job-2');
    if (!b.ok) throw new Error('begin v2');
    const fail = finalizeIndexFailure(b.state, 2, 'job-2');
    expect(fail.ignored).toBe(false);
    expect(fail.state.retrievalSourceVersion).toBe(1);
    expect(fail.state.sourceVersion).toBe(2);
    expect(fail.state.versions.get(2)?.status).toBe('index_failed');
    // retry begin still allowed
    const retry = beginIndex(fail.state, 2, 'job-2b');
    expect(retry.ok).toBe(true);
  });

  it('E. v2 index success atomically flips retrieval 1→2; GC eligible after flip', () => {
    let s = finalizeText(newSource(), 8);
    let b = beginIndex(s, 1, 'job-1');
    if (!b.ok) throw new Error('begin v1');
    s = writeEmbeddings(b.state, 1, 8);
    const ok1 = finalizeIndexSuccess(s, 1, 'job-1');
    if (!ok1.ok) throw new Error('index v1');
    s = finalizeText(ok1.state, 5);
    b = beginIndex(s, 2, 'job-2');
    if (!b.ok) throw new Error('begin v2');
    s = writeEmbeddings(b.state, 2, 5);
    const ok2 = finalizeIndexSuccess(s, 2, 'job-2');
    expect(ok2.ok).toBe(true);
    if (!ok2.ok) return;
    expect(ok2.previousRetrieval).toBe(1);
    expect(ok2.state.retrievalSourceVersion).toBe(2);
    expect(gcEligibleVersions(ok2.state)).toEqual([1]);
    // Flip does not itself delete — GC is separate
    expect(ok2.state.chunksByVersion.has(1)).toBe(true);
  });

  it('F. cascade model: deleting source clears all version maps (documented)', () => {
    // Represented as emptying maps when source deleted — FK ON DELETE CASCADE in SQL.
    let s = finalizeText(newSource(), 8);
    s = {
      ...s,
      versions: new Map(),
      chunksByVersion: new Map(),
      embeddingsByVersion: new Map(),
      retrievalSourceVersion: null,
      sourceVersion: 0,
    };
    expect(s.chunksByVersion.size).toBe(0);
    expect(s.versions.size).toBe(0);
  });

  it('G. first-ever indexing failure → text READY, retrieval remains null', () => {
    let s = finalizeText(newSource(), 8);
    const b = beginIndex(s, 1, 'job-1');
    if (!b.ok) throw new Error('begin');
    const fail = finalizeIndexFailure(b.state, 1, 'job-1');
    expect(fail.state.retrievalSourceVersion).toBeNull();
    expect(fail.state.sourceVersion).toBe(1);
    expect(fail.state.versions.get(1)?.status).toBe('index_failed');
  });

  it('stale job cannot flip after source advances to v3', () => {
    let s = finalizeText(newSource(), 8);
    let b = beginIndex(s, 1, 'job-1');
    if (!b.ok) throw new Error('begin v1');
    s = writeEmbeddings(b.state, 1, 8);
    const ok1 = finalizeIndexSuccess(s, 1, 'job-1');
    if (!ok1.ok) throw new Error('index v1');
    s = finalizeText(ok1.state, 5);
    b = beginIndex(s, 2, 'job-2');
    if (!b.ok) throw new Error('begin v2');
    // Source advances to v3 before job-2 completes
    s = finalizeText(b.state, 3);
    expect(s.sourceVersion).toBe(3);
    const stale = finalizeIndexSuccess(s, 2, 'job-2');
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.code).toBe('stale_job');
    expect(s.retrievalSourceVersion).toBe(1);
  });
});
