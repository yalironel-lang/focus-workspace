// Explicit bounds derived from the fixed 72-case schedule, not live retries.
export const REQUEST_LIMITS = Object.freeze({
  acceptance: 1400,
  // Original derived 4698 bound rounded to 4700. Reviewed rules keep this cap;
  // exact guard-schedule maximum 2928 + base1306 + at most16 readbacks =4250.
  diagnosticCollect: 4700,
  cleanup: 400,
  assertionMs: 15 * 60_000,
  cleanupMs: 120_000,
  requestMs: 10000,
});
export function assertionRequestLimit(mode) {
  if (mode === 'ACCEPTANCE') return REQUEST_LIMITS.acceptance;
  if (mode === 'DIAGNOSTIC_COLLECT') return REQUEST_LIMITS.diagnosticCollect;
  throw Error('INVALID_MODE');
}
