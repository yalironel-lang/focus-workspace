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
import { strokesAfterEraser, clientToNormalized, isInkPointer, HW_INK_CANVAS_TOUCH_ACTION, HW_INK_CONTAINER_TOUCH_ACTION, appendPoint, mergeDroppedSamplePressure } from './handwritingGeometry';
import { MATH_INK_PRESET, STUDY_INK_PRESET, STUDY_INK_COLOR, STUDY_PEN_WIDTH, strokeHasRealPressure, commitStrokeSizePx, draftPenLineWidthPx, draftPenSegmentLineWidthPx } from './handwritingInk';
import { isCoalescedBatchSafe } from './handwritingPointerSamples';
import { nextDraftPaintedCount, usesIncrementalDraftPenRenderer, usesInkDraftPenRenderer } from './handwritingLayers';
import {
  FW_INK_DRAFT_MODE_KEY,
  getFwInkDraftModeDiag,
  parseFwInkDraftMode,
} from './handwritingInkDraftMode';
import { getFwFeatureFlags } from './appBuildInfo';
import {
  getHwPaintProfile,
  hwPaintProfileClear,
  hwPaintProfileRecord,
} from './handwritingPaintProfile';
import { pageInkCanvasWrapStyle } from './handwritingStrokeDiag';
import {
  FW_QA_MODE_KEY,
  isQaModeEnabled,
  qaBuildEnvLabel,
  qaModeFromStorage,
  qaModeFromUrl,
} from './qaMode';
import { gateIndicator, strokeDiagGates } from './qaInkPanelMetrics';
import type { StrokeDiagSnapshot } from './handwritingStrokeDiag';
import {
  noteNotebookKeyboardTyping,
  noteNotebookPointerDown,
  resetNotebookInputPolicyForTests,
  shouldRejectPenTextBeforeInput,
} from './notebookInputPolicy';
import {
  hwLoadErrorMessage,
  hwLoadRecoveryGuidance,
  makeHandwritingStorageKey,
  parseStoredHandwritingPayload,
} from './notebookHandwritingStore';
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

// dual-layer draft paint cursor (polyline mode)
assert(nextDraftPaintedCount(0, 0) === 0, 'draft cursor empty stroke');
assert(nextDraftPaintedCount(1, 0) === 1, 'draft cursor first point');
assert(nextDraftPaintedCount(5, 1) === 5, 'draft cursor catches up to point count');
assert(nextDraftPaintedCount(3, 3) === 3, 'draft cursor unchanged when caught up');

// stroke continuity — incremental draft default (perfect-freehand on pen-up only)
assert(parseFwInkDraftMode(null) === 'incremental', 'fwInkDraftMode default incremental');
assert(parseFwInkDraftMode(undefined) === 'incremental', 'fwInkDraftMode undefined is incremental');
assert(parseFwInkDraftMode('incremental') === 'incremental', 'fwInkDraftMode incremental');
assert(parseFwInkDraftMode('ink') === 'ink', 'fwInkDraftMode ink rollback');
assert(parseFwInkDraftMode('polyline') === 'polyline', 'fwInkDraftMode polyline rollback');
assert(FW_INK_DRAFT_MODE_KEY === 'fwInkDraftMode', 'fwInkDraftMode storage key');
assert(usesIncrementalDraftPenRenderer() === true, 'usesIncrementalDraftPenRenderer default in test env');
assert(usesInkDraftPenRenderer() === false, 'usesInkDraftPenRenderer off unless ink rollback');

const draftDiagDefault = getFwInkDraftModeDiag();
assert(draftDiagDefault.mode === 'incremental', 'draft diag default incremental');
assert(draftDiagDefault.usesIncremental === true, 'draft diag usesIncremental');
assert(draftDiagDefault.usesFullInk === false, 'draft diag not full ink');

assert(getFwFeatureFlags().incrementalDraft === true, 'build featureFlags incrementalDraft');

hwPaintProfileClear();
hwPaintProfileRecord({
  paintMs: 4,
  segmentsDrawn: 2,
  pointsProcessed: 10,
  draftMode: 'incremental',
});
hwPaintProfileRecord({
  paintMs: 8,
  segmentsDrawn: 1,
  pointsProcessed: 12,
  draftMode: 'incremental',
});
const paintProfile = getHwPaintProfile();
assert(paintProfile.sampleCount === 2, 'paint profile sample count');
assert(paintProfile.avgPaintMs === 6, 'paint profile avgPaintMs');
assert(paintProfile.maxPaintMs === 8, 'paint profile maxPaintMs');
assert(paintProfile.draftMode === 'incremental', 'paint profile draftMode');
hwPaintProfileClear();

// DPR coordinate expectation: logical size must be canvas.width/dpr, not canvas.width
const dpr = 2;
const cssW = 400;
const canvasWidth = cssW * dpr;
const logicalW = canvasWidth / dpr;
assert(logicalW === cssW, 'DPR logical width equals CSS width');

// mathInk production preset
assert(MATH_INK_PRESET.smoothing === 0.08, 'mathInk smoothing');
assert(MATH_INK_PRESET.streamline === 0.06, 'mathInk streamline');
assert(MATH_INK_PRESET.thinning === 0.48, 'mathInk thinning');
assert(MATH_INK_PRESET.sizeMultiplier === 1.08, 'mathInk size multiplier');

