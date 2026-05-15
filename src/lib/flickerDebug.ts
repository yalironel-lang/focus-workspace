/**
 * Development-only mount/render diagnostics for flicker investigation.
 * Tree-shaken in production when import.meta.env.DEV is false.
 */

declare global {
  interface Window {
    __fwFlickerDebug?: boolean;
  }
}

const counts = new Map<string, number>();

function enabled(): boolean {
  return import.meta.env.DEV && (window.__fwFlickerDebug !== false);
}

export function flickerDebugCount(label: string): void {
  if (!enabled()) return;
  const next = (counts.get(label) ?? 0) + 1;
  counts.set(label, next);
  if (next <= 12 || next % 25 === 0) {
    console.info(`[flicker-debug] mount ${label} #${next}`);
  }
}

export function flickerDebugLog(label: string, detail?: string): void {
  if (!enabled()) return;
  console.info(`[flicker-debug] ${label}${detail ? `: ${detail}` : ''}`);
}

export function flickerDebugDump(): void {
  if (!enabled()) return;
  console.group('[flicker-debug] counts');
  for (const [k, v] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.info(`  ${k}: ${v}`);
  }
  console.groupEnd();
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as Window & { fwFlickerDebugDump?: () => void }).fwFlickerDebugDump = flickerDebugDump;
}
