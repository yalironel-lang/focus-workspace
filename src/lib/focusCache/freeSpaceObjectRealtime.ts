/**
 * PR7b: Free Space Realtime thin delivery layer.
 *
 * Subscribes to postgres_changes on free_space_objects and forwards
 * INSERT/UPDATE/DELETE into the shared PR7 mounted-board apply path.
 *
 * INSERT/UPDATE use section_id server filter.
 * DELETE is subscribed WITHOUT section_id filter: under DEFAULT replica identity
 * (and often with RLS), DELETE old_record may contain only the primary key `id`,
 * so a section_id=eq.* filter drops DELETE events before they reach the client.
 * Cross-section DELETE noise is ignored client-side when old.section_id is present
 * and mismatches; id-only deletes are scoped via fallbackSectionId and no-op apply
 * when the object is not on the mounted board.
 *
 * Lifecycle (mandatory): subscribe → on SUBSCRIBED run PR7 pull catch-up → stay live.
 */

import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { fwPersistWarn } from '../freeSpacePersistence';
import { isSupabaseConfigured, supabase } from '../supabase';
import {
  normalizeFreeSpaceObjectCloudRow,
  type FreeSpaceObjectCloudRow,
} from './freeSpaceObjectCloud';

export type FreeSpaceRealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export type FreeSpaceRealtimeNormalizedEvent = {
  eventType: FreeSpaceRealtimeEventType;
  /**
   * INSERT/UPDATE: full row from `new`.
   * DELETE: best-effort row from `old` (id required; board/section when available).
   */
  row: FreeSpaceObjectCloudRow | null;
  ignored: boolean;
  ignoreReason?: string;
};

export type FreeSpaceRealtimeSubscribeInput = {
  sectionId: string;
  /** Called for every postgres_changes payload after normalize. */
  onEvent: (event: FreeSpaceRealtimeNormalizedEvent) => void;
  /**
   * Realtime subscribe status callback.
   * On SUBSCRIBED the caller MUST run PR7 pull catch-up.
   */
  onStatus: (status: string) => void;
};

export type FreeSpaceRealtimeSubscription = {
  unsubscribe: () => void;
  channelName: string;
};

function isExactNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

/**
 * Best-effort DELETE row from realtime `old` record.
 * Replica identity DEFAULT (and RLS-limited old_record) may only include `id`.
 * Callers pass mounted sectionId as fallbackSectionId.
 */
export function normalizeFreeSpaceRealtimeDeleteRow(
  raw: unknown,
  fallbackSectionId?: string,
): FreeSpaceObjectCloudRow | null {
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
    board_id: typeof r.board_id === 'string' ? r.board_id : 'main',
    object: null,
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : '',
  };
}

/**
 * True when a DELETE old row's explicit section_id (if any) matches this mount.
 * Id-only old rows have no explicit section — allowed through (apply no-ops if absent).
 */
export function isFreeSpaceRealtimeDeleteInSectionScope(
  oldRaw: unknown,
  mountedSectionId: string,
): boolean {
  if (!isExactNonEmptyId(mountedSectionId)) return false;
  if (!oldRaw || typeof oldRaw !== 'object' || Array.isArray(oldRaw)) return false;
  const section = (oldRaw as Record<string, unknown>).section_id;
  if (typeof section !== 'string' || !section.trim()) return true;
  return section === mountedSectionId;
}

/**
 * Normalize a Realtime postgres_changes payload.
 * Malformed INSERT/UPDATE/DELETE → ignored.
 */
export function normalizeFreeSpaceRealtimePayload(
  payload: Pick<RealtimePostgresChangesPayload<Record<string, unknown>>, 'eventType' | 'new' | 'old'>,
  fallbackSectionId?: string,
): FreeSpaceRealtimeNormalizedEvent {
  const eventType = payload.eventType as FreeSpaceRealtimeEventType;

  if (eventType === 'DELETE') {
    if (
      fallbackSectionId &&
      !isFreeSpaceRealtimeDeleteInSectionScope(payload.old, fallbackSectionId)
    ) {
      return {
        eventType: 'DELETE',
        row: null,
        ignored: true,
        ignoreReason: 'other_section',
      };
    }
    const row = normalizeFreeSpaceRealtimeDeleteRow(payload.old, fallbackSectionId);
    if (!row) {
      return {
        eventType: 'DELETE',
        row: null,
        ignored: true,
        ignoreReason: 'malformed_delete',
      };
    }
    return { eventType: 'DELETE', row, ignored: false };
  }

  if (eventType !== 'INSERT' && eventType !== 'UPDATE') {
    return {
      eventType: 'UPDATE',
      row: null,
      ignored: true,
      ignoreReason: 'unsupported_event',
    };
  }

  const row = normalizeFreeSpaceObjectCloudRow(payload.new);
  if (!row) {
    return {
      eventType,
      row: null,
      ignored: true,
      ignoreReason: 'malformed_payload',
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

/**
 * Channel bindings: filtered INSERT/UPDATE + unfiltered DELETE.
 * Exported for tests — documents the delivery fix for section-filtered DELETE drop.
 */
export function buildFreeSpaceRealtimePostgresBindings(sectionId: string): PostgresChangesConfig[] {
  const filter = `section_id=eq.${sectionId}`;
  return [
    {
      event: 'INSERT',
      schema: 'public',
      table: 'free_space_objects',
      filter,
    },
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'free_space_objects',
      filter,
    },
    {
      event: 'DELETE',
      schema: 'public',
      table: 'free_space_objects',
      // Intentionally no filter — see file header.
    },
  ];
}

/**
 * Subscribe to free_space_objects changes for one mounted section.
 * Does not apply rows — caller owns shared PR7 apply + catch-up pull.
 */
export function subscribeFreeSpaceObjectsRealtime(
  input: FreeSpaceRealtimeSubscribeInput,
): FreeSpaceRealtimeSubscription {
  const sectionId = input.sectionId;
  if (!isExactNonEmptyId(sectionId)) {
    fwPersistWarn('Free Space realtime subscribe skipped: missing sectionId');
    queueMicrotask(() => input.onStatus('CHANNEL_ERROR'));
    return {
      channelName: '',
      unsubscribe: () => undefined,
    };
  }

  if (!isSupabaseConfigured) {
    fwPersistWarn('Free Space realtime subscribe skipped: Supabase not configured');
    queueMicrotask(() => input.onStatus('CHANNEL_ERROR'));
    return {
      channelName: '',
      unsubscribe: () => undefined,
    };
  }

  const onPayload = (
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ) => {
    try {
      const normalized = normalizeFreeSpaceRealtimePayload(payload, sectionId);
      input.onEvent(normalized);
    } catch (e) {
      fwPersistWarn(`Free Space realtime event handler failed: ${String(e)}`);
    }
  };

  const channelName = `free_space_objects:section:${sectionId}`;
  let channel: RealtimeChannel | null = supabase.channel(channelName);

  for (const binding of buildFreeSpaceRealtimePostgresBindings(sectionId)) {
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
      } catch (e) {
        fwPersistWarn(`Free Space realtime unsubscribe failed: ${String(e)}`);
      }
    },
  };
}
