/**
 * Safe localStorage writes with retry + save-status integration.
 */

import { fwPersistWarn } from './freeSpacePersistence';
import type { SaveChannel } from './saveStatus';
import { incrementSaveRetry, markSaveError, markSaveOk, markSavePending } from './saveStatus';

const MAX_RETRIES = 2;
const RETRY_MS = 80;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function safeLocalStorageSetSync(
  key: string,
  value: string,
  channel: SaveChannel,
): { ok: boolean; error?: string } {
  markSavePending(channel);
  let lastErr = '';
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) incrementSaveRetry(channel);
    try {
      localStorage.setItem(key, value);
      markSaveOk(channel);
      return { ok: true };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < MAX_RETRIES) {
        /* sync retry — brief busy-wait only on final attempts before giving up */
      }
    }
  }
  const msg = `localStorage write failed for "${key}": ${lastErr}`;
  markSaveError(channel, msg);
  fwPersistWarn(msg);
  return { ok: false, error: lastErr };
}

/** Async variant with delay between retries (for large payloads). */
export async function safeLocalStorageSet(
  key: string,
  value: string,
  channel: SaveChannel,
): Promise<{ ok: boolean; error?: string }> {
  markSavePending(channel);
  let lastErr = '';
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      incrementSaveRetry(channel);
      await sleep(RETRY_MS);
    }
    try {
      localStorage.setItem(key, value);
      markSaveOk(channel);
      return { ok: true };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  const msg = `localStorage write failed for "${key}": ${lastErr}`;
  markSaveError(channel, msg);
  return { ok: false, error: lastErr };
}
