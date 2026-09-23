/**
 * M1.1E — recovery worker environment / config (fail-closed).
 *
 * Never logs secrets. Never infers Production from URL alone.
 */

export const ZIKUK_STAGING_PROJECT_REF = 'lmgrhmyurhjlwwdedojk' as const;
export const ZIKUK_PRODUCTION_PROJECT_REF = 'comxmviofnotfwzbupxg' as const;

/** Required verbatim when targeting Production. */
export const ZIKUK_RECOVERY_PRODUCTION_CONFIRM_VALUE =
  'I_UNDERSTAND_THIS_TARGETS_ZIKUK_PRODUCTION' as const;

export type RecoveryWorkerEnvName = 'staging' | 'production';

export type RecoveryWorkerConfig = {
  env: RecoveryWorkerEnvName;
  projectRef: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  allowProduction: boolean;
  productionConfirm: string | null;
  concurrency: number;
  idleMs: number;
  leaseSeconds: number;
  maxAttempts: number;
  recoveryEnabled: boolean;
  tesseractBin: string;
  /** When set, process exits after this many claim cycles (tests / one-shot). */
  maxCycles: number | null;
};

export type ParseRecoveryWorkerConfigResult =
  | { ok: true; config: RecoveryWorkerConfig }
  | { ok: false; code: string; message: string };