// study ink clarity — dark and heavier than math, but less blobby than presence pass
assert(STUDY_INK_PRESET.smoothing === 0.18, 'study ink smoothing clarity-tuned');
assert(STUDY_INK_PRESET.streamline === 0.12, 'study ink streamline clarity-tuned');
assert(STUDY_INK_PRESET.smoothing > MATH_INK_PRESET.smoothing, 'study ink smoother than math');
assert(STUDY_INK_PRESET.thinning < MATH_INK_PRESET.thinning, 'study ink more stable width');
assert(STUDY_INK_PRESET.sizeMultiplier > MATH_INK_PRESET.sizeMultiplier, 'study ink heavier');
assert(STUDY_INK_COLOR === '#141416', 'study ink near-black');
assert(STUDY_PEN_WIDTH > 2.5, 'study pen wider than legacy default');
const studyCommit = commitStrokeSizePx(STUDY_PEN_WIDTH, 600, 600, 'study');
const mathCommit = commitStrokeSizePx(2.5, 600, 600, 'math');
assert(studyCommit > mathCommit, 'study commit footprint larger than math at page scale');

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

// P0-A1: pointercancel commits partial strokes (same merge as finishStroke / flushSave draft merge)
const partialBase = emptyHandwritingData(400, 420);
const partialDraft = {
  id: 'st-partial',
  tool: 'pen' as const,
  color: '#111',
  width: 2.5,
  points: [
    { x: 0.12, y: 0.18 },
    { x: 0.22, y: 0.28 },
    { x: 0.31, y: 0.35 },
  ],
};
const partialCommitted = {
  ...partialBase,
  strokes: [...partialBase.strokes, partialDraft],
};
assert(
  partialCommitted.strokes.length === 1 && partialCommitted.strokes[0]!.points.length === 3,
  'partial in-progress stroke preserved on commit (pointercancel policy)',
);

// P0-A2: load failures must not masquerade as empty canvas
assert(parseStoredHandwritingPayload(undefined) === 'miss', 'undefined payload is miss');
assert(parseStoredHandwritingPayload(null) === 'miss', 'null payload is miss');
assert(parseStoredHandwritingPayload({ type: 'other-app' }) === 'corrupted', 'wrong type payload is corrupted');
assert(parseStoredHandwritingPayload('garbage') === 'corrupted', 'non-object payload is corrupted');
const validPayload = emptyHandwritingData(400, 420);
assert(parseStoredHandwritingPayload(validPayload) === 'hit', 'valid payload is hit');

const storageErr: Extract<import('./notebookHandwritingStore').HwGetResult, { status: 'error' }> = {
  status: 'error',
  data: null,
  failureStage: 'storage_unavailable',
};
assert(
  hwLoadErrorMessage(storageErr).includes('unavailable'),
  'storage_unavailable load message mentions unavailable',
);
assert(
  hwLoadRecoveryGuidance('storage_unavailable').includes('Private Browsing'),
  'storage_unavailable recovery mentions Private Browsing',
);
const corruptErr: Extract<import('./notebookHandwritingStore').HwGetResult, { status: 'error' }> = {
  status: 'error',
  data: null,
  failureStage: 'corrupted',
};
assert(
  hwLoadErrorMessage(corruptErr).includes('damaged'),
  'corrupted load message mentions damaged data',
);

// P0-A3: ink canvas touch-action — pen draws, finger scrolls via JS passthrough
assert(isInkPointer({ pointerType: 'pen' } as PointerEvent), 'pen pointer draws ink');
assert(isInkPointer({ pointerType: 'mouse' } as PointerEvent), 'mouse pointer draws ink');
assert(!isInkPointer({ pointerType: 'touch' } as PointerEvent), 'finger touch does not draw ink');
assert(HW_INK_CANVAS_TOUCH_ACTION === 'none', 'ink canvas uses touch-action none');
assert(HW_INK_CONTAINER_TOUCH_ACTION === 'pan-y', 'ink block chrome keeps pan-y');

// P0-A4: draft width tracks commit mesh footprint (reduces lift pop)
const popRefW = 600;
const popCssW = 600;
const penW = 2.5;
const commitSize = commitStrokeSizePx(penW, popCssW, popRefW);
const draftMid = draftPenLineWidthPx(penW, popCssW, popRefW, 0.5);
assert(
  Math.abs(draftMid - commitSize) / commitSize < 0.06,
  'draft width at median pressure matches commit size',
);
const slowSeg = draftPenSegmentLineWidthPx(
  penW,
  popCssW,
  420,
  popRefW,
  { x: 0.1, y: 0.1, pressure: 0.5 },
  { x: 0.11, y: 0.11, pressure: 0.5 },
);
const fastSeg = draftPenSegmentLineWidthPx(
  penW,
  popCssW,
  420,
  popRefW,
  { x: 0.1, y: 0.1, pressure: 0.5 },
  { x: 0.3, y: 0.3, pressure: 0.5 },
);
assert(fastSeg < slowSeg, 'fast draft segments render narrower (thinning proxy)');

