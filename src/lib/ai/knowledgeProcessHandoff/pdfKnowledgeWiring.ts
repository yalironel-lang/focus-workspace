/**
 * M0.7B.3 — wire durable Free Space PDF Storage success → knowledge handoff.
 *
 * Side-effect only: never throws into flush/save/delete callers.
 * Does NOT scan historical PDFs. Only marks sources that pass through
 * successful user_content_asset PDF upload.
 */

import { FREE_SPACE_OBJECT_ENTITY_TYPE } from '../../focusCache/freeSpaceObjectCreateEnqueue';
import { listPendingOperations } from '../../focusCache/pendingOperations';
import { fwPersistWarn } from '../../freeSpacePersistence';
import {
  cancelKnowledgeProcessForSource,
  drainKnowledgeProcessForSource,
  markNeedsProcess,
} from './controller';
import { getNeedsKnowledgeProcessMarker, listNeedsKnowledgeProcessForSection } from './needsProcessStore';

export type PdfKnowledgeHandoffIds = {
  userId: string;
  sectionId: string;
  sourceObjectId: string;
};

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

/** True when structured FSO cloud write is safe enough to attempt process. */
export async function isStructuredFsoSafeForKnowledgeProcess(
  userId: string,
  sectionId: string,
  objectId: string,
): Promise<boolean> {
  const pending = await hasPendingStructuredFsoWrite(userId, sectionId, objectId);
  return pending === 'none';
}

/**
 * Fire-and-forget drain. Never throws. Never surfaces to PDF UX.
 */
export function scheduleKnowledgeProcessDrainSafe(
  sectionId: string,
  sourceObjectId: string,
): void {
  void drainKnowledgeProcessForSource(sectionId, sourceObjectId).catch(err => {
    fwPersistWarn(
      `knowledge process drain failed: section=${sectionId} object=${sourceObjectId} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });
}

/**
 * After successful remote PDF Storage upload (user_content_asset upload).
 * Marks needsProcess; drains only when FSO write is not pending.
 */
export async function onPdfStorageUploadSucceeded(
  input: PdfKnowledgeHandoffIds,
): Promise<void> {
  try {
    const pending = await hasPendingStructuredFsoWrite(
      input.userId,
      input.sectionId,
      input.sourceObjectId,
    );
    if (pending === 'delete') {
      // Delete wins — do not mark or resurrect process work.
      return;
    }

    await markNeedsProcess(input.sectionId, input.sourceObjectId);

    if (pending === 'none') {
      scheduleKnowledgeProcessDrainSafe(input.sectionId, input.sourceObjectId);
    }
    // If FSO write still pending / unknown: marker retained; later FSO success
    // or section/online recovery will drain.
  } catch (err) {
    fwPersistWarn(
      `knowledge process mark after PDF upload failed: object=${input.sourceObjectId} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * After successful free_space_object create/update flush for an object that
 * already has a needsProcess marker (PDF Storage landed earlier).
 */
export async function onFreeSpaceObjectCloudWriteSucceeded(input: {
  userId: string;
  sectionId: string;
  objectId: string;
}): Promise<void> {
  try {
    const marker = await getNeedsKnowledgeProcessMarker(
      input.sectionId,
      input.objectId,
    );
    if (!marker) return;

    const pending = await hasPendingStructuredFsoWrite(
      input.userId,
      input.sectionId,
      input.objectId,
    );
    if (pending !== 'none') return;

    scheduleKnowledgeProcessDrainSafe(input.sectionId, input.objectId);
  } catch (err) {
    fwPersistWarn(
      `knowledge process drain after FSO write failed: object=${input.objectId} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Section-open / online recovery: drain existing markers for this section only.
 * Does NOT scan or mark historical unmarked PDFs.
 * Re-checks FSO queue safety per source so recovery cannot race a pending
 * structured create/update/delete (or unknown list failure).
 */
export function recoverKnowledgeProcessForSection(
  sectionId: string,
  userId: string,
): void {
  if (!sectionId.trim() || !userId.trim()) return;
  void (async () => {
    const markers = await listNeedsKnowledgeProcessForSection(sectionId);
    for (const m of markers) {
      const pending = await hasPendingStructuredFsoWrite(
        userId,
        sectionId,
        m.sourceObjectId,
      );
      if (pending !== 'none') {
        // Retain marker; later FSO success / recovery retries when safe.
        continue;
      }
      scheduleKnowledgeProcessDrainSafe(m.sectionId, m.sourceObjectId);
    }
  })().catch(err => {
    fwPersistWarn(
      `knowledge process section recovery failed: section=${sectionId} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });
}

/**
 * PDF delete: cancel marker + abort in-flight. Never throws into delete UX.
 */
export function cancelPdfKnowledgeProcessSafe(
  sectionId: string,
  sourceObjectId: string,
): void {
  void cancelKnowledgeProcessForSource(sectionId, sourceObjectId).catch(err => {
    fwPersistWarn(
      `knowledge process cancel on PDF delete failed: object=${sourceObjectId} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });
}

/**
 * Non-blocking wrapper for flush hooks — never awaits into flush loop.
 */
export function notifyPdfStorageUploadSucceededSafe(
  input: PdfKnowledgeHandoffIds,
): void {
  void onPdfStorageUploadSucceeded(input).catch(() => undefined);
}

export function notifyFreeSpaceObjectCloudWriteSucceededSafe(input: {
  userId: string;
  sectionId: string;
  objectId: string;
}): void {
  void onFreeSpaceObjectCloudWriteSucceeded(input).catch(() => undefined);
}
