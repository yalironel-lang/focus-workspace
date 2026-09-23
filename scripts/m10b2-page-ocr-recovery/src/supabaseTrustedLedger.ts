/**
 * M1.0B B3.2.1 / M1.1E — Supabase trusted recovery ledger adapter.
 *
 * Authority path:
 *   claim RPC → load source row → download by source.storage_path only → commit RPC
 *
 * NEVER accepts client-supplied Storage paths, URLs, or PDF bytes as authority.
 *
 * Staging is the default authorized host. Production requires allowProduction
 * AND an exact productionConfirm string (never inferred from URL alone).
 */

import type {
  ClaimedRecoveryJob,
  ClaimRecoveryResult,
  CommitRecoveryInput,
  CommitRecoveryResult,
  PageEvidenceRecord,
  TrustedRecoveryLedger,
  TrustedSourceRecord,
} from './trustedJobTypes.ts';
import {
  ZIKUK_PRODUCTION_PROJECT_REF,
  ZIKUK_RECOVERY_PRODUCTION_CONFIRM_VALUE,
  ZIKUK_STAGING_PROJECT_REF,
} from './workerConfig.ts';

/** Canonical private PDF bucket (migration 008). */
const PDF_BUCKET = 'user-content';
const PRODUCTION_REF = ZIKUK_PRODUCTION_PROJECT_REF;
const STAGING_REF = ZIKUK_STAGING_PROJECT_REF;

export type SupabaseRpcClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
    };
  };
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): EqChain;
    };
  };
};

type EqChain = {
  eq(col: string, val: unknown): EqChain;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
  single(): Promise<{ data: unknown; error: { message: string } | null }>;
};

export type CreateSupabaseTrustedLedgerOpts = {
  /** Expected project ref (staging, or production with explicit opt-in). */
  projectRef: string;
  /**
   * Explicit Production opt-in. Still requires productionConfirm to match
   * ZIKUK_RECOVERY_PRODUCTION_CONFIRM_VALUE.
   */
  allowProduction?: boolean;
  /** Required when allowProduction targets Production. */
  productionConfirm?: string;
  pdfBucket?: string;
};

/**
 * Build a TrustedRecoveryLedger over real Supabase RPCs + private Storage.
 * Fail-closed for Production without allowProduction + productionConfirm.
 */
