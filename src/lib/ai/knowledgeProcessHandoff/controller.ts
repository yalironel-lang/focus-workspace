/**
 * M0.7B.2 knowledge process handoff controller.
 *
 * Provides mark / drain / cancel with:
 * - single-flight per source
 * - generation-safe marker clear
 * - permanent vs retryable failure policy
 *
 * NOT wired to PDF upload lifecycle yet.
 */

import {
  requestKnowledgeProcess,
  type KnowledgeProcessClientResponse,
} from '../knowledgeProcessClient';
import { classifyKnowledgeProcessFailure } from './classifyFailure';
import {
  clearNeedsKnowledgeProcessMarker,
  getNeedsKnowledgeProcessMarker,
  listNeedsKnowledgeProcessForSection,
  markNeedsKnowledgeProcess,
  type KnowledgeNeedsProcessMarker,
} from './needsProcessStore';

export type KnowledgeProcessRequestFn = typeof requestKnowledgeProcess;

export type DrainKnowledgeProcessResult = {
  sectionId: string;
  sourceObjectId: string;
  generation: number;
  outcome:
    | 'success'
    | 'skipped_no_marker'
    | 'retained_retryable'
    | 'retained_auth'
    | 'retained_stale'
    | 'cleared_permanent'
    | 'aborted'
    | 'stale_ignored';
  response?: KnowledgeProcessClientResponse;
};

type InFlight = {
  generation: number;
  abort: AbortController;
  promise: Promise<DrainKnowledgeProcessResult>;
};

function flightKey(sectionId: string, sourceObjectId: string): string {
  return `${sectionId}::${sourceObjectId}`;
}

const inFlight = new Map<string, InFlight>();

let requestImpl: KnowledgeProcessRequestFn = requestKnowledgeProcess;

/** Test seam: inject mock process client. */
export function setKnowledgeProcessRequestForTests(
  fn: KnowledgeProcessRequestFn | null,
): void {
  requestImpl = fn ?? requestKnowledgeProcess;
}

export function resetKnowledgeProcessHandoffForTests(): void {
  for (const f of inFlight.values()) {
    try {
      f.abort.abort();
    } catch {
      // ignore
    }
  }
  inFlight.clear();
  requestImpl = requestKnowledgeProcess;
}

export async function markNeedsProcess(
  sectionId: string,
  sourceObjectId: string,
): Promise<KnowledgeNeedsProcessMarker> {
  return markNeedsKnowledgeProcess(sectionId, sourceObjectId);
}

export async function cancelKnowledgeProcessForSource(
  sectionId: string,
  sourceObjectId: string,
): Promise<void> {
  const key = flightKey(sectionId, sourceObjectId);
  const flight = inFlight.get(key);
  if (flight) {
    flight.abort.abort();
    inFlight.delete(key);
  }
  await clearNeedsKnowledgeProcessMarker(sectionId, sourceObjectId, null);
}

async function runDrain(
  sectionId: string,
  sourceObjectId: string,
  generation: number,
  signal: AbortSignal,
): Promise<DrainKnowledgeProcessResult> {
  const base = { sectionId, sourceObjectId, generation };

  if (signal.aborted) {
    return { ...base, outcome: 'aborted' };
  }

  const response = await requestImpl(
    { version: 1, sectionId, sourceObjectId },
    { signal },
  );

  // Re-read marker: a newer mark may have landed during the request.
  const current = await getNeedsKnowledgeProcessMarker(sectionId, sourceObjectId);
  if (!current) {
    // Cancelled / cleared while in flight.
    return { ...base, outcome: 'stale_ignored', response };
  }
  if (current.generation !== generation) {
    // Newer generation must remain pending.
    return { ...base, outcome: 'stale_ignored', response };
  }

  if (response.ok) {
    await clearNeedsKnowledgeProcessMarker(sectionId, sourceObjectId, generation);
    return { ...base, outcome: 'success', response };
  }

  const kind = classifyKnowledgeProcessFailure(response.error.code);
  if (kind === 'permanent') {
    await clearNeedsKnowledgeProcessMarker(sectionId, sourceObjectId, generation);
    return { ...base, outcome: 'cleared_permanent', response };
  }
  if (kind === 'auth_retain') {
    return { ...base, outcome: 'retained_auth', response };
  }
  if (kind === 'stale') {
    // Do not tight-loop; keep marker for a later drain/replace.
    return { ...base, outcome: 'retained_stale', response };
  }
  if (kind === 'aborted') {
    return { ...base, outcome: 'aborted', response };
  }
  return { ...base, outcome: 'retained_retryable', response };
}

/**
 * Drain one source if a marker exists. Single-flight: concurrent drains join
 * the in-flight promise for the same key.
 */
export async function drainKnowledgeProcessForSource(
  sectionId: string,
  sourceObjectId: string,
): Promise<DrainKnowledgeProcessResult> {
  const key = flightKey(sectionId, sourceObjectId);
  const existingFlight = inFlight.get(key);
  if (existingFlight) {
    // Join in-flight request — do not start a second invoke.
    return existingFlight.promise;
  }

  // Claim the flight slot synchronously before any await to prevent duplicate
  // invokes when two drains race.
  let settle!: (value: DrainKnowledgeProcessResult) => void;
  const deferred = new Promise<DrainKnowledgeProcessResult>(resolve => {
    settle = resolve;
  });
  const abort = new AbortController();
  inFlight.set(key, { generation: 0, abort, promise: deferred });

  try {
    const marker = await getNeedsKnowledgeProcessMarker(sectionId, sourceObjectId);
    if (!marker) {
      const skipped: DrainKnowledgeProcessResult = {
        sectionId,
        sourceObjectId,
        generation: 0,
        outcome: 'skipped_no_marker',
      };
      settle(skipped);
      return skipped;
    }

    const flight = inFlight.get(key);
    if (flight) {
      flight.generation = marker.generation;
    }

    const result = await runDrain(
      sectionId,
      sourceObjectId,
      marker.generation,
      abort.signal,
    );
    settle(result);
    return result;
  } catch (e) {
    const failed: DrainKnowledgeProcessResult = {
      sectionId,
      sourceObjectId,
      generation: 0,
      outcome: 'retained_retryable',
      response: {
        version: 1,
        ok: false,
        error: {
          code: 'internal_error',
          message: e instanceof Error ? e.message : 'Drain failed.',
        },
      },
    };
    settle(failed);
    return failed;
  } finally {
    const cur = inFlight.get(key);
    if (cur?.promise === deferred) {
      inFlight.delete(key);
    }
  }
}

/**
 * Drain all pending markers for a section (sequential per source; independent PDFs
 * get separate single-flight slots when drained concurrently via Promise.all).
 */
export async function drainKnowledgeProcessForSection(
  sectionId: string,
  opts?: { concurrent?: boolean },
): Promise<DrainKnowledgeProcessResult[]> {
  const markers = await listNeedsKnowledgeProcessForSection(sectionId);
  if (opts?.concurrent === false) {
    const out: DrainKnowledgeProcessResult[] = [];
    for (const m of markers) {
      out.push(await drainKnowledgeProcessForSource(m.sectionId, m.sourceObjectId));
    }
    return out;
  }
  return Promise.all(
    markers.map(m => drainKnowledgeProcessForSource(m.sectionId, m.sourceObjectId)),
  );
}
