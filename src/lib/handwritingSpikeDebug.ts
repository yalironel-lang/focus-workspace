/**
 * Dev-only iPad handwriting spike diagnostics.
 * Works on device via sessionStorage + Safari console (fetch may not reach Mac).
 *
 * Console:
 *   __fwHwSpikeHelp()
 *   __fwHwSpikeDump()
 *   __fwHwSpikeSet({ coalesced: 'off', pressure: 'fixed', render: 'polyline', smoothing: 'low', minDist: 'fine' })
 */

export type HwSpikeCoalesced = 'auto' | 'off';
export type HwSpikePressure = 'real' | 'fixed';
export type HwSpikeSmoothing = 'low' | 'high';
export type HwSpikeMinDist = 'normal' | 'fine';
export type HwSpikeRender = 'polyline' | 'ink';

export type HwSpikeSettings = {
  coalesced: HwSpikeCoalesced;
  pressure: HwSpikePressure;
  smoothing: HwSpikeSmoothing;
  minDist: HwSpikeMinDist;
  render: HwSpikeRender;
};

const STORAGE_KEY = 'fw_hw_spike_log_v1';
const MAX_LOG = 120;

const DEFAULTS: HwSpikeSettings = {
  coalesced: 'auto',
  pressure: 'real',
  smoothing: 'low',
  minDist: 'normal',
  render: 'ink',
};

import { isHandwritingDevBuild } from './handwritingRenderMode';

function isDevBuild(): boolean {
  return isHandwritingDevBuild();
}

declare global {
  interface Window {
    __fwHwSpike?: Partial<HwSpikeSettings>;
    __fwHwSpikeSet?: (partial: Partial<HwSpikeSettings>) => HwSpikeSettings;
    __fwHwSpikeGet?: () => HwSpikeSettings;
    __fwHwSpikeDump?: () => HwSpikeLogEntry[];
    __fwHwSpikeHelp?: () => void;
    __fwHwSpikeClear?: () => void;
  }
}

export type HwSpikeLogEntry = {
  t: number;
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
};

export function getHwSpikeSettings(): HwSpikeSettings {
  if (!isDevBuild() || typeof window === 'undefined') return { ...DEFAULTS };
  return { ...DEFAULTS, ...window.__fwHwSpike };
}

export function setHwSpikeSettings(partial: Partial<HwSpikeSettings>): HwSpikeSettings {
  if (!isDevBuild() || typeof window === 'undefined') return { ...DEFAULTS };
  window.__fwHwSpike = { ...getHwSpikeSettings(), ...partial };
  window.dispatchEvent(new CustomEvent('fw-hw-spike-settings', { detail: window.__fwHwSpike }));
  return getHwSpikeSettings();
}

function readLogBuffer(): HwSpikeLogEntry[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as HwSpikeLogEntry[];
  } catch {
    return [];
  }
}

function writeLogBuffer(entries: HwSpikeLogEntry[]): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_LOG)));
  } catch {
    /* quota */
  }
}

export function hwSpikeLog(
  hypothesisId: string,
  location: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!isDevBuild()) return;
  const entry: HwSpikeLogEntry = {
    t: Date.now(),
    hypothesisId,
    location,
    message,
    data,
  };
  const buf = readLogBuffer();
  buf.push(entry);
  writeLogBuffer(buf);
  // #region agent log
  fetch('http://127.0.0.1:7714/ingest/e6af15d9-7b0a-4fc6-884e-236751805517', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7fb648' },
    body: JSON.stringify({
      sessionId: '7fb648',
      hypothesisId,
      location,
      message,
      data,
      timestamp: entry.t,
      runId: 'ipad-spike',
    }),
  }).catch(() => {});
  // #endregion
  if (isDevBuild()) {
    console.debug(`[hw-spike ${hypothesisId}] ${message}`, data ?? '');
  }
}

export function hwSpikeDump(): HwSpikeLogEntry[] {
  return readLogBuffer();
}

export function hwSpikeClear(): void {
  writeLogBuffer([]);
}

/** Per-stroke counters reset at stroke start, read at stroke end. */
export type StrokeSampleStats = {
  moveEvents: number;
  rawSamples: number;
  appendedPoints: number;
  droppedByMinDist: number;
  coalescedUsed: number;
  coalescedFallback: number;
  lastPick?: { batchSize: number; usedCoalesced: boolean; fallbackReason?: string };
};

let strokeStats: StrokeSampleStats = emptyStrokeStats();

