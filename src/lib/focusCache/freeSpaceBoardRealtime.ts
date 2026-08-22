/**
 * Free Space board Realtime delivery.
 *
 * Same Option B as free_space_objects: INSERT/UPDATE filtered by section_id;
 * DELETE unfiltered (composite PK old_record may be id-only under DEFAULT replica identity).
 * Client scopes DELETE via section_id when present, else fallbackSectionId + board list apply.
 */

import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { fwPersistWarn } from '../freeSpacePersistence';
import { isSupabaseConfigured, supabase } from '../supabase';
import {
  normalizeFreeSpaceBoardCloudRow,
  type FreeSpaceBoardCloudRow,
} from './freeSpaceBoardCloud';

export type FreeSpaceBoardRealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export type FreeSpaceBoardRealtimeNormalizedEvent = {
  eventType: FreeSpaceBoardRealtimeEventType;
  row: FreeSpaceBoardCloudRow | null;
  ignored: boolean;
  ignoreReason?: string;
};

export type FreeSpaceBoardRealtimeSubscribeInput = {
  sectionId: string;
  onEvent: (event: FreeSpaceBoardRealtimeNormalizedEvent) => void;
  onStatus: (status: string) => void;
};

export type FreeSpaceBoardRealtimeSubscription = {
  unsubscribe: () => void;
  channelName: string;
};

function isExactNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

export function normalizeFreeSpaceBoardRealtimeDeleteRow(
  raw: unknown,
  fallbackSectionId?: string,
): FreeSpaceBoardCloudRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isExactNonEmptyId(r.id)) return null;
  const sectionId =
    typeof r.section_id === 'string' && r.section_id.trim()
      ? r.section_id
      : fallbackSectionId && isExactNonEmptyId(fallbackSectionId)
        ? fallbackSectionId
        : null;
  if (!sectionId) return null;
  return {
    id: r.id,
    user_id: typeof r.user_id === 'string' ? r.user_id : '',
    section_id: sectionId,
    name: typeof r.name === 'string' ? r.name : '',
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : '',
  };
}

export function isFreeSpaceBoardRealtimeDeleteInSectionScope(
  oldRaw: unknown,
  mountedSectionId: string,
): boolean {
  if (!isExactNonEmptyId(mountedSectionId)) return false;
  if (!oldRaw || typeof oldRaw !== 'object' || Array.isArray(oldRaw)) return false;
  const section = (oldRaw as Record<string, unknown>).section_id;
  if (typeof section !== 'string' || !section.trim()) return true;
  return section === mountedSectionId;
}

export function normalizeFreeSpaceBoardRealtimePayload(
  payload: Pick<RealtimePostgresChangesPayload<Record<string, unknown>>, 'eventType' | 'new' | 'old'>,
  fallbackSectionId?: string,
): FreeSpaceBoardRealtimeNormalizedEvent {
  const eventType = payload.eventType as FreeSpaceBoardRealtimeEventType;

  if (eventType === 'DELETE') {
    if (
      fallbackSectionId &&
      !isFreeSpaceBoardRealtimeDeleteInSectionScope(payload.old, fallbackSectionId)
    ) {
      return { eventType: 'DELETE', row: null, ignored: true, ignoreReason: 'other_section' };
    }
    const row = normalizeFreeSpaceBoardRealtimeDeleteRow(payload.old, fallbackSectionId);
    if (!row) {
      return { eventType: 'DELETE', row: null, ignored: true, ignoreReason: 'malformed_delete' };
    }
    return { eventType: 'DELETE', row, ignored: false };
  }

  if (eventType !== 'INSERT' && eventType !== 'UPDATE') {
    return { eventType: 'UPDATE', row: null, ignored: true, ignoreReason: 'unsupported_event' };
  }

  const row = normalizeFreeSpaceBoardCloudRow(payload.new);
  if (!row || row.section_id !== fallbackSectionId) {
    return {
      eventType,
      row: null,
      ignored: true,
      ignoreReason: row && row.section_id !== fallbackSectionId ? 'other_section' : 'malformed_payload',
    };
  }
  return { eventType, row, ignored: false };
}

type PostgresChangesConfig = {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema: string;
  table: string;
  filter?: string;
};

/** Filtered INSERT/UPDATE + unfiltered DELETE (Option B). */
export function buildFreeSpaceBoardRealtimePostgresBindings(sectionId: string): PostgresChangesConfig[] {
  const filter = `section_id=eq.${sectionId}`;
  return [
    { event: 'INSERT', schema: 'public', table: 'free_space_boards', filter },
    { event: 'UPDATE', schema: 'public', table: 'free_space_boards', filter },
    { event: 'DELETE', schema: 'public', table: 'free_space_boards' },
  ];
}

export function subscribeFreeSpaceBoardsRealtime(
  input: FreeSpaceBoardRealtimeSubscribeInput,
): FreeSpaceBoardRealtimeSubscription {
  const sectionId = input.sectionId;
  if (!isExactNonEmptyId(sectionId)) {
    queueMicrotask(() => input.onStatus('CHANNEL_ERROR'));
    return { channelName: '', unsubscribe: () => undefined };
  }

  if (!isSupabaseConfigured) {
    queueMicrotask(() => input.onStatus('CHANNEL_ERROR'));
    return { channelName: '', unsubscribe: () => undefined };
  }

  const onPayload = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
    try {
      input.onEvent(normalizeFreeSpaceBoardRealtimePayload(payload, sectionId));
    } catch (e) {
      fwPersistWarn(`Free Space board realtime handler failed: ${String(e)}`);
    }
  };

  const channelName = `free_space_boards:section:${sectionId}`;
  let channel: RealtimeChannel | null = supabase.channel(channelName);

  for (const binding of buildFreeSpaceBoardRealtimePostgresBindings(sectionId)) {
    channel = channel.on('postgres_changes', binding, onPayload);
  }

  channel.subscribe(status => {
    input.onStatus(status);
  });

  return {
    channelName,
    unsubscribe: () => {
      const ch = channel;
      channel = null;
      if (!ch) return;
      try {
        void supabase.removeChannel(ch);
      } catch {
        /* ignore */
      }
    },
  };
}
