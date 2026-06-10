/**
 * Safer coalesced pointer sampling for handwriting input fidelity.
 */

import { hwDiagLog } from './handwritingDiagnostics';

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

/**
 * Pick pointer events for one move sample: coalesced when safe, else parent only.
 */
export function pickPointerEventsForSample(e: PointerEvent): PointerSamplePickResult {
  if (typeof e.getCoalescedEvents !== 'function') {
    return { events: [e], usedCoalesced: false, fallbackReason: 'no_api' };
  }

  let batch: PointerEvent[];
  try {
    batch = e.getCoalescedEvents();
  } catch {
    return { events: [e], usedCoalesced: false, fallbackReason: 'getCoalescedEvents threw' };
  }

  if (!batch.length) {
    return { events: [e], usedCoalesced: false, fallbackReason: 'empty_batch' };
  }

  if (batch.length === 1) {
    return { events: batch, usedCoalesced: true };
  }

  const sorted = [...batch].sort((a, b) => a.timeStamp - b.timeStamp);
  if (!isCoalescedBatchSafe(sorted, e)) {
    return { events: [e], usedCoalesced: false, fallbackReason: 'unsafe_batch' };
  }

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
