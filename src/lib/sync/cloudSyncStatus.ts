/**
 * Cloud-sync status ledger (Free Space first).
 *
 * Tracks durable pending cloud ops by queue operation id so overlapping
 * flushes cannot clear "Saved" while other ops remain. Does not poll IndexedDB;
 * callers report enqueue / reconcile / resolve / flush / failure.
 */

export type CloudSyncSnapshot = {
  pendingCount: number;
  pendingOpIds: string[];
  flushInFlight: boolean;
  anyCloudPending: boolean;
  anyCloudFailure: boolean;
  lastFailureAt: number | null;
  lastFailureMessage: string | null;
};

type Listener = () => void;

const pendingOpIds = new Set<string>();
let flushInFlight = false;
let lastFailureAt: number | null = null;
let lastFailureMessage: string | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore subscriber errors */
    }
  }
}

function clearFailureIfDrained(): void {
  if (pendingOpIds.size === 0 && !flushInFlight) {
    lastFailureAt = null;
    lastFailureMessage = null;
  }
}

export function subscribeCloudSyncStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCloudSyncSnapshot(): CloudSyncSnapshot {
  const ids = [...pendingOpIds];
  const pendingCount = ids.length;
  return {
    pendingCount,
    pendingOpIds: ids,
    flushInFlight,
    anyCloudPending: pendingCount > 0 || flushInFlight,
    anyCloudFailure: lastFailureAt != null && pendingCount > 0,
    lastFailureAt,
    lastFailureMessage,
  };
}

/** Record a newly durable pending cloud op (create/update enqueue). */
export function noteCloudOpEnqueued(opId: string): void {
  if (typeof opId !== 'string' || opId.length === 0) return;
  const before = pendingOpIds.size;
  pendingOpIds.add(opId);
  if (pendingOpIds.size !== before) notify();
}

/**
 * Align ledger with authoritative Free Space write ops currently listed in IDB.
 * Call at flush start so remount / drift cannot leave the UI wrong.
 */
export function reconcileCloudPendingOps(opIds: readonly string[]): void {
  const next = new Set(
    opIds.filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
  let changed = next.size !== pendingOpIds.size;
  if (!changed) {
    for (const id of next) {
      if (!pendingOpIds.has(id)) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return;
  pendingOpIds.clear();
  for (const id of next) pendingOpIds.add(id);
  clearFailureIfDrained();
  notify();
}

/** Queue row removed after confirmed cloud write, supersede, or soft-delete cancel. */
export function noteCloudOpResolved(opId: string): void {
  if (typeof opId !== 'string' || opId.length === 0) return;
  if (!pendingOpIds.has(opId)) return;
  pendingOpIds.delete(opId);
  clearFailureIfDrained();
  notify();
}

export function noteCloudOpsResolved(opIds: readonly string[]): void {
  let changed = false;
  for (const id of opIds) {
    if (typeof id !== 'string' || id.length === 0) continue;
    if (pendingOpIds.delete(id)) changed = true;
  }
  if (!changed) return;
  clearFailureIfDrained();
  notify();
}

export function noteCloudFlushStarted(): void {
  if (flushInFlight) return;
  flushInFlight = true;
  notify();
}

export function noteCloudFlushEnded(): void {
  if (!flushInFlight) return;
  flushInFlight = false;
  clearFailureIfDrained();
  notify();
}

export function noteCloudWriteFailed(message?: string): void {
  lastFailureAt = Date.now();
  lastFailureMessage =
    typeof message === 'string' && message.length > 0 ? message : 'cloud_write_failed';
  notify();
}

/** Test-only reset */
export function resetCloudSyncStatusForTests(): void {
  pendingOpIds.clear();
  flushInFlight = false;
  lastFailureAt = null;
  lastFailureMessage = null;
  notify();
}
