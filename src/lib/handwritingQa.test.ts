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
import { makeHandwritingStorageKey } from './notebookHandwritingStore';

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

// DPR coordinate expectation: logical size must be canvas.width/dpr, not canvas.width
const dpr = 2;
const cssW = 400;
const canvasWidth = cssW * dpr;
const logicalW = canvasWidth / dpr;
assert(logicalW === cssW, 'DPR logical width equals CSS width');

console.log('handwritingQa.test.ts: all checks passed');
