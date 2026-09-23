/**
 * M1.1E — continuous page-OCR recovery worker entrypoint.
 *
 * Staging:
 *   ZIKUK_RECOVERY_ENV=staging
 *   ZIKUK_RECOVERY_PROJECT_REF=lmgrhmyurhjlwwdedojk
 *   SUPABASE_URL=https://lmgrhmyurhjlwwdedojk.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Production (E2 — do not run until authorized):
 *   ZIKUK_RECOVERY_ENV=production
 *   ZIKUK_RECOVERY_PROJECT_REF=comxmviofnotfwzbupxg
 *   ZIKUK_RECOVERY_PRODUCTION_CONFIRM=I_UNDERSTAND_THIS_TARGETS_ZIKUK_PRODUCTION
 *   SUPABASE_URL=https://comxmviofnotfwzbupxg.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 *   node --experimental-strip-types runRecoveryWorker.ts
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  formatWorkerLifecycleLogLine,
  assertWorkerLogHasNoAcademicContent,
} from './src/privacyLogWorker.ts';
import { runRecoveryWorkerLoop } from './src/recoveryWorkerLoop.ts';
import { claimAndProcessNextRecoveryJob } from './src/runClaimedRecoveryJob.ts';
import { createSupabaseTrustedLedger } from './src/supabaseTrustedLedger.ts';
import {
  parseRecoveryWorkerConfig,
  recoveryWorkerConfigPublicMeta,
} from './src/workerConfig.ts';

function asLedgerClient(sb: SupabaseClient) {
  return {
    rpc: (fn: string, args: Record<string, unknown>) => sb.rpc(fn, args),
    storage: sb.storage,
    from: (table: string) => sb.from(table),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function emitLifecycle(payload: Parameters<typeof formatWorkerLifecycleLogLine>[0]): void {
  const line = formatWorkerLifecycleLogLine(payload);
  if (!assertWorkerLogHasNoAcademicContent(line)) {
    throw new Error('worker_log_content_violation');
  }
  console.log(line);
}

async function main(): Promise<number> {
  const parsed = parseRecoveryWorkerConfig(process.env as Record<string, string | undefined>);
  if (!parsed.ok) {
    emitLifecycle({
      event: 'page_ocr_worker_lifecycle',
      phase: 'config_rejected',
      errorCode: parsed.code,
      detail: parsed.message.slice(0, 120),
    });
    return 2;
  }

  const { config } = parsed;
  emitLifecycle({
    event: 'page_ocr_worker_lifecycle',
    phase: 'config_ok',
    env: config.env,
    projectRef: config.projectRef,
    concurrency: config.concurrency,
    idleMs: config.idleMs,
    detail: JSON.stringify(recoveryWorkerConfigPublicMeta(config)).slice(0, 400),
  });

  const sb = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ledger = createSupabaseTrustedLedger(asLedgerClient(sb) as never, {
    projectRef: config.projectRef,
    allowProduction: config.allowProduction || undefined,
    productionConfirm: config.productionConfirm ?? undefined,
    pdfBucket: 'user-content',
  });

  const ac = new AbortController();
  const onSignal = (sig: string) => {
    emitLifecycle({
      event: 'page_ocr_worker_lifecycle',
      phase: 'shutdown_requested',
      detail: sig,
    });
    ac.abort();
  };
  process.once('SIGINT', () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));

  const result = await runRecoveryWorkerLoop({
    claimAndProcess: () =>
      claimAndProcessNextRecoveryJob({
        ledger,
        recoveryEnabled: config.recoveryEnabled,
        tesseractBin: config.tesseractBin,
        leaseSeconds: config.leaseSeconds,
        maxAttempts: config.maxAttempts,
        log: line => console.log(line),
      }),
    concurrency: config.concurrency,
    idleMs: config.idleMs,
    sleep,
    signal: ac.signal,
    maxCycles: config.maxCycles,
    log: line => console.log(line),
  });

  emitLifecycle({
    event: 'page_ocr_worker_lifecycle',
    phase: 'stopped',
    cycles: result.cycles,
    processedCount: result.processedCount,
    idleCount: result.idleCount,
    detail: result.stoppedReason,
  });

  return 0;
}

main()
  .then(code => {
    process.exitCode = code;
  })
  .catch(err => {
    emitLifecycle({
      event: 'page_ocr_worker_lifecycle',
      phase: 'stopped',
      errorCode: 'worker_fatal',
      detail: String(err instanceof Error ? err.message : err).slice(0, 120),
    });
    process.exitCode = 1;
  });
