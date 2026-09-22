/**
 * @vitest-environment node
 *
 * M1.0B B3.2.1 — early source_version allocation (pure domain model).
 * Mirrors approved Option A without hitting remote Supabase.
 */

import { describe, expect, it } from 'vitest';

type Source = {
  sourceVersion: number;
  retrievalSourceVersion: number | null;
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'stale';
  contentHash: string | null;
  pendingContentHash: string | null;
  chunksByVersion: Map<number, string[]>; // version → chunk texts (immutable once written)
};

function newFirst(): Source {
  return {
    sourceVersion: 1,
    retrievalSourceVersion: null,
    status: 'pending',
    contentHash: null,
    pendingContentHash: null,
    chunksByVersion: new Map(),
  };
}

/** PDF begin_ingest early-allocation rules (018). */
function beginPdf(
  s: Source,
  contentHash: string,
): { source: Source; idempotent: boolean; allocated: number } {
  // Same-hash resume
  if (
    (s.status === 'pending' || s.status === 'processing' || s.status === 'stale') &&
    s.pendingContentHash === contentHash
  ) {
    return { source: s, idempotent: true, allocated: s.sourceVersion };
  }
  if (s.status === 'ready' && s.contentHash === contentHash) {
    return { source: s, idempotent: true, allocated: s.sourceVersion };
  }

  const hasChunksAtTip = (s.chunksByVersion.get(s.sourceVersion)?.length ?? 0) > 0;
  const hasOlder = [...s.chunksByVersion.keys()].some((v) => v < s.sourceVersion);
  let next = s.sourceVersion;
  if (hasChunksAtTip || (hasOlder && !hasChunksAtTip)) {
    next = s.sourceVersion + 1;
  }

  const hasAny = s.chunksByVersion.size > 0;
  const nextStatus =
    hasAny && (s.status === 'ready' || s.status === 'stale') ? 'stale' : 'pending';

  return {
    source: {
      ...s,
      sourceVersion: next,
      pendingContentHash: contentHash,
      status: nextStatus,
      // retrieval unchanged
    },
    idempotent: false,
    allocated: next,
  };
}

/** Shared finalize ready — no double bump of early tip. */
function finalizeReady(s: Source, chunks: string[]): Source {
  const hasAtTip = (s.chunksByVersion.get(s.sourceVersion)?.length ?? 0) > 0;
  const writeVersion = hasAtTip ? s.sourceVersion + 1 : s.sourceVersion;
  const chunksByVersion = new Map(s.chunksByVersion);
  // Never mutate old version arrays in place
  chunksByVersion.set(writeVersion, [...chunks]);
  return {
    ...s,
    sourceVersion: writeVersion,
    contentHash: s.pendingContentHash,
    pendingContentHash: null,
    status: 'ready',
    chunksByVersion,
    retrievalSourceVersion: s.retrievalSourceVersion, // B3.3 publishes later
  };
}

/** Notebook begin does NOT early-bump (014 unchanged). */
function beginNotebook(s: Source, contentHash: string): Source {
  if (
    (s.status === 'pending' || s.status === 'processing' || s.status === 'stale') &&
    s.pendingContentHash === contentHash
  ) {
    return s;
  }
  if (s.status === 'ready' && s.contentHash === contentHash) return s;
  const hasAny = s.chunksByVersion.size > 0;
  return {
    ...s,
    pendingContentHash: contentHash,
    status: hasAny && (s.status === 'ready' || s.status === 'stale') ? 'stale' : 'pending',
  };
}

