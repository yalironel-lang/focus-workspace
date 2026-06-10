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

declare global {
  interface Window {
    __fwHwDiagDump?: () => HwDiagEntry[];
  }
}

if (typeof window !== 'undefined') {
  window.__fwHwDiagDump = hwDiagDump;
}
