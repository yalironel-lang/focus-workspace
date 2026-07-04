/**
 * Read-merge-write localStorage persistence with success-gated pending clear.
 */

import { safeLocalStorageSetSync } from './localStorageWrite';
import type { SaveChannel } from './saveStatus';
import { recordStorageConflict } from './saveStatus';

export function tryPersistLocalStorage(
  storageKey: string,
  value: string,
  channel: SaveChannel,
): boolean {
  const result = safeLocalStorageSetSync(storageKey, value, channel);
  return result.ok;
}

export function recordMergeConflicts(conflicts: string[]): void {
  for (const c of conflicts) recordStorageConflict(c);
}
