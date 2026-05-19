/** DEV-only: Section route / Supabase load diagnostics (tree-shaken in production). */

export function sectionLoadDebugLog(event: string, detail: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info(`[fw:section-load] ${event}`, { t: Date.now(), ...detail });
}
