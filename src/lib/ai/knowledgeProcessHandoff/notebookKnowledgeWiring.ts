/**
 * M0.8E — Durable Notebook knowledge handoff.
 *
 * Mark after durable Notebook page semantic persist → idle debounce / page-leave
 * → cloud FSO gate → ai-knowledge-notebook-process.
 *
 * NEVER blocks the Notebook editor. NEVER throws into save/delete UX.
 */

import { FREE_SPACE_OBJECT_ENTITY_TYPE } from '../../focusCache/freeSpaceObjectCreateEnqueue';
import { listPendingOperations } from '../../focusCache/pendingOperations';
import { fwPersistWarn } from '../../freeSpacePersistence';
import {
  requestNotebookKnowledgePageRemove,
  requestNotebookKnowledgeProcess,
  type NotebookKnowledgeProcessClientResponse,
} from '../knowledgeProcessClient/notebookClient';
import { classifyKnowledgeProcessFailure } from './classifyFailure';
import {
  clearNeedsNotebookKnowledgeProcessMarker,
  getNeedsNotebookKnowledgeProcessMarker,
  listNeedsKnowledgeProcessForSection,
  listNeedsNotebookKnowledgeProcessForNotebook,
  markNeedsNotebookKnowledgeProcess,
  type KnowledgeNeedsProcessMarker,
} from './needsProcessStore';
import { isStructuredFsoSafeForKnowledgeProcess } from './pdfKnowledgeWiring';
import { invalidateCourseKnowledgeReadiness } from '../askCourse/courseKnowledgeReadiness';

/** Idle debounce after latest durable semantic save (product constant). */
export const NOTEBOOK_KNOWLEDGE_IDLE_MS = 45_000;

/** V1: sequential drain of notebook page markers. */
export const NOTEBOOK_KNOWLEDGE_DRAIN_CONCURRENCY = 1;

export type NotebookKnowledgeHandoffIds = {
  userId: string;
  sectionId: string;
  notebookObjectId: string;
  pageId: string;
};

export type NotebookDrainResult = {
  sectionId: string;
  notebookObjectId: string;
  pageId: string;
  generation: number;
  outcome:
    | 'success'
    | 'skipped_no_marker'
    | 'skipped_not_before'
    | 'skipped_fso_pending'
    | 'retained_retryable'
    | 'retained_auth'
    | 'retained_stale'
    | 'cleared_permanent'
    | 'aborted'
    | 'stale_ignored';
  response?: NotebookKnowledgeProcessClientResponse;
};

type InFlight = {
  generation: number;
  abort: AbortController;
  promise: Promise<NotebookDrainResult>;
};

const inFlight = new Map<string, InFlight>();
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

function flightKey(sectionId: string, notebookObjectId: string, pageId: string): string {
  return `${sectionId}::notebook_page::${notebookObjectId}::${pageId}`;
}

let processImpl = requestNotebookKnowledgeProcess;
let removeImpl = requestNotebookKnowledgePageRemove;

export function setNotebookKnowledgeProcessRequestForTests(
  fn: typeof requestNotebookKnowledgeProcess | null,
): void {
  processImpl = fn ?? requestNotebookKnowledgeProcess;
}

export function setNotebookKnowledgeRemoveRequestForTests(
  fn: typeof requestNotebookKnowledgePageRemove | null,
): void {
  removeImpl = fn ?? requestNotebookKnowledgePageRemove;
}

export function resetNotebookKnowledgeHandoffForTests(): void {
  for (const f of inFlight.values()) {
    try {
      f.abort.abort();
    } catch {
      /* ignore */
    }
  }
  inFlight.clear();
  for (const t of idleTimers.values()) clearTimeout(t);
  idleTimers.clear();
  processImpl = requestNotebookKnowledgeProcess;
  removeImpl = requestNotebookKnowledgePageRemove;
}

async function hasPendingStructuredFsoWrite(
  userId: string,
  sectionId: string,
  objectId: string,
): Promise<'none' | 'write' | 'delete' | 'unknown'> {
  try {
    const listed = await listPendingOperations({ userId, workspaceId: sectionId });
    if (!listed.ok) return 'unknown';
    let hasWrite = false;
    for (const op of listed.value) {
      if (op.entityType !== FREE_SPACE_OBJECT_ENTITY_TYPE) continue;
      if (op.entityId !== objectId) continue;
      if (op.operationType === 'delete') return 'delete';
      if (op.operationType === 'create' || op.operationType === 'update') {
        hasWrite = true;
      }
    }
    return hasWrite ? 'write' : 'none';
  } catch {
    return 'unknown';
  }
}

