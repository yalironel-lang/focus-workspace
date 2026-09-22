/**
 * @deprecated Import from `./supabaseTrustedLedger.ts` (B3.2.1).
 * Kept so prior B3.2 import paths keep failing closed until callers update.
 */

export {
  createSupabaseTrustedLedger,
  createSupabaseTrustedLedgerStub as createSupabaseTrustedLedgerLegacyStub,
  type CreateSupabaseTrustedLedgerOpts,
  type SupabaseRpcClient,
} from './supabaseTrustedLedger.ts';
