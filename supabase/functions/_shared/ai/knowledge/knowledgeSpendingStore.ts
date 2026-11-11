import {
  createPostgresProjectSpendingStore,
  type ProjectSpendingConfig,
} from '../projectLevelSpendingGuard.ts';

export type KnowledgeSpendingStoreDeps = {
  begin: (input: {
    userId: string;
    capability: 'knowledge_index_embed';
    estimatedTokens: number;
    chunkCount: number;
  }) => Promise<{
    allowed: boolean;
    reservationId?: string | null;
    code?: string;
    reason?: string;
    message?: string;
    dispatchReservation?: () => Promise<{ ok: boolean; error?: string }>;
    settleReservation?: (actualTokens?: number) => Promise<{ ok: boolean; error?: string }>;
    releaseReservation?: () => Promise<{ ok: boolean; error?: string }>;
  }>;
};

/**
 * Creates a durable PostgreSQL spending store adapter for knowledge embedding ingestion.
 * Enforces project-level daily request and token ceilings before paid provider dispatch.
 */
export function createKnowledgeSpendingStore(
  adminClient: {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  },
  config?: ProjectSpendingConfig,
): KnowledgeSpendingStoreDeps {
  const store = createPostgresProjectSpendingStore(adminClient);

  const getEnv = (key: string): string => {
    try {
      if (typeof Deno !== 'undefined' && Deno.env?.get) {
        return Deno.env.get(key) ?? '';
      }
    } catch {
      // best-effort
    }
    return '';
  };

  const emergencyDisable =
    config?.emergencyDisable ??
    getEnv('AI_EMERGENCY_DISABLE').trim().toLowerCase() === 'true';

  const maxDailyRequestsRaw = getEnv('AI_PROJECT_MAX_DAILY_REQUESTS');
  const maxDailyTokensRaw = getEnv('AI_PROJECT_MAX_DAILY_TOKENS');
  const maxDailyBudgetMicrosRaw = getEnv('AI_PROJECT_MAX_DAILY_BUDGET_USD_MICROS');

  const resolvedConfig: ProjectSpendingConfig = {
    emergencyDisable,
    maxDailyRequests:
      config?.maxDailyRequests !== undefined
        ? config.maxDailyRequests
        : maxDailyRequestsRaw
          ? Number(maxDailyRequestsRaw)
          : null,
    maxDailyTokens:
      config?.maxDailyTokens !== undefined
        ? config.maxDailyTokens
        : maxDailyTokensRaw
          ? Number(maxDailyTokensRaw)
          : null,
    maxDailyCostMicros:
      config?.maxDailyCostMicros !== undefined
        ? config.maxDailyCostMicros
        : maxDailyBudgetMicrosRaw
          ? Number(maxDailyBudgetMicrosRaw)
          : null,
  };

  return {
    async begin(input: {
      userId: string;
      capability: 'knowledge_index_embed';
      estimatedTokens: number;
      chunkCount: number;
    }) {
      if (!input.userId || typeof input.userId !== 'string' || input.userId.trim().length === 0) {
        return {
          allowed: false,
          code: 'quota_exceeded',
          reason: 'invalid_user_id',
          message: 'AI usage controls are temporarily unavailable. Try again shortly.',
        };
      }

      const decision = await store.begin({
        userId: input.userId.trim(),
        capability: input.capability,
        config: resolvedConfig,
        estimatedTokens: input.estimatedTokens,
      });

      if (!decision.allowed) {
        return {
          allowed: false,
          code: decision.code,
          reason: decision.reason,
          message: decision.message,
        };
      }

      return {
        allowed: true,
        reservationId: decision.reservationId,
        dispatchReservation: decision.dispatchReservation,
        settleReservation: decision.settleReservation,
        releaseReservation: decision.releaseReservation,
      };
    },
  };
}