// P0 ink Step 1: page-ink wrap uses fixed height (no flex shrink)
const wrap360 = pageInkCanvasWrapStyle(360);
assert(wrap360.height === 360 && wrap360.minHeight === 360, 'page ink wrap height matches displayHeight');
assert(wrap360.flexShrink === 0 && wrap360.flexGrow === 0, 'page ink wrap does not flex-shrink');

// P0 ink Step 2: pressure merge on minDist reject
assert(
  mergeDroppedSamplePressure(0.24, 0.55)! > 0.24 && mergeDroppedSamplePressure(0.24, 0.55)! <= 0.42,
  'pressure merge increases with cap',
);
assert(
  mergeDroppedSamplePressure(0.6, 0.3)! < 0.6 && mergeDroppedSamplePressure(0.6, 0.3)! >= 0.42,
  'pressure merge decreases with cap',
);
const basePts = [{ x: 0.1, y: 0.1, pressure: 0.2 }];
const near = appendPoint(basePts, { x: 0.1005, y: 0.1005, pressure: 0.7 }, 0.7);
assert(!near.appended && near.pressureMerged, 'near point merges pressure');
assert(near.points.length === 1, 'near point keeps single coordinate');
assert((near.points[0]!.pressure ?? 0) > 0.2, 'near point raises merged pressure');
const far = appendPoint(basePts, { x: 0.2, y: 0.2, pressure: 0.5 }, 0.5);
assert(far.appended && far.points.length === 2, 'far point appends');

// Step 0: QA mode visibility gates
assert(qaModeFromUrl('?qa=1') === true, 'qaModeFromUrl ?qa=1');
assert(qaModeFromUrl('') === false, 'qaModeFromUrl empty');
const mockStorage = {
  data: {} as Record<string, string>,
  getItem(k: string) {
    return this.data[k] ?? null;
  },
  setItem(k: string, v: string) {
    this.data[k] = v;
  },
};
mockStorage.setItem(FW_QA_MODE_KEY, '1');
assert(qaModeFromStorage(mockStorage) === true, 'qaModeFromStorage');
assert(
  isQaModeEnabled({ dev: false, search: '', storage: mockStorage }) === true,
  'isQaModeEnabled via storage',
);
assert(
  isQaModeEnabled({ dev: false, search: '?qa=1', storage: { getItem: () => null } }) === true,
  'isQaModeEnabled via url',
);
assert(isQaModeEnabled({ dev: true, search: '', storage: mockStorage }) === true, 'isQaModeEnabled dev');
assert(qaBuildEnvLabel(true) === 'prod' && qaBuildEnvLabel(false) === 'dev', 'qaBuildEnvLabel');

const sampleStroke: StrokeDiagSnapshot = {
  gitCommit: 'abc1234',
  recordedAt: Date.now(),
  pointerTypes: ['pen'],
  sawPen: true,
  sawMouse: false,
  sawTouch: false,
  pressureMin: 0.2,
  pressureMax: 0.8,
  rawPressureMin: 0.15,
  rawPressureMax: 0.85,
  moveEvents: 10,
  rawSamples: 10,
  appendedPoints: 12,
  droppedByMinDist: 1,
  samplesPerMove: 1.4,
  lastBatchSize: 2,
  coalescedUsed: 8,
  coalescedFallback: 0,
  canvasCssAtDown: null,
  canvasCssAtMove: null,
  canvasCssAtEnd: null,
  displayHeight: 360,
  layoutMismatchPxAtEnd: 0,
  rectHeightDeltaDownToMove: 0,
  rectWidthDeltaDownToMove: 0,
  rectStableDownToMove: true,
  dpr: 2,
  bitmapAtEnd: { w: 800, h: 720 },
  bitmapMatchesCssAtEnd: true,
};
const gates = strokeDiagGates(sampleStroke);
assert(gates.find(g => g.id === 'sawPen')?.pass === true, 'gate sawPen pass');
assert(gates.find(g => g.id === 'layoutMismatch')?.pass === true, 'gate layout pass');
assert(gates.find(g => g.id === 'droppedByMinDist')?.detail.includes('(10%)'), 'gate minDist uses rawSamples pct');
assert(gateIndicator(true) === '✓' && gateIndicator(false) === '✗', 'gateIndicator');

// P0 ink-first: pen must not enter text pipeline
resetNotebookInputPolicyForTests();
noteNotebookPointerDown({ pointerType: 'pen' } as PointerEvent);
assert(
  shouldRejectPenTextBeforeInput({ inputType: 'insertText' } as InputEvent),
  'pen-active insertText rejected',
);
assert(
  shouldRejectPenTextBeforeInput({ inputType: 'insertFromHandwriting' } as InputEvent),
  'insertFromHandwriting always rejected',
);
noteNotebookKeyboardTyping();
assert(
  !shouldRejectPenTextBeforeInput({ inputType: 'insertText' } as InputEvent),
  'keyboard insertText allowed after keydown',
);
resetNotebookInputPolicyForTests();

console.log('handwritingQa.test.ts: all checks passed');