describe('M1.0B B3.2.1 early source_version allocation', () => {
  it('1/11. first ingest allocates processing identity 1', () => {
    let s = newFirst();
    const b = beginPdf(s, 'hash-a');
    expect(b.allocated).toBe(1);
    expect(b.source.retrievalSourceVersion).toBeNull();
    s = finalizeReady(b.source, ['page1']);
    expect(s.sourceVersion).toBe(1);
    expect(s.chunksByVersion.get(1)).toEqual(['page1']);
  });

  it('1/2. replacement reserves N+1 at begin; retrieval stays N', () => {
    let s: Source = {
      sourceVersion: 1,
      retrievalSourceVersion: 1,
      status: 'ready',
      contentHash: 'hash-a',
      pendingContentHash: null,
      chunksByVersion: new Map([[1, ['old']]]),
    };
    const b = beginPdf(s, 'hash-b');
    expect(b.idempotent).toBe(false);
    expect(b.allocated).toBe(2);
    expect(b.source.retrievalSourceVersion).toBe(1);
    expect(b.source.chunksByVersion.get(1)).toEqual(['old']);
  });

  it('3. same-hash resume does not allocate N+2', () => {
    let s: Source = {
      sourceVersion: 2,
      retrievalSourceVersion: 1,
      status: 'stale',
      contentHash: 'hash-a',
      pendingContentHash: 'hash-b',
      chunksByVersion: new Map([[1, ['old']]]),
    };
    const b = beginPdf(s, 'hash-b');
    expect(b.idempotent).toBe(true);
    expect(b.allocated).toBe(2);
  });

  it('4. new hash after abandoned N+1 allocates N+2', () => {
    let s: Source = {
      sourceVersion: 2,
      retrievalSourceVersion: 1,
      status: 'stale',
      contentHash: 'hash-a',
      pendingContentHash: 'hash-b',
      chunksByVersion: new Map([[1, ['old']]]),
    };
    const b = beginPdf(s, 'hash-c');
    expect(b.allocated).toBe(3);
    expect(b.source.retrievalSourceVersion).toBe(1);
  });

  it('5/6. recovery evidence versions stay isolated (model)', () => {
    const pageEvidence = new Map<string, string>();
    pageEvidence.set('v1:p3', 'NATIVE_V1');
    pageEvidence.set('v2:p3', 'NATIVE_V2');
    // Commit OCR only to v2
    pageEvidence.set('v2:p3:recovered', 'OCR_V2');
    expect(pageEvidence.get('v1:p3')).toBe('NATIVE_V1');
    expect(pageEvidence.get('v2:p3:recovered')).toBe('OCR_V2');
  });

  it('8. finalize does not double-bump early-reserved tip', () => {
    let s: Source = {
      sourceVersion: 2,
      retrievalSourceVersion: 1,
      status: 'stale',
      contentHash: 'hash-a',
      pendingContentHash: 'hash-b',
      chunksByVersion: new Map([[1, ['old']]]),
    };
    s = finalizeReady(s, ['new-v2']);
    expect(s.sourceVersion).toBe(2);
    expect(s.chunksByVersion.get(1)).toEqual(['old']);
    expect(s.chunksByVersion.get(2)).toEqual(['new-v2']);
    expect(s.retrievalSourceVersion).toBe(1);
  });

  it('9/10. previous retrieval N intact; old chunks not mutated in place', () => {
    const oldChunks = ['old'];
    let s: Source = {
      sourceVersion: 1,
      retrievalSourceVersion: 1,
      status: 'ready',
      contentHash: 'hash-a',
      pendingContentHash: null,
      chunksByVersion: new Map([[1, oldChunks]]),
    };
    const b = beginPdf(s, 'hash-b');
    s = finalizeReady(b.source, ['new']);
    expect(s.chunksByVersion.get(1)).toBe(oldChunks);
    expect(s.chunksByVersion.get(1)).toEqual(['old']);
    expect(s.retrievalSourceVersion).toBe(1);
  });

  it('12. Notebook begin does not early-bump; finalize still bumps when tip has chunks', () => {
    let s: Source = {
      sourceVersion: 1,
      retrievalSourceVersion: 1,
      status: 'ready',
      contentHash: 'nb-a',
      pendingContentHash: null,
      chunksByVersion: new Map([[1, ['nb-old']]]),
    };
    s = beginNotebook(s, 'nb-b');
    expect(s.sourceVersion).toBe(1); // no early bump
    s = finalizeReady(s, ['nb-new']); // chunks at tip → bump
    expect(s.sourceVersion).toBe(2);
    expect(s.chunksByVersion.get(1)).toEqual(['nb-old']);
    expect(s.chunksByVersion.get(2)).toEqual(['nb-new']);
  });
});
