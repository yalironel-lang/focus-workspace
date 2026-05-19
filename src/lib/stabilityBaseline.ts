/**
 * Temporary stabilization switches — establish a boring, reliable baseline first.
 * Re-enable one flag at a time after idle + navigation flows are proven stable.
 *
 * All default `true` = subsystem OFF for maximum stability.
 */
export const STABILITY_BASELINE = {
  /** Skip arrival gate overlay tree (full experience only). */
  disableArrivalExperienceGate: true,
  /** No living-environment time interval / timePhase updates. */
  disableLivingEnvironmentMotion: true,
  /** Hide workspace resume overlay. */
  disableWorkspaceResumeLayer: true,
  /** Hide starter dock + full starter overlay. */
  disableWorkspaceStarterChrome: true,
  /** Do not mount Free Space minimap. */
  disableFreeSpaceMiniMap: true,
  /** Softer Free Space canvas (no spatial ambient extras). */
  disableFreeSpaceSpatialAmbient: true,
} as const;

const loggedStabilityDisables = new Set<string>();

export function logStabilityDisabledOnce(feature: string, reason: string): void {
  if (!import.meta.env.DEV) return;
  const key = `${feature}:${reason}`;
  if (loggedStabilityDisables.has(key)) return;
  loggedStabilityDisables.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[fw:stability] ${feature} disabled by ${reason}`);
}

/** DEV-only: trace suspected effect → setState chains (no-op in production). */
export function devTraceStability(label: string): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.trace(`[fw-stability] ${label}`);
}
