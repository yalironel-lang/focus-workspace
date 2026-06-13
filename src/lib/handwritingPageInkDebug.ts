/**
 * Temporary page-ink persistence diagnostics (iPad-visible panel + window API).
 * Remove after root cause is confirmed.
 */

import { getGitCommit } from './appBuildInfo';
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
  lastSaveStatus: string;
  lastHydrateStatus: string;
  lastHydrateStrokeCount: number | null;
  lastFlushReason: string | null;
  lastFlushPayloadStrokes: number | null;
  lastFlushOk: boolean | null;
  objectIdHistory: string[];
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
  lastSaveStatus: '—',
  lastHydrateStatus: '—',
  lastHydrateStrokeCount: null,
  lastFlushReason: null,
  lastFlushPayloadStrokes: null,
  lastFlushOk: null,
  objectIdHistory: [],
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
): void {
  trackObjectId(objectId);
  state.lastHwSetStrokeCount = strokeCount;
  state.lastHwSetOk = ok;
  state.lastHwSetStage = stage;
  state.lastHwSetAt = Date.now();
  state.lastSaveStatus = ok
    ? `ok (${strokeCount} strokes)`
    : `FAIL ${stage ?? 'unknown'} (${strokeCount} sent)`;
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
  source: 'cache' | 'idb' | 'miss' | 'error',
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

declare global {
  interface Window {
    __fwPageInkDebug?: () => PageInkDebugSnapshot;
  }
}

if (typeof window !== 'undefined') {
  window.__fwPageInkDebug = getPageInkDebugSnapshot;
}
