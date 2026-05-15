/** Dev-only navigation / overlay diagnostics (tree-shaken in production). */

export function navDebugLog(event: string, detail?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (detail && Object.keys(detail).length > 0) {
    console.info(`[nav-debug] ${event}`, detail);
  } else {
    console.info(`[nav-debug] ${event}`);
  }
}

export function navDebugRouteCheck(
  pathBefore: string,
  pathAfter: string,
  expectedPath = '/dashboard',
): void {
  if (!import.meta.env.DEV) return;
  const changed = pathBefore !== pathAfter;
  const ok = pathAfter === expectedPath || pathAfter.startsWith(expectedPath);
  navDebugLog('route-check', { pathBefore, pathAfter, changed, ok, expectedPath });
  if (!ok && pathBefore.startsWith('/section/')) {
    console.warn('[nav-debug] route did not reach dashboard after back navigation');
  }
}
