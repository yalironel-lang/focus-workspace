/**
 * Optional Supabase RPC adapter shape for a future non-prod worker host.
 * NOT wired to Production. NOT used unless explicitly configured.
 *
 * Rejects any attempt to pass client Storage paths into the worker loop.
 */

import type {
  ClaimRecoveryResult,
  CommitRecoveryInput,
  CommitRecoveryResult,
  PageEvidenceRecord,
  TrustedRecoveryLedger,
  TrustedSourceRecord,
} from './trustedJobTypes.ts';

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
      eq(col: string, val: unknown): {
        eq?(col: string, val: unknown): unknown;
        maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
        single(): Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
};

/**
 * Factory placeholder — requires service-role client injected by private host.
 * Throws if constructed with a browser/anon client marker.
 */
export function createSupabaseTrustedLedger(_client: SupabaseRpcClient): TrustedRecoveryLedger {
  throw new Error(
    'supabase_trusted_ledger_requires_non_production_host_config — B3.2 blocked pending safe env',
  );
}

/** Compile-time shape check helpers for adapters (unused at runtime in B3.2). */
export type _LedgerShape = TrustedRecoveryLedger;
export type _Claim = ClaimRecoveryResult;
export type _CommitIn = CommitRecoveryInput;
export type _CommitOut = CommitRecoveryResult;
export type _Source = TrustedSourceRecord;
export type _Page = PageEvidenceRecord;
