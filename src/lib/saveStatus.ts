/**
 * Central save-status ledger for local persistence channels.
 * Used by diagnostics and save-status UI; never logs secrets.
 *
 * Note: markSaveError leaves pending=true until a later markSaveOk.
 * UI mappers must prefer lastError over pending.
 */

import { fwPersistWarn } from './freeSpacePersistence';
import { recordSyncTimelineEvent } from './sync/syncEventTimeline';

export type SaveChannel =
  | 'freeSpaceObjects'
  | 'freeSpacePositions'
  | 'freeSpaceViewport'
  | 'freeSpacePrefs'
  | 'handwriting'
  | 'pdfBlob'
  | 'imageBlob';

export interface SaveChannelStatus {
  pending: boolean;
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  retryCount: number;
}

export interface SaveScope {
  sectionId: string | null;
  boardId: string | null;
}

type SaveStatusListener = () => void;

const channelState = (): Record<SaveChannel, SaveChannelStatus> => ({
  freeSpaceObjects: emptyChannel(),
  freeSpacePositions: emptyChannel(),
  freeSpaceViewport: emptyChannel(),
  freeSpacePrefs: emptyChannel(),
  handwriting: emptyChannel(),
  pdfBlob: emptyChannel(),
  imageBlob: emptyChannel(),
});

function emptyChannel(): SaveChannelStatus {
  return { pending: false, lastOkAt: null, lastErrorAt: null, lastError: null, retryCount: 0 };
}

let scope: SaveScope = { sectionId: null, boardId: null };
let channels = channelState();
const listeners = new Set<SaveStatusListener>();

function notifySaveStatusListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore subscriber errors */
    }
  }
}

/** Subscribe to ledger mutations (pending/ok/error/conflict/scope). */
export function subscribeSaveStatus(listener: SaveStatusListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSaveScope(sectionId: string | null, boardId: string | null): void {
  scope = { sectionId, boardId: boardId || 'main' };
  notifySaveStatusListeners();
}

export function getSaveScope(): SaveScope {
  return { ...scope };
}

export function markSavePending(channel: SaveChannel): void {
  channels[channel].pending = true;
  recordSyncTimelineEvent('saving_started', { channel });
  notifySaveStatusListeners();
}

export function markSaveOk(channel: SaveChannel): void {
  const c = channels[channel];
  c.pending = false;
  c.lastOkAt = Date.now();
  c.lastError = null;
  c.retryCount = 0;
  recordSyncTimelineEvent('local_save_completed', { channel });
  if (!(Object.values(channels) as SaveChannelStatus[]).some(ch => ch.pending)) {
    recordSyncTimelineEvent('pending_cleared');
  }
  notifySaveStatusListeners();
}

export function markSaveError(channel: SaveChannel, message: string): void {
  const c = channels[channel];
  c.pending = true;
  c.lastErrorAt = Date.now();
  c.lastError = message;
  fwPersistWarn(`${channel}: ${message}`);
  recordSyncTimelineEvent('save_failed', { channel });
  notifySaveStatusListeners();
}

const storageConflicts: string[] = [];
const MAX_CONFLICTS = 12;

export function recordStorageConflict(message: string): void {
  storageConflicts.push(message);
  if (storageConflicts.length > MAX_CONFLICTS) storageConflicts.shift();
  fwPersistWarn(`Storage merge conflict: ${message}`);
  recordSyncTimelineEvent('storage_conflict_recorded');
  notifySaveStatusListeners();
}

export function getStorageConflicts(): string[] {
  return [...storageConflicts];
}

export function clearStorageConflictsForTests(): void {
  storageConflicts.length = 0;
}

export function incrementSaveRetry(channel: SaveChannel): void {
  channels[channel].retryCount += 1;
  notifySaveStatusListeners();
}

export function getSaveStatusSnapshot(): {
  scope: SaveScope;
  channels: Record<SaveChannel, SaveChannelStatus>;
  anyPending: boolean;
  anyError: boolean;
  storageConflicts: string[];
} {
  const snap = { ...scope };
  const ch = Object.fromEntries(
    (Object.keys(channels) as SaveChannel[]).map(k => [k, { ...channels[k] }]),
  ) as Record<SaveChannel, SaveChannelStatus>;
  const anyPending = (Object.values(ch) as SaveChannelStatus[]).some(c => c.pending);
  const anyError = (Object.values(ch) as SaveChannelStatus[]).some(c => c.lastError != null);
  return { scope: snap, channels: ch, anyPending, anyError, storageConflicts: getStorageConflicts() };
}

/** Test-only reset */
export function resetSaveStatusForTests(): void {
  scope = { sectionId: null, boardId: null };
  channels = channelState();
  clearStorageConflictsForTests();
  notifySaveStatusListeners();
}