function emptyStrokeStats(): StrokeSampleStats {
  return {
    moveEvents: 0,
    rawSamples: 0,
    appendedPoints: 0,
    droppedByMinDist: 0,
    coalescedUsed: 0,
    coalescedFallback: 0,
  };
}

export function resetStrokeSampleStats(): void {
  strokeStats = emptyStrokeStats();
}

export function getStrokeSampleStats(): StrokeSampleStats {
  return { ...strokeStats };
}

export function recordMovePick(
  batchSize: number,
  usedCoalesced: boolean,
  fallbackReason?: string,
): void {
  strokeStats.moveEvents += 1;
  strokeStats.rawSamples += batchSize;
  strokeStats.lastPick = { batchSize, usedCoalesced, fallbackReason };
  if (usedCoalesced) strokeStats.coalescedUsed += 1;
  else if (fallbackReason && fallbackReason !== 'no_api' && fallbackReason !== 'dev_off') {
    strokeStats.coalescedFallback += 1;
  }
}

export function recordPointAppended(): void {
  strokeStats.appendedPoints += 1;
}

export function recordPointDropped(): void {
  strokeStats.droppedByMinDist += 1;
}

export function getMinPointDistNorm(): number {
  return getHwSpikeSettings().minDist === 'fine' ? 0.0005 : 0.002;
}

export function useFixedPressure(): boolean {
  return getHwSpikeSettings().pressure === 'fixed';
}

export function printSpikeHelp(): void {
  console.log(`
Handwriting iPad spike debug
  __fwHwSpikeGet()   — current settings
  __fwHwSpikeSet({}) — update settings, then redraw
  __fwHwSpikeDump()  — session log (works on iPad)
  __fwHwSpikeClear() — clear log

Settings:
  coalesced: 'auto' | 'off'
  pressure:  'real' | 'fixed'
  render:    'polyline' | 'ink'
  smoothing: 'low' | 'high'   (ink mode only)
  minDist:   'normal' | 'fine' (point dedupe threshold)

Suggested A/B on iPad:
  1) { coalesced:'off', render:'polyline', pressure:'fixed', minDist:'fine' }
  2) { coalesced:'auto', render:'polyline', pressure:'real', minDist:'normal' }
  3) { coalesced:'off', render:'ink', smoothing:'low', pressure:'fixed' }
`);
}

function prodSpikeDevOnly(): void {
  console.info(
    '[handwriting] Spike debug commands are dev-only (npm run dev). Production uses stable polyline rendering.',
  );
}

if (typeof window !== 'undefined') {
  if (isDevBuild()) {
    window.__fwHwSpikeSet = setHwSpikeSettings;
    window.__fwHwSpikeGet = getHwSpikeSettings;
    window.__fwHwSpikeDump = hwSpikeDump;
    window.__fwHwSpikeClear = hwSpikeClear;
    window.__fwHwSpikeHelp = printSpikeHelp;
    // #region agent log
    fetch('http://127.0.0.1:7714/ingest/e6af15d9-7b0a-4fc6-884e-236751805517', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7fb648' },
      body: JSON.stringify({
        sessionId: '7fb648',
        hypothesisId: 'H-globals',
        location: 'handwritingSpikeDebug.ts:init',
        message: 'spike globals registered (dev)',
        data: { dev: true },
        timestamp: Date.now(),
        runId: 'post-fix',
      }),
    }).catch(() => {});
    // #endregion
  } else {
    const prodDefaults = (): HwSpikeSettings => ({ ...DEFAULTS });
    window.__fwHwSpikeSet = () => {
      prodSpikeDevOnly();
      return prodDefaults();
    };
    window.__fwHwSpikeGet = prodDefaults;
    window.__fwHwSpikeDump = () => {
      prodSpikeDevOnly();
      return [];
    };
    window.__fwHwSpikeClear = prodSpikeDevOnly;
    window.__fwHwSpikeHelp = prodSpikeDevOnly;
    // #region agent log
    fetch('http://127.0.0.1:7714/ingest/e6af15d9-7b0a-4fc6-884e-236751805517', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7fb648' },
      body: JSON.stringify({
        sessionId: '7fb648',
        hypothesisId: 'H-globals',
        location: 'handwritingSpikeDebug.ts:init',
        message: 'spike globals registered (prod noop)',
        data: { dev: false },
        timestamp: Date.now(),
        runId: 'post-fix',
      }),
    }).catch(() => {});
    // #endregion
  }
}
