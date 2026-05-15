/** Dev-only navigation / overlay diagnostics (tree-shaken in production). */

export function navDebugLog(event: string, detail?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (detail && Object.keys(detail).length > 0) {
    console.info(`[nav-debug] ${event}`, detail);
  } else {
    console.info(`[nav-debug] ${event}`);
  }
}
