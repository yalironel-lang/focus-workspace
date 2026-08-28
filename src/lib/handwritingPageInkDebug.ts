/**
 * Internal page-ink persistence diagnostics (window.__fwPageInkDebug()).
 */

import { getGitCommit } from './appBuildInfo';
import type { IndexedDbEnvironmentReport } from './indexedDbEnvironment';
import { PAGE_INK_BLOCK_KEY } from './handwritingTypes';

export type PageInkDebugSnapshot = {
  gitCommit: string;
  objectId: string | null;
  blockKey: string;
  storageKey: string | null;
  memoryStrokeCount: number;
  lastHwSetStrokeCount: number | null;
  lastHwSetOk: boolean | null;
  lastHwSetStage: string | null;
  lastHwSetAt: number | null;
  lastPostSaveVerifyStrokeCount: number | null;
  lastHwGetStrokeCount: number | null;
  lastHwGetSource: string | null;
  lastHwGetAt: number | null;
  persistBackend: string;
  hydratedStrokeCount: number | null;
  dataRefStrokeCountAfterHydrate: number | null;
  redrawCalledAfterHydrate: boolean;
  canvasSizeAtHydrate: string | null;
  canvasSizeAtRedraw: string | null;
  lastPaintStatus: string | null;
  lastSaveStatus: string;
  lastHydrateStatus: string;
  lastHydrateStrokeCount: number | null;
  lastFlushReason: string | null;
  lastFlushPayloadStrokes: number | null;
  lastFlushOk: boolean | null;
  objectIdHistory: string[];
  lastIdbErrorName: string | null;
  lastIdbErrorMessage: string | null;
  lastIdbErrorOp: string | null;
  lastIdbTxState: string | null;
  dbState: string;
  idbResolved: boolean;
  idbPrivateHint: string;
  idbDisplayMode: string;
};

const state: PageInkDebugSnapshot = {
  gitCommit: getGitCommit(),
  objectId: null,
  blockKey: PAGE_INK_BLOCK_KEY,
  storageKey: null,
  memoryStrokeCount: 0,
  lastHwSetStrokeCount: null,
  lastHwSetOk: null,
  lastHwSetStage: null,
  lastHwSetAt: null,
  lastPostSaveVerifyStrokeCount: null,
  lastHwGetStrokeCount: null,
  lastHwGetSource: null,
  lastHwGetAt: null,
  persistBackend: 'unknown',
  hydratedStrokeCount: null,
  dataRefStrokeCountAfterHydrate: null,
  redrawCalledAfterHydrate: false,
  canvasSizeAtHydrate: null,
  canvasSizeAtRedraw: null,
  lastPaintStatus: null,
  lastSaveStatus: '—',
  lastHydrateStatus: '—',
  lastHydrateStrokeCount: null,
  lastFlushReason: null,
  lastFlushPayloadStrokes: null,
  lastFlushOk: null,
  objectIdHistory: [],
  lastIdbErrorName: null,
  lastIdbErrorMessage: null,
  lastIdbErrorOp: null,
  lastIdbTxState: null,
  dbState: 'unknown',
  idbResolved: false,
  idbPrivateHint: 'unknown',
  idbDisplayMode: 'unknown',
};

function touchState(): void {
  state.gitCommit = getGitCommit();
}

function trackObjectId(objectId: string): void {
  state.objectId = objectId;
  state.storageKey = `${objectId}:${PAGE_INK_BLOCK_KEY}`;
  if (!state.objectIdHistory.includes(objectId)) {
    state.objectIdHistory = [...state.objectIdHistory.slice(-4), objectId];
  }
}

export function getPageInkDebugSnapshot(): PageInkDebugSnapshot {
  return { ...state, objectIdHistory: [...state.objectIdHistory] };
}

/** Test-only: reset module-level page-ink diagnostic snapshot. */
export function resetPageInkDebugForTests(): void {
  state.gitCommit = getGitCommit();
  state.objectId = null;
  state.blockKey = PAGE_INK_BLOCK_KEY;
  state.storageKey = null;
  state.memoryStrokeCount = 0;
  state.lastHwSetStrokeCount = null;
  state.lastHwSetOk = null;
  state.lastHwSetStage = null;
  state.lastHwSetAt = null;
  state.lastPostSaveVerifyStrokeCount = null;
  state.lastHwGetStrokeCount = null;
  state.lastHwGetSource = null;
  state.lastHwGetAt = null;
  state.persistBackend = 'unknown';
  state.hydratedStrokeCount = null;
  state.dataRefStrokeCountAfterHydrate = null;
  state.redrawCalledAfterHydrate = false;
  state.canvasSizeAtHydrate = null;
  state.canvasSizeAtRedraw = null;
  state.lastPaintStatus = null;
  state.lastSaveStatus = '—';
  state.lastHydrateStatus = '—';
  state.lastHydrateStrokeCount = null;
  state.lastFlushReason = null;
  state.lastFlushPayloadStrokes = null;
  state.lastFlushOk = null;
  state.objectIdHistory = [];
  state.lastIdbErrorName = null;
  state.lastIdbErrorMessage = null;
  state.lastIdbErrorOp = null;
  state.lastIdbTxState = null;
  state.dbState = 'unknown';
  state.idbResolved = false;
  state.idbPrivateHint = 'unknown';
  state.idbDisplayMode = 'unknown';
}

