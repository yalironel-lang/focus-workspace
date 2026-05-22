/**
 * Product stability switches — disable heavy or fragmented subsystems by default.
 * Set a flag to `false` to re-enable that feature when ready.
 */
export const STABILITY_BASELINE = {
  /** Skip dashboard cinematic intro on first visit. */
  disableIntroExperience: true,
  /** Skip arrival gate overlay tree. */
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

export type StabilityFeatureKey = keyof typeof STABILITY_BASELINE;

/** When baseline[key] is true, that subsystem is disabled. */
export function isStabilityFeatureDisabled(key: StabilityFeatureKey): boolean {
  return STABILITY_BASELINE[key];
}

const loggedStabilityDisables = new Set<string>();

export function logStabilityDisabledOnce(feature: string, reason: string): void {
  if (!import.meta.env.DEV) return;
  const token = `${feature}:${reason}`;
  if (loggedStabilityDisables.has(token)) return;
  loggedStabilityDisables.add(token);
  // eslint-disable-next-line no-console
  console.warn(`[fw:stability] ${feature} disabled (${reason})`);
}

/** DEV-only: trace suspected effect → setState chains (no-op in production). */
export function devTraceStability(label: string): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.trace(`[fw-stability] ${label}`);
}
