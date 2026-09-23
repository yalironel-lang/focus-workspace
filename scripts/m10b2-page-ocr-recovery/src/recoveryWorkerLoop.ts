/**
 * M1.1E — continuous recovery worker loop (claim → OCR → commit → idle).
 *
 * Reuses claimAndProcessNextRecoveryJob; does not duplicate OCR/ledger logic.
 * DB claim/lease remains the concurrency authority across instances.
 */

import type { ProcessClaimedJobResult } from './runClaimedRecoveryJob.ts';
import {
  assertWorkerLogHasNoAcademicContent,
  formatWorkerLifecycleLogLine,
} from './privacyLogWorker.ts';

export type RecoveryWorkerLoopDeps = {
  /** One claim+process attempt (may return idle / processed). */
  claimAndProcess: () => Promise<ProcessClaimedJobResult>;
  concurrency: number;
  idleMs: number;
  sleep: (ms: number) => Promise<void>;
  signal: AbortSignal;
  log?: (line: string) => void;
  /** Stop after N claim cycles (each cycle = up to concurrency claims). */
  maxCycles?: number | null;
  now?: () => number;
};

export type RecoveryWorkerLoopResult = {
  stoppedReason: 'signal' | 'max_cycles';
  cycles: number;
  processedCount: number;
  idleCount: number;
  lastOutcome: ProcessClaimedJobResult | null;
};

function emit(
  log: ((line: string) => void) | undefined,
  payload: Parameters<typeof formatWorkerLifecycleLogLine>[0],
): void {
  const line = formatWorkerLifecycleLogLine(payload);
  if (!assertWorkerLogHasNoAcademicContent(line)) {
    throw new Error('worker_log_content_violation');
  }
  (log ?? console.log)(line);
}

/**
 * Run until AbortSignal or maxCycles.
 * On SIGTERM path: stop claiming new work; wait for in-flight claims to settle.
 */
export async function runRecoveryWorkerLoop(
  deps: RecoveryWorkerLoopDeps,
): Promise<RecoveryWorkerLoopResult> {
  const concurrency = Math.max(1, Math.min(2, Math.floor(deps.concurrency)));
  const idleMs = Math.max(1_000, deps.idleMs);
  let cycles = 0;
  let processedCount = 0;
  let idleCount = 0;
  let lastOutcome: ProcessClaimedJobResult | null = null;
  let stopping = deps.signal.aborted;

  const onAbort = () => {
    stopping = true;
    emit(deps.log, {
      event: 'page_ocr_worker_lifecycle',
      phase: 'shutdown_requested',
    });
  };
  deps.signal.addEventListener('abort', onAbort);

  emit(deps.log, {
    event: 'page_ocr_worker_lifecycle',
    phase: 'started',
    concurrency,
    idleMs,
  });

  try {
    while (!stopping) {
      if (deps.maxCycles != null && cycles >= deps.maxCycles) {
        return {
          stoppedReason: 'max_cycles',
          cycles,
          processedCount,
          idleCount,
          lastOutcome,
        };
      }

      cycles += 1;
      const batch: Promise<ProcessClaimedJobResult>[] = [];
      for (let i = 0; i < concurrency; i++) {
        if (stopping) break;
        batch.push(
          deps.claimAndProcess().catch((err): ProcessClaimedJobResult => {
            emit(deps.log, {
              event: 'page_ocr_worker_lifecycle',
              phase: 'job_exception',
              errorCode: 'worker_job_exception',
              detail: String(err instanceof Error ? err.message : err).slice(0, 80),
            });
            // Per-job failure must not kill the loop.
            return { processed: false, errorCode: 'worker_job_exception' };
          }),
        );
      }

      const results = await Promise.all(batch);
      let anyProcessed = false;
      for (const r of results) {
        lastOutcome = r;
        if (r.processed) {
          anyProcessed = true;
          processedCount += 1;
        }
      }

      if (stopping) break;

      if (!anyProcessed) {
        idleCount += 1;
        emit(deps.log, {
          event: 'page_ocr_worker_lifecycle',
          phase: 'idle_sleep',
          idleMs,
          cycles,
        });
        await deps.sleep(idleMs);
      }
    }

    return {
      stoppedReason: 'signal',
      cycles,
      processedCount,
      idleCount,
      lastOutcome,
    };
  } finally {
    deps.signal.removeEventListener('abort', onAbort);
    emit(deps.log, {
      event: 'page_ocr_worker_lifecycle',
      phase: 'stopped',
      cycles,
      processedCount,
      idleCount,
    });
  }
}
