/**
 * Catch-up trigger policy for Free Space object cloud pull.
 * Mount runs immediately (boards-parity); Realtime SUBSCRIBED/error remain.
 * Callers must serialize all catch-ups on one apply queue.
 */

export type FreeSpaceObjectRealtimeStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_CLOSED'
  | string;

export type FreeSpaceObjectCatchUpLifecycle = {
  /** Invoke once when the section/board effect mounts. */
  onMount: () => void;
  /** Wire to Realtime channel.subscribe status callback. */
  onRealtimeStatus: (status: FreeSpaceObjectRealtimeStatus) => void;
};

/**
 * Registers mount + Realtime catch-up triggers. Does not execute pulls itself.
 */
export function registerFreeSpaceObjectCatchUpLifecycle(input: {
  runCatchUp: () => void;
}): FreeSpaceObjectCatchUpLifecycle {
  let catchUpOnErrorDone = false;

  return {
    onMount: () => {
      input.runCatchUp();
    },
    onRealtimeStatus: status => {
      if (status === 'SUBSCRIBED') {
        input.runCatchUp();
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        if (!catchUpOnErrorDone) {
          catchUpOnErrorDone = true;
          input.runCatchUp();
        }
      }
    },
  };
}
