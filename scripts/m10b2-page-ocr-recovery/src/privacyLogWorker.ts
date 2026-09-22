/**
 * Privacy-safe worker operational logs (M1.0B B3.2).
 * NEVER includes native/recovered/canonical text, PDF bytes, or signed URLs.
 */

export type WorkerRecoveryLogLine = {
  event: 'page_ocr_worker';
  phase:
    | 'claim'
    | 'resolve'
    | 'ocr'
    | 'commit'
    | 'stale_discard'
    | 'feature_disabled'
    | 'error';
  jobId?: string;
  sourceId?: string;
  sourceVersion?: number;
  pageNumber?: number;
  attemptCount?: number;
  detectorReasons?: string[];
  status?: string;
  errorCode?: string | null;
  durationMs?: number;
  renderMs?: number;
  ocrMs?: number;
  renderDpi?: number;
  recoveredCharCount?: number;
  engineVersion?: string;
};

export function formatWorkerRecoveryLogLine(line: WorkerRecoveryLogLine): string {
  return JSON.stringify({
    event: line.event,
    phase: line.phase,
    ...(line.jobId ? { jobId: line.jobId } : {}),
    ...(line.sourceId ? { sourceId: line.sourceId } : {}),
    ...(typeof line.sourceVersion === 'number' ? { sourceVersion: line.sourceVersion } : {}),
    ...(typeof line.pageNumber === 'number' ? { pageNumber: line.pageNumber } : {}),
    ...(typeof line.attemptCount === 'number' ? { attemptCount: line.attemptCount } : {}),
    ...(line.detectorReasons ? { detectorReasons: line.detectorReasons } : {}),
    ...(line.status ? { status: line.status } : {}),
    errorCode: line.errorCode ?? null,
    ...(typeof line.durationMs === 'number' ? { durationMs: line.durationMs } : {}),
    ...(typeof line.renderMs === 'number' ? { renderMs: line.renderMs } : {}),
    ...(typeof line.ocrMs === 'number' ? { ocrMs: line.ocrMs } : {}),
    ...(typeof line.renderDpi === 'number' ? { renderDpi: line.renderDpi } : {}),
    ...(typeof line.recoveredCharCount === 'number'
      ? { recoveredCharCount: line.recoveredCharCount }
      : {}),
    ...(line.engineVersion ? { engineVersion: line.engineVersion } : {}),
  });
}

export function assertWorkerLogHasNoAcademicContent(lineJson: string): boolean {
  const forbidden = [
    'native_text',
    'recovered_text',
    'canonical_text',
    'nativeText',
    'recoveredText',
    'canonicalText',
    'signedUrl',
    'Authorization',
    'service_role',
  ];
  for (const k of forbidden) {
    if (lineJson.includes(`"${k}"`)) return false;
  }
  return true;
}
