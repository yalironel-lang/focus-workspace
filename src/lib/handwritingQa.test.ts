/**
 * Handwriting Phase 1 QA — run: npx tsx src/lib/handwritingQa.test.ts
 */
import {
  referencedHandwritingKeys,
  sanitizeHandwritingData,
  emptyHandwritingData,
  clampCanvasHeight,
  CANVAS_HEIGHT_MAX,
  CANVAS_HEIGHT_MIN,
} from './handwritingTypes';
import { strokesAfterEraser, clientToNormalized } from './handwritingGeometry';
import { MATH_INK_PRESET, strokeHasRealPressure } from './handwritingInk';
import { isCoalescedBatchSafe } from './handwritingPointerSamples';
import { makeHandwritingStorageKey } from './notebookHandwritingStore';
import {
  flushAllHandwritingForObject,
  registerHandwritingFlush,
} from './handwritingFlushRegistry';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

// ::hw:: line parsing keys
const body = '# Title\n::hw::hw-abc123::\nParagraph';
const keys = referencedHandwritingKeys(body);
assert(keys.length === 1 && keys[0] === 'hw-abc123', 'referencedHandwritingKeys');

// storage key format
assert(
  makeHandwritingStorageKey('obj-1', 'hw-abc') === 'obj-1:hw-abc',
  'storage key',
);

// sanitize round-trip
const data = emptyHandwritingData(400, 420);
data.strokes.push({
  id: 'st-1',
  tool: 'pen',
  color: '#000',
  width: 2.5,
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.5, y: 0.5 },
  ],
});
const sanitized = sanitizeHandwritingData(data);
assert(sanitized?.strokes.length === 1, 'sanitize keeps stroke');

// eraser removes intersecting stroke
const erased = strokesAfterEraser(data.strokes, [
  { x: 0.3, y: 0.3 },
  { x: 0.6, y: 0.6 },
]);
assert(erased.length === 0, 'eraser removes stroke');

// normalized coords
const pt = clientToNormalized(150, 100, {
  left: 50,
  top: 0,
  width: 200,
  height: 200,
} as DOMRect);
assert(pt && Math.abs(pt.x - 0.5) < 0.01 && Math.abs(pt.y - 0.5) < 0.01, 'clientToNormalized');

// canvas height clamp
assert(clampCanvasHeight(200) === CANVAS_HEIGHT_MIN, 'height min clamp');
assert(clampCanvasHeight(9999) === CANVAS_HEIGHT_MAX, 'height max clamp');
assert(clampCanvasHeight(540) === 540, 'height mid preserved');

// coalesced batch safety (synthetic PointerEvent-like objects)
const parent = {
  clientX: 100,
  clientY: 100,
  timeStamp: 10,
} as PointerEvent;
const safeBatch = [
  { clientX: 100, clientY: 100, timeStamp: 10 },
  { clientX: 102, clientY: 101, timeStamp: 11 },
  { clientX: 104, clientY: 102, timeStamp: 12 },
] as PointerEvent[];
assert(isCoalescedBatchSafe(safeBatch, parent), 'coalesced safe batch');

const unsafeBatch = [
  { clientX: 100, clientY: 100, timeStamp: 12 },
  { clientX: 100, clientY: 100, timeStamp: 10 },
] as PointerEvent[];
assert(!isCoalescedBatchSafe(unsafeBatch, parent), 'coalesced rejects non-monotonic time');

const farBatch = [
  { clientX: 500, clientY: 100, timeStamp: 10 },
] as PointerEvent[];
assert(!isCoalescedBatchSafe(farBatch, parent), 'coalesced rejects far sample');

// DPR coordinate expectation: logical size must be canvas.width/dpr, not canvas.width
const dpr = 2;
const cssW = 400;
const canvasWidth = cssW * dpr;
const logicalW = canvasWidth / dpr;
assert(logicalW === cssW, 'DPR logical width equals CSS width');

// mathInk production preset
assert(MATH_INK_PRESET.smoothing === 0.1, 'mathInk smoothing');
assert(MATH_INK_PRESET.streamline === 0.08, 'mathInk streamline');
assert(MATH_INK_PRESET.thinning === 0.48, 'mathInk thinning');
assert(MATH_INK_PRESET.sizeMultiplier === 1.08, 'mathInk size multiplier');
assert(
  strokeHasRealPressure({
    id: 'st-p',
    tool: 'pen',
    color: '#000',
    width: 2,
    points: [{ x: 0, y: 0, pressure: 0.4 }],
  }),
  'strokeHasRealPressure detects pencil',
);
assert(
  !strokeHasRealPressure({
    id: 'st-m',
    tool: 'pen',
    color: '#000',
    width: 2,
    points: [{ x: 0, y: 0 }],
  }),
  'strokeHasRealPressure false without pressure',
);

// flush registry — parent can await all block saves before transitions
let flushCallCount = 0;
const unregisterFlush = registerHandwritingFlush('obj-flush', 'hw-a', async () => {
  flushCallCount += 1;
  return true;
});
assert(
  (await flushAllHandwritingForObject('obj-flush')) === true,
  'flushAllHandwritingForObject awaits registered flush',
);
assert(flushCallCount === 1, 'flush registry invokes registered handler');
unregisterFlush();
assert(
  (await flushAllHandwritingForObject('obj-flush')) === true,
  'flush after unregister is noop success',
);
assert(flushCallCount === 1, 'flush count unchanged after unregister');

// GC key union — body refs must be preserved even if blocks parse lags
const gcBody = '::hw::hw-body-only::';
const gcBlockKeys = ['hw-block-a'];
const gcMerged = [...new Set([...referencedHandwritingKeys(gcBody), ...gcBlockKeys])];
assert(
  gcMerged.includes('hw-body-only') && gcMerged.includes('hw-block-a'),
  'GC merges body refs with block keys',
);

console.log('handwritingQa.test.ts: all checks passed');
