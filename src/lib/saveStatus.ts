/**
 * Central save-status ledger for local persistence channels.
 * Used by diagnostics and save-status UI; never logs secrets.
 */

import { fwPersistWarn } from './freeSpacePersistence';

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

export function setSaveScope(sectionId: string | null, boardId: string | null): void {
  scope = { sectionId, boardId: boardId || 'main' };
}

export function getSaveScope(): SaveScope {
  return { ...scope };
}

export function markSavePending(channel: SaveChannel): void {
  channels[channel].pending = true;
}

export function markSaveOk(channel: SaveChannel): void {
  const c = channels[channel];
  c.pending = false;
  c.lastOkAt = Date.now();
  c.lastError = null;
  c.retryCount = 0;
}

export function markSaveError(channel: SaveChannel, message: string): void {
  const c = channels[channel];
  c.pending = true;
  c.lastErrorAt = Date.now();
  c.lastError = message;
  fwPersistWarn(`${channel}: ${message}`);
}

const storageConflicts: string[] = [];
const MAX_CONFLICTS = 12;

export function recordStorageConflict(message: string): void {
  storageConflicts.push(message);
  if (storageConflicts.length > MAX_CONFLICTS) storageConflicts.shift();
  fwPersistWarn(`Storage merge conflict: ${message}`);
}

export function getStorageConflicts(): string[] {
  return [...storageConflicts];
}

export function clearStorageConflictsForTests(): void {
  storageConflicts.length = 0;
}

export function incrementSaveRetry(channel: SaveChannel): void {
  channels[channel].retryCount += 1;
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
}
