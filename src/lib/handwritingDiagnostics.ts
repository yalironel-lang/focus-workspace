/**
 * Ring-buffer diagnostics for handwriting save/align hardening.
 * Readable on iPad via Safari Web Inspector: window.__fwHwDiagDump()
 */

export type HwDiagEntry = {
  t: number;
  location: string;
  message: string;
  data?: Record<string, unknown>;
};

/**
 * Gate for hot-path diagnostic recording. Returns true in dev builds, or in
 * production when QA opts in at runtime via `window.__fwHwDiag = true`.
 * Production drawing does zero per-sample diagnostic work by default while all
 * `window.__fwHw*` dump hooks stay available when enabled.
 */
export function hwDiagActive(): boolean {
  const dev = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;
  if (dev) return true;
  return typeof window !== 'undefined' && window.__fwHwDiag === true;
}

const MAX_ENTRIES = 80;
const buffer: HwDiagEntry[] = [];

export function hwDiagLog(
  location: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const entry: HwDiagEntry = { t: Date.now(), location, message, data };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  if (import.meta.env.DEV) {
    console.debug(`[hw] ${location}: ${message}`, data ?? '');
  }
}

export function hwDiagDump(): HwDiagEntry[] {
  return [...buffer];
}

type PressureSession = {
  min: number;
  max: number;
  samples: number;
  penSamples: number;
  lastPointerType: string | null;
};

const pressureSession: PressureSession = {
  min: Infinity,
  max: -Infinity,
  samples: 0,
  penSamples: 0,
  lastPointerType: null,
};

/** Record a pressure sample for dev/iPad verification (no storage impact). */
export function hwDiagRecordPressure(
  pressure: number,
  pointerType: string,
): void {
  if (!hwDiagActive()) return;
  if (!Number.isFinite(pressure)) return;
  pressureSession.samples += 1;
  pressureSession.lastPointerType = pointerType;
  if (pointerType === 'pen') pressureSession.penSamples += 1;
  if (pressure > 0) {
    pressureSession.min = Math.min(pressureSession.min, pressure);
    pressureSession.max = Math.max(pressureSession.max, pressure);
  }
}

export function hwDiagPressureSummary(): PressureSession & {
  hasRange: boolean;
} {
  const hasRange = pressureSession.min <= pressureSession.max && pressureSession.max > 0;
  return {
    ...pressureSession,
    min: hasRange ? pressureSession.min : 0,
    max: hasRange ? pressureSession.max : 0,
    hasRange,
  };
}

export function hwDiagResetPressureSession(): void {
  pressureSession.min = Infinity;
  pressureSession.max = -Infinity;
  pressureSession.samples = 0;
  pressureSession.penSamples = 0;
  pressureSession.lastPointerType = null;
}

declare global {
  interface Window {
    /** Opt in to hot-path handwriting diagnostics in production builds. */
    __fwHwDiag?: boolean;
    __fwHwDiagDump?: () => HwDiagEntry[];
    __fwHwPressureSummary?: () => ReturnType<typeof hwDiagPressureSummary>;
    __fwHwSamplingDump?: () => HwSamplingStrokeSummary[];
    __fwHwSamplingLast?: () => HwSamplingStrokeSummary | null;
  }
}

/** Per-stroke pointer sampling counters (production-safe, iPad console). */
export type HwSamplingStrokeSummary = {
  t: number;
  moveEvents: number;
  rawSamples: number;
  appendedPoints: number;
  droppedByMinDist: number;
  coalescedBatches: number;
  coalescedFallbacks: number;
  committedPoints: number;
  samplesPerMove: number;
  coalescedEnabled: boolean;
  lastPick?: {
    batchSize: number;
    usedCoalesced: boolean;
    fallbackReason?: string;
  };
};

const SAMPLING_LOG_KEY = 'fw_hw_sampling_diag_v1';
const SAMPLING_LOG_MAX = 20;

let strokeSampling: Omit<
  HwSamplingStrokeSummary,
  't' | 'committedPoints' | 'samplesPerMove' | 'coalescedEnabled'
> = emptyStrokeSampling();

function emptyStrokeSampling(): Omit<
  HwSamplingStrokeSummary,
  't' | 'committedPoints' | 'samplesPerMove' | 'coalescedEnabled'
> {
  return {
    moveEvents: 0,
    rawSamples: 0,
    appendedPoints: 0,
    droppedByMinDist: 0,
    coalescedBatches: 0,
    coalescedFallbacks: 0,
  };
}

function readSamplingLog(): HwSamplingStrokeSummary[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(SAMPLING_LOG_KEY) ?? '[]') as HwSamplingStrokeSummary[];
  } catch {
    return [];
  }
}

function writeSamplingLog(entries: HwSamplingStrokeSummary[]): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SAMPLING_LOG_KEY, JSON.stringify(entries.slice(-SAMPLING_LOG_MAX)));
  } catch {
    /* quota / private mode */
  }
}

export function hwDiagResetStrokeSampling(): void {
  strokeSampling = emptyStrokeSampling();
}

export function hwDiagRecordSamplingPick(
  batchSize: number,
  usedCoalesced: boolean,
  fallbackReason?: string,
): void {
  if (!hwDiagActive()) return;
  strokeSampling.moveEvents += 1;
  strokeSampling.rawSamples += batchSize;
  strokeSampling.lastPick = { batchSize, usedCoalesced, fallbackReason };
  if (usedCoalesced) {
    strokeSampling.coalescedBatches += 1;
  } else if (fallbackReason && fallbackReason !== 'no_api' && fallbackReason !== 'dev_off') {
    strokeSampling.coalescedFallbacks += 1;
  }
}

export function hwDiagRecordSamplingPointAppended(): void {
  strokeSampling.appendedPoints += 1;
}

export function hwDiagRecordSamplingPointDropped(): void {
  strokeSampling.droppedByMinDist += 1;
}

export function hwDiagFinishStrokeSampling(
  committedPoints: number,
  coalescedEnabled: boolean,
): HwSamplingStrokeSummary {
  const summary: HwSamplingStrokeSummary = {
    t: Date.now(),
    ...strokeSampling,
    committedPoints,
    coalescedEnabled,
    samplesPerMove:
      strokeSampling.moveEvents > 0
        ? Math.round((strokeSampling.rawSamples / strokeSampling.moveEvents) * 100) / 100
        : 0,
  };
  const log = readSamplingLog();
  log.push(summary);
  writeSamplingLog(log);
  hwDiagLog('handwritingDiagnostics:strokeSampling', 'stroke sampling summary', {
    ...summary,
  });
  return summary;
}

export function hwSamplingDump(): HwSamplingStrokeSummary[] {
  return readSamplingLog();
}

export function hwSamplingLast(): HwSamplingStrokeSummary | null {
  const log = readSamplingLog();
  return log.length ? log[log.length - 1]! : null;
}

if (typeof window !== 'undefined') {
  window.__fwHwDiagDump = hwDiagDump;
  window.__fwHwPressureSummary = hwDiagPressureSummary;
  window.__fwHwSamplingDump = hwSamplingDump;
  window.__fwHwSamplingLast = hwSamplingLast;
}
