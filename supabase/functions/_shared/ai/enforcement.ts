/**
 * M0.4 — enforcement + usage accounting ports (injectable for tests).
 * Fail-closed on begin; fail-open on record after provider success.
 */

import type { AiPlan } from './aiPolicy.ts';
import type { ZikukAiErrorCode } from './requestTypes.ts';

export type BeginRequestSuccess = {
  ok: true;
  plan: AiPlan;
  quotaLimit: number | null;
  quotaCount: number | null;
  safetyCount: number;
};

export type BeginRequestDenied = {
  ok: false;
  code: Extract<ZikukAiErrorCode, 'ai_disabled' | 'rate_limited' | 'quota_exceeded' | 'invalid_request'>;
  plan?: AiPlan;
};

export type BeginRequestResult = BeginRequestSuccess | BeginRequestDenied;

export type UsageOutcome =
  | 'success'
  | 'provider_error'
  | 'provider_timeout'
  | 'rate_limited'
  | 'bad_response'
  | 'internal_error';

export type AiUsageEventInput = {
  userId: string;
  capability: string;
  providerId: string | null;
  model: string | null;
  outcome: UsageOutcome;
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsdMicros: number | null;
  latencyMs: number | null;
  sectionId: string | null;
  providerRequestId: string | null;
};

export type AiEnforcementStore = {
  /**
   * Atomic entitlement + safety + product quota.
   * Must throw or return a denied result on storage failure — callers fail closed.
   */
  beginRequest(userId: string, capability: string): Promise<BeginRequestResult>;

  /**
   * Append metadata-only usage event.
   * Returns ok:false on persistence failure (caller may fail-open after success).
   */
  recordUsage(event: AiUsageEventInput): Promise<{ ok: true } | { ok: false; reason: string }>;
};

/** In-memory store for unit tests — mirrors SQL atomic semantics. */
export function createMemoryEnforcementStore(opts?: {
  /** Seed entitlements: userId → { plan, dailyRequestLimit? } */
  entitlements?: Record<string, { plan: AiPlan; dailyRequestLimit?: number | null }>;
  /** Force beginRequest to throw (fail-closed tests). */
  beginThrows?: boolean;
  /** Force recordUsage to fail. */
  recordFails?: boolean;
  /** Override clock for window tests (ms epoch). */
  nowMs?: () => number;
}): AiEnforcementStore & {
  events: AiUsageEventInput[];
  setEntitlement(userId: string, plan: AiPlan, dailyRequestLimit?: number | null): void;
  getCounter(userId: string, kind: 'safety_60s' | 'quota_day', windowStartMs: number): number;
} {
  const entitlements = new Map(
    Object.entries(opts?.entitlements ?? {}).map(([k, v]) => [
      k,
      { plan: v.plan, dailyRequestLimit: v.dailyRequestLimit ?? null },
    ]),
  );
  const counters = new Map<string, number>();
  const events: AiUsageEventInput[] = [];
  const nowMs = opts?.nowMs ?? (() => Date.now());

  const key = (userId: string, kind: string, startMs: number) => `${userId}|${kind}|${startMs}`;

  return {
    events,
    setEntitlement(userId, plan, dailyRequestLimit = null) {
      entitlements.set(userId, { plan, dailyRequestLimit });
    },
    getCounter(userId, kind, windowStartMs) {
      return counters.get(key(userId, kind, windowStartMs)) ?? 0;
    },
    async beginRequest(userId, capability) {
      if (opts?.beginThrows) throw new Error('enforcement_unavailable');
      if (!userId || !capability) {
        return { ok: false, code: 'invalid_request' };
      }

      const row = entitlements.get(userId);
      const plan: AiPlan = row?.plan ?? 'beta';
      if (plan === 'disabled') {
        return { ok: false, code: 'ai_disabled', plan };
      }

      let quotaLimit: number | null;
      if (plan === 'owner') {
        quotaLimit = null;
      } else if (typeof row?.dailyRequestLimit === 'number' && row.dailyRequestLimit >= 0) {
        quotaLimit = Math.floor(row.dailyRequestLimit);
      } else if (plan === 'pro') {
        quotaLimit = 200;
      } else {
        quotaLimit = 40;
      }

      if (quotaLimit !== null && quotaLimit <= 0) {
        return { ok: false, code: 'quota_exceeded', plan };
      }

      const t = nowMs();
      const safetyStart = Math.floor(t / 60_000) * 60_000;
      const safetyKey = key(userId, 'safety_60s', safetyStart);
      const safetyBefore = counters.get(safetyKey) ?? 0;
      if (safetyBefore >= 20) {
        return { ok: false, code: 'rate_limited', plan };
      }
      counters.set(safetyKey, safetyBefore + 1);
      const safetyCount = safetyBefore + 1;

      let quotaCount: number | null = null;
      if (quotaLimit !== null) {
        const day = new Date(t);
        const dayStart = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
        const quotaKey = key(userId, 'quota_day', dayStart);
        const before = counters.get(quotaKey) ?? 0;
        if (before >= quotaLimit) {
          // Roll back safety (match SQL txn behavior)
          counters.set(safetyKey, Math.max(safetyCount - 1, 0));
          return { ok: false, code: 'quota_exceeded', plan };
        }
        counters.set(quotaKey, before + 1);
        quotaCount = before + 1;
      }

      return { ok: true, plan, quotaLimit, quotaCount, safetyCount };
    },
    async recordUsage(event) {
      if (opts?.recordFails) return { ok: false, reason: 'record_failed' };
      // Refuse storing forbidden content keys if somehow passed (defense in depth)
      const forbidden = ['selection', 'prompt', 'response', 'surroundings', 'jwt', 'apiKey'];
      for (const f of forbidden) {
        if (f in (event as unknown as Record<string, unknown>)) {
          return { ok: false, reason: 'forbidden_field' };
        }
      }
      events.push({ ...event });
      return { ok: true };
    },
  };
}
