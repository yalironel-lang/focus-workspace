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
    __fwHwDiagDump?: () => HwDiagEntry[];
    __fwHwPressureSummary?: () => ReturnType<typeof hwDiagPressureSummary>;
  }
}

if (typeof window !== 'undefined') {
  window.__fwHwDiagDump = hwDiagDump;
  window.__fwHwPressureSummary = hwDiagPressureSummary;
}
