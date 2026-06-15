/**
 * Safer coalesced pointer sampling for handwriting input fidelity.
 */

import { hwDiagActive, hwDiagLog } from './handwritingDiagnostics';
import { hwSpikeLog, recordMovePick } from './handwritingSpikeDebug';

const MAX_COALESCED_BATCH = 64;
/** Reject coalesced samples farther than this from the parent pointermove (px). */
const MAX_PARENT_DELTA_PX = 240;

function parentDeltaSq(ev: PointerEvent, parent: PointerEvent): number {
  const dx = ev.clientX - parent.clientX;
  const dy = ev.clientY - parent.clientY;
  return dx * dx + dy * dy;
}

/**
 * Returns true when a coalesced batch looks safe to use for ink sampling.
 * Exported for unit tests.
 */
export function isCoalescedBatchSafe(
  sorted: PointerEvent[],
  parent: PointerEvent,
): boolean {
  if (sorted.length === 0) return false;
  if (sorted.length > MAX_COALESCED_BATCH) return false;

  const maxParentDeltaSq = MAX_PARENT_DELTA_PX * MAX_PARENT_DELTA_PX;

  for (const ev of sorted) {
    if (!Number.isFinite(ev.clientX) || !Number.isFinite(ev.clientY)) return false;
    if (!Number.isFinite(ev.timeStamp)) return false;
    if (parentDeltaSq(ev, parent) > maxParentDeltaSq) return false;
  }

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.timeStamp < sorted[i - 1]!.timeStamp) return false;
  }

  return true;
}

export type PointerSamplePickResult = {
  events: PointerEvent[];
  usedCoalesced: boolean;
  fallbackReason?: string;
};

export type PointerSamplePickOptions = {
  /** When false, always use the parent pointermove only (stable production / dev A/B off). */
  allowCoalesced?: boolean;
};

/**
 * Pick pointer events for one move sample: coalesced when safe, else parent only.
 */
export function pickPointerEventsForSample(
  e: PointerEvent,
  opts?: PointerSamplePickOptions,
): PointerSamplePickResult {
  if (opts?.allowCoalesced === false) {
    const off: PointerSamplePickResult = {
      events: [e],
      usedCoalesced: false,
      fallbackReason: 'dev_off',
    };
    recordMovePick(1, false, 'dev_off');
    return off;
  }

  if (typeof e.getCoalescedEvents !== 'function') {
    const noApi: PointerSamplePickResult = {
      events: [e],
      usedCoalesced: false,
      fallbackReason: 'no_api',
    };
    recordMovePick(1, false, 'no_api');
    return noApi;
  }

  let batch: PointerEvent[];
  try {
    batch = e.getCoalescedEvents();
  } catch {
    const threw: PointerSamplePickResult = {
      events: [e],
      usedCoalesced: false,
      fallbackReason: 'getCoalescedEvents threw',
    };
    recordMovePick(1, false, 'getCoalescedEvents threw');
    return threw;
  }

  if (!batch.length) {
    const empty: PointerSamplePickResult = {
      events: [e],
      usedCoalesced: false,
      fallbackReason: 'empty_batch',
    };
    recordMovePick(1, false, 'empty_batch');
    return empty;
  }

  if (batch.length === 1) {
    recordMovePick(1, true);
    return { events: batch, usedCoalesced: true };
  }

  const sorted = [...batch].sort((a, b) => a.timeStamp - b.timeStamp);
  if (!isCoalescedBatchSafe(sorted, e)) {
    const unsafe: PointerSamplePickResult = {
      events: [e],
      usedCoalesced: false,
      fallbackReason: 'unsafe_batch',
    };
    recordMovePick(batch.length, false, 'unsafe_batch');
    hwSpikeLog('H-B', 'handwritingPointerSamples', 'coalesced rejected unsafe', {
      batchSize: batch.length,
      parentX: e.clientX,
      parentY: e.clientY,
      firstX: sorted[0]?.clientX,
      lastX: sorted[sorted.length - 1]?.clientX,
    });
    return unsafe;
  }

  recordMovePick(sorted.length, true);
  return { events: sorted, usedCoalesced: true };
}

let coalescedUseCount = 0;
let coalescedFallbackCount = 0;

export function hwPointerSamplingStats(): {
  coalescedUseCount: number;
  coalescedFallbackCount: number;
} {
  return { coalescedUseCount, coalescedFallbackCount };
}

export function recordPointerSamplePick(result: PointerSamplePickResult): void {
  if (!hwDiagActive()) return;
  if (result.usedCoalesced) {
    coalescedUseCount += 1;
    if (coalescedUseCount <= 3 || coalescedUseCount % 50 === 0) {
      hwDiagLog('handwritingPointerSamples', 'coalesced batch used', {
        batchSize: result.events.length,
        coalescedUseCount,
      });
    }
    return;
  }

  if (result.fallbackReason && result.fallbackReason !== 'no_api') {
    coalescedFallbackCount += 1;
    if (coalescedFallbackCount <= 5) {
      hwDiagLog('handwritingPointerSamples', 'coalesced fallback', {
        reason: result.fallbackReason,
        coalescedFallbackCount,
      });
    }
  }
}