export function recordPageInkMemory(objectId: string, strokeCount: number): void {
  trackObjectId(objectId);
  state.memoryStrokeCount = strokeCount;
  touchState();
}

export function recordPageInkHwSet(
  objectId: string,
  strokeCount: number,
  ok: boolean,
  stage: string | null,
  errorName?: string | null,
  errorMessage?: string | null,
): void {
  trackObjectId(objectId);
  state.lastHwSetStrokeCount = strokeCount;
  state.lastHwSetOk = ok;
  state.lastHwSetStage = stage;
  state.lastHwSetAt = Date.now();
  if (!ok && errorName) {
    state.lastIdbErrorName = errorName;
    state.lastIdbErrorMessage = errorMessage ?? null;
    state.lastIdbErrorOp = stage ?? 'set';
  }
  state.lastSaveStatus = ok
    ? `ok (${strokeCount} strokes)`
    : `FAIL ${stage ?? 'unknown'} (${strokeCount} sent)${errorName ? `: ${errorName}` : ''}`;
  touchState();
}

export function recordPageInkPostSaveVerify(idbStrokeCount: number, writtenStrokeCount: number): void {
  state.lastPostSaveVerifyStrokeCount = idbStrokeCount;
  state.lastSaveStatus += ` | idb verify=${idbStrokeCount}/${writtenStrokeCount}`;
  touchState();
}

export function recordPageInkHwGet(
  objectId: string,
  strokeCount: number,
  source: 'cache' | 'idb' | 'localStorage' | 'miss' | 'error',
): void {
  trackObjectId(objectId);
  state.lastHwGetStrokeCount = strokeCount;
  state.lastHwGetSource = source;
  state.lastHwGetAt = Date.now();
  touchState();
}

export function recordPageInkHydrate(
  objectId: string,
  found: boolean,
  strokeCount: number,
): void {
  trackObjectId(objectId);
  state.lastHydrateStrokeCount = strokeCount;
  state.lastHydrateStatus = found ? `found ${strokeCount} strokes` : 'miss (empty new)';
  touchState();
}

export function recordPageInkPersist(
  objectId: string,
  strokeCount: number,
  ok: boolean,
  reason: string,
  stage?: string,
): void {
  trackObjectId(objectId);
  state.lastSaveStatus = ok
    ? `persist ok (${strokeCount}, ${reason})`
    : `persist FAIL ${stage ?? '?'} (${strokeCount}, ${reason})`;
  touchState();
}

export function recordPageInkFlush(
  objectId: string,
  reason: string,
  payloadStrokes: number | null,
  ok: boolean,
): void {
  trackObjectId(objectId);
  state.lastFlushReason = reason;
  state.lastFlushPayloadStrokes = payloadStrokes;
  state.lastFlushOk = ok;
  touchState();
}

export function recordPageInkIdbFailure(
  op: string,
  error: { name: string; message: string },
  dbState: string,
  txState?: string | null,
): void {
  state.lastIdbErrorOp = op;
  state.lastIdbErrorName = error.name;
  state.lastIdbErrorMessage = error.message;
  state.dbState = dbState;
  state.lastIdbTxState = txState ?? null;
  touchState();
}

export function recordPageInkDbState(dbState: string, env: IndexedDbEnvironmentReport): void {
  state.dbState = dbState;
  state.idbResolved = env.resolved;
  state.idbPrivateHint = env.privateModeHint;
  state.idbDisplayMode = env.displayMode;
  touchState();
}

export function recordPageInkPersistBackend(backend: string): void {
  state.persistBackend = backend;
  touchState();
}

export function recordPageInkRenderState(patch: {
  hydratedStrokeCount?: number | null;
  dataRefStrokeCountAfterHydrate?: number | null;
  redrawCalledAfterHydrate?: boolean;
  canvasSizeAtHydrate?: string | null;
  canvasSizeAtRedraw?: string | null;
  lastPaintStatus?: string | null;
}): void {
  if (patch.hydratedStrokeCount !== undefined) state.hydratedStrokeCount = patch.hydratedStrokeCount;
  if (patch.dataRefStrokeCountAfterHydrate !== undefined) {
    state.dataRefStrokeCountAfterHydrate = patch.dataRefStrokeCountAfterHydrate;
  }
  if (patch.redrawCalledAfterHydrate !== undefined) {
    state.redrawCalledAfterHydrate = patch.redrawCalledAfterHydrate;
  }
  if (patch.canvasSizeAtHydrate !== undefined) state.canvasSizeAtHydrate = patch.canvasSizeAtHydrate;
  if (patch.canvasSizeAtRedraw !== undefined) state.canvasSizeAtRedraw = patch.canvasSizeAtRedraw;
  if (patch.lastPaintStatus !== undefined) state.lastPaintStatus = patch.lastPaintStatus;
  touchState();
}

declare global {
  interface Window {
    __fwPageInkDebug?: () => PageInkDebugSnapshot;
  }
}

if (typeof window !== 'undefined') {
  window.__fwPageInkDebug = getPageInkDebugSnapshot;
}