function scheduleIdleTimer(marker: KnowledgeNeedsProcessMarker): void {
  if (marker.sourceKind !== 'notebook_page' || !marker.notebookObjectId) return;
  const key = flightKey(marker.sectionId, marker.notebookObjectId, marker.sourceObjectId);
  const existing = idleTimers.get(key);
  if (existing) clearTimeout(existing);

  const notBefore = marker.notBefore ?? Date.now();
  const delay = Math.max(0, notBefore - Date.now());
  const timer = setTimeout(() => {
    idleTimers.delete(key);
    // userId unknown in timer — recovery/FSO success drains with userId.
    // Here we only attempt if a global last-user was set; prefer FSO/recovery drains.
  }, delay);
  idleTimers.set(key, timer);
}

/**
 * After durable local Notebook page semantic persist.
 * mode idle → notBefore = now+45s; page_leave → notBefore = now (early drain when FSO safe).
 */
export async function markNotebookPageNeedsProcess(input: {
  sectionId: string;
  notebookObjectId: string;
  pageId: string;
  mode: 'idle' | 'page_leave' | 'immediate';
}): Promise<KnowledgeNeedsProcessMarker | null> {
  try {
    if (!input.sectionId || !input.notebookObjectId || !input.pageId) return null;
    const now = Date.now();
    const notBefore =
      input.mode === 'idle' ? now + NOTEBOOK_KNOWLEDGE_IDLE_MS : now;
    const marker = await markNeedsNotebookKnowledgeProcess({
      sectionId: input.sectionId,
      notebookObjectId: input.notebookObjectId,
      pageId: input.pageId,
      notBefore,
    });
    invalidateCourseKnowledgeReadiness(input.sectionId);
    scheduleIdleTimer(marker);
    return marker;
  } catch (err) {
    fwPersistWarn(
      `notebook knowledge mark failed: page=${input.pageId} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

export function markNotebookPageNeedsProcessSafe(input: {
  sectionId: string;
  notebookObjectId: string;
  pageId: string;
  mode: 'idle' | 'page_leave' | 'immediate';
  userId?: string;
}): void {
  void markNotebookPageNeedsProcess(input).then(marker => {
    if (!marker || !input.userId) return;
    if (input.mode === 'idle') {
      // Timer alone is not enough without userId for FSO gate — schedule delayed drain attempt.
      const key = flightKey(input.sectionId, input.notebookObjectId, input.pageId);
      const existing = idleTimers.get(key);
      if (existing) clearTimeout(existing);
      const delay = Math.max(0, (marker.notBefore ?? Date.now()) - Date.now());
      const timer = setTimeout(() => {
        idleTimers.delete(key);
        scheduleNotebookKnowledgeDrainSafe({
          userId: input.userId!,
          sectionId: input.sectionId,
          notebookObjectId: input.notebookObjectId,
          pageId: input.pageId,
        });
      }, delay);
      idleTimers.set(key, timer);
      return;
    }
    scheduleNotebookKnowledgeDrainSafe({
      userId: input.userId,
      sectionId: input.sectionId,
      notebookObjectId: input.notebookObjectId,
      pageId: input.pageId,
    });
  });
}

export function scheduleNotebookKnowledgeDrainSafe(
  input: NotebookKnowledgeHandoffIds,
): void {
  void drainNotebookKnowledgeProcessForPage(input).catch(err => {
    fwPersistWarn(
      `notebook knowledge drain failed: page=${input.pageId} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });
}

