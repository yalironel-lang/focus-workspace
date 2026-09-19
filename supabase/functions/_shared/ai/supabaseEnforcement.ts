/**
 * M0.4 — Supabase service-role enforcement adapter (Edge only).
 * Never import into the browser bundle.
 */

import type {
  AiEnforcementStore,
  AiUsageEventInput,
  BeginRequestResult,
} from './enforcement.ts';
import type { AiPlan } from './aiPolicy.ts';

type RpcClient = {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
};

function asPlan(v: unknown): AiPlan | undefined {
  if (v === 'beta' || v === 'pro' || v === 'owner' || v === 'disabled') return v;
  return undefined;
}

function parseBeginResult(data: unknown): BeginRequestResult {
  if (!data || typeof data !== 'object') {
    throw new Error('enforcement_bad_response');
  }
  const o = data as Record<string, unknown>;
  if (o.ok === true) {
    const plan = asPlan(o.plan) ?? 'beta';
    return {
      ok: true,
      plan,
      quotaLimit: typeof o.quota_limit === 'number' ? o.quota_limit : o.quota_limit === null ? null : null,
      quotaCount: typeof o.quota_count === 'number' ? o.quota_count : null,
      safetyCount: typeof o.safety_count === 'number' ? o.safety_count : 0,
    };
  }
  if (o.ok === false) {
    const code = o.code;
    if (
      code === 'ai_disabled' ||
      code === 'rate_limited' ||
      code === 'quota_exceeded' ||
      code === 'invalid_request'
    ) {
      return { ok: false, code, plan: asPlan(o.plan) };
    }
  }
  throw new Error('enforcement_bad_response');
}

export function createSupabaseEnforcementStore(client: RpcClient): AiEnforcementStore {
  return {
    async beginRequest(userId, capability) {
      const { data, error } = await client.rpc('ai_gateway_begin_request', {
        p_user_id: userId,
        p_capability: capability,
      });
      if (error) {
        throw new Error('enforcement_rpc_failed');
      }
      return parseBeginResult(data);
    },

    async recordUsage(event: AiUsageEventInput) {
      const { error } = await client.rpc('ai_gateway_record_usage', {
        p_user_id: event.userId,
        p_capability: event.capability,
        p_provider_id: event.providerId,
        p_model: event.model,
        p_outcome: event.outcome,
        p_error_code: event.errorCode,
        p_input_tokens: event.inputTokens,
        p_output_tokens: event.outputTokens,
        p_reasoning_tokens: event.reasoningTokens,
        p_total_tokens: event.totalTokens,
        p_estimated_cost_usd_micros: event.estimatedCostUsdMicros,
        p_latency_ms: event.latencyMs,
        p_section_id: event.sectionId,
        p_provider_request_id: event.providerRequestId,
      });
      if (error) {
        return { ok: false as const, reason: 'rpc_error' };
      }
      return { ok: true as const };
    },
  };
}
