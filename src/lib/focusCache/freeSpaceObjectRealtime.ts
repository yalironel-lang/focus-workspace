/**
 * PR7b: Free Space Realtime thin delivery layer.
 *
 * Subscribes to section-scoped postgres_changes on free_space_objects and forwards
 * INSERT/UPDATE payloads into the shared PR7 mounted-board apply path.
 * DELETE events are ignored (PR6 deferred cloud DELETE).
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
  /** Null for DELETE (ignored) or malformed INSERT/UPDATE. */
  row: FreeSpaceObjectCloudRow | null;
  ignored: boolean;
  ignoreReason?: string;
};

export type FreeSpaceRealtimeSubscribeInput = {
  sectionId: string;
  /** Called for every postgres_changes payload after normalize / DELETE ignore. */
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
 * Normalize a Realtime postgres_changes payload.
 * DELETE → ignored (no local apply). Malformed INSERT/UPDATE → ignored.
 */
export function normalizeFreeSpaceRealtimePayload(
  payload: Pick<RealtimePostgresChangesPayload<Record<string, unknown>>, 'eventType' | 'new' | 'old'>,
): FreeSpaceRealtimeNormalizedEvent {
  const eventType = payload.eventType as FreeSpaceRealtimeEventType;

  if (eventType === 'DELETE') {
    return {
      eventType: 'DELETE',
      row: null,
      ignored: true,
      ignoreReason: 'delete_ignored_pr6',
    };
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

/**
 * Subscribe to section-scoped free_space_objects changes.
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

  const channelName = `free_space_objects:section:${sectionId}`;
  let channel: RealtimeChannel | null = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'free_space_objects',
        filter: `section_id=eq.${sectionId}`,
      },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        try {
          const normalized = normalizeFreeSpaceRealtimePayload(payload);
          input.onEvent(normalized);
        } catch (e) {
          fwPersistWarn(`Free Space realtime event handler failed: ${String(e)}`);
        }
      },
    );

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
