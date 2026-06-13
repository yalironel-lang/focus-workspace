/**
 * Temporary page-ink persistence diagnostics (iPad-visible panel + window API).
 * Remove after root cause is confirmed.
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

const listeners = new Set<() => void>();

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

function notify(): void {
  state.gitCommit = getGitCommit();
  listeners.forEach(fn => fn());
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

export function subscribePageInkDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recordPageInkMemory(objectId: string, strokeCount: number): void {
  trackObjectId(objectId);
  state.memoryStrokeCount = strokeCount;
  notify();
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
  notify();
}

export function recordPageInkPostSaveVerify(idbStrokeCount: number, writtenStrokeCount: number): void {
  state.lastPostSaveVerifyStrokeCount = idbStrokeCount;
  state.lastSaveStatus += ` | idb verify=${idbStrokeCount}/${writtenStrokeCount}`;
  notify();
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
  notify();
}

export function recordPageInkHydrate(
  objectId: string,
  found: boolean,
  strokeCount: number,
): void {
  trackObjectId(objectId);
  state.lastHydrateStrokeCount = strokeCount;
  state.lastHydrateStatus = found ? `found ${strokeCount} strokes` : 'miss (empty new)';
  notify();
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
  notify();
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
  notify();
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
  notify();
}

export function recordPageInkDbState(dbState: string, env: IndexedDbEnvironmentReport): void {
  state.dbState = dbState;
  state.idbResolved = env.resolved;
  state.idbPrivateHint = env.privateModeHint;
  state.idbDisplayMode = env.displayMode;
  notify();
}

export function recordPageInkPersistBackend(backend: string): void {
  state.persistBackend = backend;
  notify();
}

declare global {
  interface Window {
    __fwPageInkDebug?: () => PageInkDebugSnapshot;
  }
}

if (typeof window !== 'undefined') {
  window.__fwPageInkDebug = getPageInkDebugSnapshot;
}