async function runNotebookDrain(
  input: NotebookKnowledgeHandoffIds,
  generation: number,
  signal: AbortSignal,
): Promise<NotebookDrainResult> {
  const base = {
    sectionId: input.sectionId,
    notebookObjectId: input.notebookObjectId,
    pageId: input.pageId,
    generation,
  };

  if (signal.aborted) return { ...base, outcome: 'aborted' };

  const pending = await hasPendingStructuredFsoWrite(
    input.userId,
    input.sectionId,
    input.notebookObjectId,
  );
  if (pending !== 'none') {
    return { ...base, outcome: 'skipped_fso_pending' };
  }

  const marker = await getNeedsNotebookKnowledgeProcessMarker(
    input.sectionId,
    input.notebookObjectId,
    input.pageId,
  );
  if (!marker) return { ...base, outcome: 'skipped_no_marker' };
  if (marker.generation !== generation) {
    return { ...base, outcome: 'stale_ignored' };
  }
  if (typeof marker.notBefore === 'number' && Date.now() < marker.notBefore) {
    return { ...base, outcome: 'skipped_not_before' };
  }

  const response = await processImpl(
    {
      version: 1,
      sectionId: input.sectionId,
      notebookObjectId: input.notebookObjectId,
      pageId: input.pageId,
    },
    { signal },
  );

  const current = await getNeedsNotebookKnowledgeProcessMarker(
    input.sectionId,
    input.notebookObjectId,
    input.pageId,
  );
  if (!current) return { ...base, outcome: 'stale_ignored', response };
  if (current.generation !== generation) {
    return { ...base, outcome: 'stale_ignored', response };
  }

  if (response.ok) {
    await clearNeedsNotebookKnowledgeProcessMarker(
      input.sectionId,
      input.notebookObjectId,
      input.pageId,
      generation,
    );
    return { ...base, outcome: 'success', response };
  }

  const kind = classifyKnowledgeProcessFailure(response.error.code);
  if (kind === 'permanent') {
    await clearNeedsNotebookKnowledgeProcessMarker(
      input.sectionId,
      input.notebookObjectId,
      input.pageId,
      generation,
    );
    return { ...base, outcome: 'cleared_permanent', response };
  }
  if (kind === 'auth_retain') return { ...base, outcome: 'retained_auth', response };
  if (kind === 'stale') return { ...base, outcome: 'retained_stale', response };
  if (kind === 'aborted') return { ...base, outcome: 'aborted', response };
  return { ...base, outcome: 'retained_retryable', response };
}