export function createSupabaseTrustedLedger(
  client: SupabaseRpcClient,
  opts: CreateSupabaseTrustedLedgerOpts,
): TrustedRecoveryLedger {
  if (!opts?.projectRef || typeof opts.projectRef !== 'string') {
    throw new Error('supabase_trusted_ledger_requires_project_ref');
  }
  if (opts.projectRef === PRODUCTION_REF) {
    if (opts.allowProduction !== true) {
      throw new Error(
        `supabase_trusted_ledger_refuses_production_ref:${PRODUCTION_REF}`,
      );
    }
    if (opts.productionConfirm !== ZIKUK_RECOVERY_PRODUCTION_CONFIRM_VALUE) {
      throw new Error('supabase_trusted_ledger_requires_production_confirm');
    }
  } else if (opts.projectRef === STAGING_REF) {
    if (opts.allowProduction === true) {
      throw new Error('supabase_trusted_ledger_staging_must_not_set_allow_production');
    }
  } else {
    throw new Error(
      `supabase_trusted_ledger_requires_staging_ref:${STAGING_REF}_got:${opts.projectRef}`,
    );
  }

  const bucket = opts.pdfBucket ?? PDF_BUCKET;

  return {
    async claimJob(claimOpts) {
      const { data, error } = await client.rpc('ai_knowledge_claim_page_recovery_job', {
        p_lease_seconds: claimOpts?.leaseSeconds ?? 120,
        p_max_attempts: claimOpts?.maxAttempts ?? 3,
      });
      if (error) return { ok: false, code: 'internal_error' };
      return mapClaimResult(data);
    },

    async loadSource(sourceId) {
      const { data, error } = await client
        .from('ai_knowledge_sources')
        .select(
          'id,user_id,section_id,storage_path,source_version,retrieval_source_version,status',
        )
        .eq('id', sourceId)
        .maybeSingle();
      if (error || !data || typeof data !== 'object') return null;
      const row = data as Record<string, unknown>;
      if (typeof row.storage_path !== 'string' || !row.storage_path) return null;
      return {
        sourceId: String(row.id),
        userId: String(row.user_id),
        sectionId: String(row.section_id),
        storagePath: row.storage_path,
        sourceVersionTip: Number(row.source_version),
        retrievalSourceVersion:
          row.retrieval_source_version == null
            ? null
            : Number(row.retrieval_source_version),
        status: String(row.status ?? ''),
      } satisfies TrustedSourceRecord;
    },

    async loadPageEvidence(sourceId, sourceVersion, pageNumber) {
      const { data, error } = await client
        .from('ai_knowledge_page_texts')
        .select(
          'source_id,source_version,page_number,native_text,recovered_text,canonical_text,extraction_method,extraction_version,recovery_version,fallback_result',
        )
        .eq('source_id', sourceId)
        .eq('source_version', sourceVersion)
        .eq('page_number', pageNumber)
        .maybeSingle();
      if (error || !data || typeof data !== 'object') return null;
      const row = data as Record<string, unknown>;
      return {
        sourceId: String(row.source_id),
        sourceVersion: Number(row.source_version),
        pageNumber: Number(row.page_number),
        nativeText: String(row.native_text ?? ''),
        recoveredText:
          row.recovered_text == null ? null : String(row.recovered_text),
        canonicalText: String(row.canonical_text ?? ''),
        extractionMethod:
          row.extraction_method === 'ocr_tesseract' ? 'ocr_tesseract' : 'native',
        extractionVersion: String(row.extraction_version ?? ''),
        recoveryVersion:
          row.recovery_version == null ? null : String(row.recovery_version),
        fallbackResult:
          row.fallback_result == null ? null : String(row.fallback_result),
      } satisfies PageEvidenceRecord;
    },

    async downloadPdfByStoragePath(storagePath) {
      // Reject absolute/URL/traversal before touching Storage.
      if (
        !storagePath ||
        storagePath.includes('..') ||
        storagePath.startsWith('/') ||
        storagePath.includes('\\') ||
        /^[a-zA-Z]:/.test(storagePath) ||
        /^https?:\/\//i.test(storagePath) ||
        storagePath.includes('://')
      ) {
        return null;
      }
      const { data, error } = await client.storage.from(bucket).download(storagePath);
      if (error || !data) return null;
      const buf = await data.arrayBuffer();
      return new Uint8Array(buf);
    },

    async commitRecoveryResult(input: CommitRecoveryInput): Promise<CommitRecoveryResult> {
      const { data, error } = await client.rpc(
        'ai_knowledge_commit_page_recovery_result',
        {
          p_job_id: input.jobId,
          p_claim_token: input.claimToken,
          p_status: input.status,
          p_recovered_text: input.recoveredText ?? null,
          p_error_code: input.errorCode ?? null,
        },
      );
      if (error) return { ok: false, code: 'internal_error' };
      return mapCommitResult(data);
    },
  };
}

function mapClaimResult(data: unknown): ClaimRecoveryResult {
  if (!data || typeof data !== 'object') return { ok: false, code: 'internal_error' };
  const o = data as Record<string, unknown>;
  if (o.ok === false) return { ok: false, code: String(o.code ?? 'internal_error') };
  if (o.ok !== true) return { ok: false, code: 'internal_error' };
  if (o.job == null) return { ok: true, job: null };
  if (typeof o.job !== 'object') return { ok: false, code: 'internal_error' };
  const j = o.job as Record<string, unknown>;
  const job: ClaimedRecoveryJob = {
    id: String(j.id),
    userId: String(j.user_id),
    sectionId: String(j.section_id),
    sourceId: String(j.source_id),
    sourceVersion: Number(j.source_version),
    pageNumber: Number(j.page_number),
    extractionVersion: String(j.extraction_version),
    recoveryVersion: String(j.recovery_version),
    status: 'claimed',
    attemptCount: Number(j.attempt_count),
    detectorReasons: Array.isArray(j.detector_reasons)
      ? j.detector_reasons.map(String)
      : [],
    claimToken: String(j.claim_token),
    leaseExpiresAt: String(j.lease_expires_at),
  };
  return { ok: true, job };
}

function mapCommitResult(data: unknown): CommitRecoveryResult {
  if (!data || typeof data !== 'object') return { ok: false, code: 'internal_error' };
  const o = data as Record<string, unknown>;
  if (o.ok === false) {
    return { ok: false, code: String(o.code ?? 'internal_error') };
  }
  return {
    ok: true,
    status: o.status != null ? String(o.status) : undefined,
    code: o.code != null ? String(o.code) : undefined,
    idempotent: o.idempotent === true,
    retry: o.retry === true || o.status === 'queued',
  };
}

/** @deprecated Use createSupabaseTrustedLedger with explicit projectRef. */
export function createSupabaseTrustedLedgerStub(_client: SupabaseRpcClient): never {
  throw new Error(
    'supabase_trusted_ledger_requires_non_production_host_config — pass projectRef via createSupabaseTrustedLedger',
  );
}