function fail(code: string, message: string): ParseRecoveryWorkerConfigResult {
  return { ok: false, code, message };
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function extractRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    const m = /^([a-z0-9]+)\.supabase\.co$/i.exec(host);
    return m?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Parse and validate worker config from an env-like record.
 * Fail closed on missing/mismatched Production confirmation.
 */
export function parseRecoveryWorkerConfig(
  env: Record<string, string | undefined>,
): ParseRecoveryWorkerConfigResult {
  const envNameRaw = (env.ZIKUK_RECOVERY_ENV ?? '').trim().toLowerCase();
  if (envNameRaw !== 'staging' && envNameRaw !== 'production') {
    return fail(
      'invalid_recovery_env',
      'ZIKUK_RECOVERY_ENV must be "staging" or "production".',
    );
  }
  const envName = envNameRaw as RecoveryWorkerEnvName;

  const projectRef = (env.ZIKUK_RECOVERY_PROJECT_REF ?? '').trim().toLowerCase();
  if (!projectRef) {
    return fail('missing_project_ref', 'ZIKUK_RECOVERY_PROJECT_REF is required.');
  }

  const supabaseUrl = (env.SUPABASE_URL ?? env.ZIKUK_RECOVERY_SUPABASE_URL ?? '').trim();
  if (!supabaseUrl) {
    return fail('missing_supabase_url', 'SUPABASE_URL is required.');
  }

  const serviceRoleKey = (
    env.SUPABASE_SERVICE_ROLE_KEY ?? env.ZIKUK_RECOVERY_SERVICE_ROLE_KEY ?? ''
  ).trim();
  if (!serviceRoleKey || serviceRoleKey.length < 20) {
    return fail(
      'missing_service_role',
      'SUPABASE_SERVICE_ROLE_KEY is required (service role, not anon).',
    );
  }

  const urlRef = extractRefFromUrl(supabaseUrl);
  if (!urlRef) {
    return fail('invalid_supabase_url', 'SUPABASE_URL must be https://<ref>.supabase.co');
  }
  if (urlRef !== projectRef) {
    return fail(
      'project_ref_url_mismatch',
      'ZIKUK_RECOVERY_PROJECT_REF must match SUPABASE_URL project ref.',
    );
  }

  if (envName === 'staging') {
    if (projectRef !== ZIKUK_STAGING_PROJECT_REF) {
      return fail(
        'staging_ref_mismatch',
        `Staging env requires project ref ${ZIKUK_STAGING_PROJECT_REF}.`,
      );
    }
    if (projectRef === ZIKUK_PRODUCTION_PROJECT_REF) {
      return fail('staging_env_production_ref', 'Staging env cannot target Production.');
    }
  }

  if (envName === 'production') {
    if (projectRef !== ZIKUK_PRODUCTION_PROJECT_REF) {
      return fail(
        'production_ref_mismatch',
        `Production env requires project ref ${ZIKUK_PRODUCTION_PROJECT_REF}.`,
      );
    }
    const confirm = (env.ZIKUK_RECOVERY_PRODUCTION_CONFIRM ?? '').trim();
    if (confirm !== ZIKUK_RECOVERY_PRODUCTION_CONFIRM_VALUE) {
      return fail(
        'production_confirm_required',
        'Production requires ZIKUK_RECOVERY_PRODUCTION_CONFIRM exact match.',
      );
    }
  }

  const concurrency = parsePositiveInt(env.ZIKUK_RECOVERY_CONCURRENCY, 1, 1, 2);
  if (concurrency == null) {
    return fail('invalid_concurrency', 'ZIKUK_RECOVERY_CONCURRENCY must be 1 or 2.');
  }

  const idleMs = parsePositiveInt(env.ZIKUK_RECOVERY_IDLE_MS, 5_000, 1_000, 120_000);
  if (idleMs == null) {
    return fail('invalid_idle_ms', 'ZIKUK_RECOVERY_IDLE_MS must be 1000–120000.');
  }

  const leaseSeconds = parsePositiveInt(env.ZIKUK_RECOVERY_LEASE_SECONDS, 120, 30, 3600);
  if (leaseSeconds == null) {
    return fail('invalid_lease_seconds', 'ZIKUK_RECOVERY_LEASE_SECONDS must be 30–3600.');
  }

  const maxAttempts = parsePositiveInt(env.ZIKUK_RECOVERY_MAX_ATTEMPTS, 3, 1, 32);
  if (maxAttempts == null) {
    return fail('invalid_max_attempts', 'ZIKUK_RECOVERY_MAX_ATTEMPTS must be 1–32.');
  }

  const recoveryEnabled = (env.ZIKUK_RECOVERY_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
  const tesseractBin = (env.ZIKUK_RECOVERY_TESSERACT_BIN ?? 'tesseract').trim() || 'tesseract';

  let maxCycles: number | null = null;
  if (env.ZIKUK_RECOVERY_MAX_CYCLES != null && env.ZIKUK_RECOVERY_MAX_CYCLES.trim() !== '') {
    const n = parsePositiveInt(env.ZIKUK_RECOVERY_MAX_CYCLES, 0, 1, 1_000_000);
    if (n == null) {
      return fail('invalid_max_cycles', 'ZIKUK_RECOVERY_MAX_CYCLES must be a positive integer.');
    }
    maxCycles = n;
  }

  const allowProduction = envName === 'production';
  const productionConfirm =
    envName === 'production' ? ZIKUK_RECOVERY_PRODUCTION_CONFIRM_VALUE : null;

  return {
    ok: true,
    config: {
      env: envName,
      projectRef,
      supabaseUrl,
      serviceRoleKey,
      allowProduction,
      productionConfirm,
      concurrency,
      idleMs,
      leaseSeconds,
      maxAttempts,
      recoveryEnabled,
      tesseractBin,
      maxCycles,
    },
  };
}

/** Public metadata for startup logs (never includes keys). */
export function recoveryWorkerConfigPublicMeta(
  config: RecoveryWorkerConfig,
): Record<string, unknown> {
  return {
    env: config.env,
    projectRef: config.projectRef,
    supabaseHost: (() => {
      try {
        return new URL(config.supabaseUrl).host;
      } catch {
        return 'invalid';
      }
    })(),
    serviceRoleKeyLen: config.serviceRoleKey.length,
    allowProduction: config.allowProduction,
    concurrency: config.concurrency,
    idleMs: config.idleMs,
    leaseSeconds: config.leaseSeconds,
    maxAttempts: config.maxAttempts,
    recoveryEnabled: config.recoveryEnabled,
    tesseractBin: config.tesseractBin,
    maxCycles: config.maxCycles,
  };
}