export async function drainNotebookKnowledgeProcessForPage(
  input: NotebookKnowledgeHandoffIds,
): Promise<NotebookDrainResult> {
  const key = flightKey(input.sectionId, input.notebookObjectId, input.pageId);
  const existingFlight = inFlight.get(key);
  if (existingFlight) return existingFlight.promise;

  let settle!: (value: NotebookDrainResult) => void;
  const deferred = new Promise<NotebookDrainResult>(resolve => {
    settle = resolve;
  });
  const abort = new AbortController();
  inFlight.set(key, { generation: 0, abort, promise: deferred });

  let result: NotebookDrainResult;
  try {
    const marker = await getNeedsNotebookKnowledgeProcessMarker(
      input.sectionId,
      input.notebookObjectId,
      input.pageId,
    );
    if (!marker) {
      result = {
        sectionId: input.sectionId,
        notebookObjectId: input.notebookObjectId,
        pageId: input.pageId,
        generation: 0,
        outcome: 'skipped_no_marker',
      };
    } else {
      const flight = inFlight.get(key);
      if (flight) flight.generation = marker.generation;
      result = await runNotebookDrain(input, marker.generation, abort.signal);
    }
  } catch (e) {
    result = {
      sectionId: input.sectionId,
      notebookObjectId: input.notebookObjectId,
      pageId: input.pageId,
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
  } finally {
    const cur = inFlight.get(key);
    if (cur?.promise === deferred) inFlight.delete(key);
  }

  settle(result);

  if (
    result.outcome === 'success' ||
    result.outcome === 'cleared_permanent' ||
    result.outcome === 'retained_retryable' ||
    result.outcome === 'retained_stale'
  ) {
    invalidateCourseKnowledgeReadiness(input.sectionId);
  }

  // Newer generation during flight must remain drainable (no tight loop on FSO/retry).
  if (result.outcome === 'stale_ignored') {
    try {
      const leftover = await getNeedsNotebookKnowledgeProcessMarker(
        input.sectionId,
        input.notebookObjectId,
        input.pageId,
      );
      if (
        leftover &&
        (typeof leftover.notBefore !== 'number' || Date.now() >= leftover.notBefore)
      ) {
        scheduleNotebookKnowledgeDrainSafe(input);
      }
    } catch {
      /* ignore follow-up */
    }
  }

  return result;
}

/**
 * After parent Notebook FSO cloud upsert success — drain page markers for this notebook only.
 */
export async function onNotebookFreeSpaceObjectCloudWriteSucceeded(input: {
  userId: string;
  sectionId: string;
  notebookObjectId: string;
}): Promise<void> {
  try {
    const pending = await hasPendingStructuredFsoWrite(
      input.userId,
      input.sectionId,
      input.notebookObjectId,
    );
    if (pending !== 'none') return;

    const markers = await listNeedsNotebookKnowledgeProcessForNotebook(
      input.sectionId,
      input.notebookObjectId,
    );
    // Sequential V1 concurrency.
    for (const m of markers) {
      if (typeof m.notBefore === 'number' && Date.now() < m.notBefore) continue;
      await drainNotebookKnowledgeProcessForPage({
        userId: input.userId,
        sectionId: input.sectionId,
        notebookObjectId: input.notebookObjectId,
        pageId: m.sourceObjectId,
      });
    }
  } catch (err) {
    fwPersistWarn(
      `notebook knowledge drain after FSO write failed: object=${input.notebookObjectId} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export function notifyNotebookFreeSpaceObjectCloudWriteSucceededSafe(input: {
  userId: string;
  sectionId: string;
  notebookObjectId: string;
}): void {
  void onNotebookFreeSpaceObjectCloudWriteSucceeded(input).catch(() => undefined);
}

/** Section/online recovery: drain notebook markers that are due + FSO-safe. */
export async function recoverNotebookKnowledgeProcessForSection(
  sectionId: string,
  userId: string,
): Promise<void> {
  if (!sectionId.trim() || !userId.trim()) return;
  try {
    const markers = await listNeedsKnowledgeProcessForSection(sectionId);
    const notebookMarkers = markers.filter(m => m.sourceKind === 'notebook_page');
    for (const m of notebookMarkers) {
      if (!m.notebookObjectId) continue;
      if (typeof m.notBefore === 'number' && Date.now() < m.notBefore) continue;
      const safe = await isStructuredFsoSafeForKnowledgeProcess(
        userId,
        sectionId,
        m.notebookObjectId,
      );
      if (!safe) continue;
      await drainNotebookKnowledgeProcessForPage({
        userId,
        sectionId,
        notebookObjectId: m.notebookObjectId,
        pageId: m.sourceObjectId,
      });
    }
  } catch (err) {
    fwPersistWarn(
      `notebook knowledge section recovery failed: section=${sectionId} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export function recoverNotebookKnowledgeProcessForSectionSafe(
  sectionId: string,
  userId: string,
): void {
  void recoverNotebookKnowledgeProcessForSection(sectionId, userId).catch(() => undefined);
}

export async function cancelNotebookKnowledgeProcessForPage(
  sectionId: string,
  notebookObjectId: string,
  pageId: string,
): Promise<void> {
  const key = flightKey(sectionId, notebookObjectId, pageId);
  const flight = inFlight.get(key);
  if (flight) {
    flight.abort.abort();
    inFlight.delete(key);
  }
  const timer = idleTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    idleTimers.delete(key);
  }
  await clearNeedsNotebookKnowledgeProcessMarker(
    sectionId,
    notebookObjectId,
    pageId,
    null,
  );
}

export function cancelNotebookKnowledgeProcessForPageSafe(
  sectionId: string,
  notebookObjectId: string,
  pageId: string,
): void {
  void cancelNotebookKnowledgeProcessForPage(sectionId, notebookObjectId, pageId).catch(
    err => {
      fwPersistWarn(
        `notebook knowledge cancel failed: page=${pageId} err=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    },
  );
}

export async function cancelNotebookKnowledgeProcessForNotebook(
  sectionId: string,
  notebookObjectId: string,
): Promise<void> {
  const markers = await listNeedsNotebookKnowledgeProcessForNotebook(
    sectionId,
    notebookObjectId,
  );
  for (const m of markers) {
    await cancelNotebookKnowledgeProcessForPage(
      sectionId,
      notebookObjectId,
      m.sourceObjectId,
    );
  }
}

export function cancelNotebookKnowledgeProcessForNotebookSafe(
  sectionId: string,
  notebookObjectId: string,
): void {
  void cancelNotebookKnowledgeProcessForNotebook(sectionId, notebookObjectId).catch(
    () => undefined,
  );
}

/**
 * Soft-delete page: cancel local marker + authoritative server remove.
 * Never throws into delete UX.
 */
export function onNotebookPageSoftDeletedSafe(input: NotebookKnowledgeHandoffIds): void {
  void (async () => {
    await cancelNotebookKnowledgeProcessForPage(
      input.sectionId,
      input.notebookObjectId,
      input.pageId,
    );
    await removeImpl({
      sectionId: input.sectionId,
      notebookObjectId: input.notebookObjectId,
      pageId: input.pageId,
    });
  })().catch(err => {
    fwPersistWarn(
      `notebook knowledge page-delete cleanup failed: page=${input.pageId} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });
}
