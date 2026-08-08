/**
 * Dev / QA-only sync event timeline.
 * Metadata only — never store notebook text, filenames, URLs, or other user content.
 */

import { isQaModeEnabled } from '../qaMode';

export type SyncTimelineEventType =
  | 'saving_started'
  | 'local_save_completed'
  | 'pending_cleared'
  | 'save_failed'
  | 'storage_conflict_recorded'
  | 'offline_detected'
  | 'online_detected';

export interface SyncTimelineEvent {
  at: number;
  type: SyncTimelineEventType;
  /** Channel id only — never payloads or content. */
  channel?: string;
}

const MAX_EVENTS = 80;
const events: SyncTimelineEvent[] = [];

export function isSyncTimelineEnabled(opts?: {
  dev?: boolean;
  search?: string;
  storage?: Pick<Storage, 'getItem'>;
}): boolean {
  const dev = opts?.dev ?? (typeof import.meta !== 'undefined' && !!import.meta.env?.DEV);
  if (typeof window === 'undefined') return !!dev;
  return isQaModeEnabled({
    dev,
    search: opts?.search ?? window.location.search,
    storage: opts?.storage ?? localStorage,
  });
}

export function recordSyncTimelineEvent(
  type: SyncTimelineEventType,
  meta?: { channel?: string },
): void {
  if (!isSyncTimelineEnabled()) return;
  events.push({
    at: Date.now(),
    type,
    ...(meta?.channel ? { channel: meta.channel } : {}),
  });
  if (events.length > MAX_EVENTS) events.shift();
}

export function getSyncTimelineEvents(): SyncTimelineEvent[] {
  return events.map(e => ({ ...e }));
}

export function formatSyncTimelineLines(list: SyncTimelineEvent[] = events): string[] {
  return list.map(e => {
    const time = new Date(e.at).toLocaleTimeString(undefined, { hour12: false });
    const channel = e.channel ? ` channel=${e.channel}` : '';
    return `${time} ${e.type}${channel}`;
  });
}

export function clearSyncTimelineForTests(): void {
  events.length = 0;
}
