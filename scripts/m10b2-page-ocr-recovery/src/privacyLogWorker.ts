/**
 * Privacy-safe worker operational logs (M1.0B B3.2 / M1.1E).
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

export type WorkerLifecycleLogLine = {
  event: 'page_ocr_worker_lifecycle';
  phase:
    | 'started'
    | 'idle_sleep'
    | 'shutdown_requested'
    | 'stopped'
    | 'job_exception'
    | 'config_ok'
    | 'config_rejected';
  concurrency?: number;
  idleMs?: number;
  cycles?: number;
  processedCount?: number;
  idleCount?: number;
  errorCode?: string | null;
  detail?: string;
  env?: string;
  projectRef?: string;
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

export function formatWorkerLifecycleLogLine(line: WorkerLifecycleLogLine): string {
  return JSON.stringify({
    event: line.event,
    phase: line.phase,
    ...(typeof line.concurrency === 'number' ? { concurrency: line.concurrency } : {}),
    ...(typeof line.idleMs === 'number' ? { idleMs: line.idleMs } : {}),
    ...(typeof line.cycles === 'number' ? { cycles: line.cycles } : {}),
    ...(typeof line.processedCount === 'number'
      ? { processedCount: line.processedCount }
      : {}),
    ...(typeof line.idleCount === 'number' ? { idleCount: line.idleCount } : {}),
    errorCode: line.errorCode ?? null,
    ...(line.detail ? { detail: line.detail } : {}),
    ...(line.env ? { env: line.env } : {}),
    ...(line.projectRef ? { projectRef: line.projectRef } : {}),
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
    'serviceRoleKey',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  for (const k of forbidden) {
    if (lineJson.includes(`"${k}"`)) return false;
  }
  // Also refuse raw JWT-looking blobs
  if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(lineJson)) return false;
  return true;
}
