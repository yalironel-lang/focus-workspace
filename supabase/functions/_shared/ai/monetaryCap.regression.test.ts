import { describe, it, expect, vi } from 'vitest';
import {
  checkProjectSpendingGuard,
  createPostgresProjectSpendingStore,
} from './projectLevelSpendingGuard.ts';

describe('Task A: Monetary-Cap Protection Regressions', () => {
  it('dollar-only limits fail closed against durable store without calling rpc', async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, reservation_id: 'r1' }, error: null }));
    const store = createPostgresProjectSpendingStore({ rpc });

    const decision = await checkProjectSpendingGuard({
      config: { maxDailyCostMicros: 10_000_000 }, // $10 cap, no token limit
      estimatedRequestTokens: 1000,
      userId: 'test-user-1',
      capability: 'ask_course',
      store,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('quota_exceeded');
    expect(decision.reason).toBe('project_daily_budget_exceeded');
    expect(decision.message).toContain('AI budget enforcement is unavailable');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('combined dollar and token limits fail closed to prevent unverified monetary claims', async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, reservation_id: 'r2' }, error: null }));
    const store = createPostgresProjectSpendingStore({ rpc });

    const decision = await checkProjectSpendingGuard({
      config: {
        maxDailyCostMicros: 5_000_000,
        maxDailyTokens: 50_000,
        maxDailyRequests: 100,
      },
      estimatedRequestTokens: 1000,
      userId: 'test-user-2',
      capability: 'ask_course',
      store,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('quota_exceeded');
    expect(decision.reason).toBe('project_daily_budget_exceeded');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('missing token limits with positive dollar limit fail closed', async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, reservation_id: 'r3' }, error: null }));
    const store = createPostgresProjectSpendingStore({ rpc });

    const decision = await checkProjectSpendingGuard({
      config: {
        maxDailyCostMicros: 1_000_000,
        maxDailyTokens: null,
      },
      estimatedRequestTokens: 500,
      userId: 'test-user-3',
      capability: 'explain_selection',
      store,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('project_daily_budget_exceeded');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('unsupported monetary configurations (negative, non-integer, NaN) fail closed', async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, reservation_id: 'r4' }, error: null }));
    const store = createPostgresProjectSpendingStore({ rpc });

    for (const invalidCost of [-100, 12.345, NaN, Infinity]) {
      const decision = await checkProjectSpendingGuard({
        config: { maxDailyCostMicros: invalidCost as any },
        estimatedRequestTokens: 500,
        userId: 'test-user-4',
        capability: 'ask_course',
        store,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe('quota_exceeded');
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it('token-only configurations with null or unset cost limits are admitted normally', async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'ai_gateway_project_begin') {
        return { data: { ok: true, reservation_id: 'valid-res-id' }, error: null };
      }
      return { data: { ok: true }, error: null };
    });
    const store = createPostgresProjectSpendingStore({ rpc });

    const decision = await checkProjectSpendingGuard({
      config: {
        maxDailyRequests: 50,
        maxDailyTokens: 100_000,
        maxDailyCostMicros: null,
      },
      estimatedRequestTokens: 1500,
      userId: 'test-user-5',
      capability: 'ask_course',
      store,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reservationId).toBe('valid-res-id');
    expect(rpc).toHaveBeenCalledWith('ai_gateway_project_begin', {
      p_user_id: 'test-user-5',
      p_capability: 'ask_course',
      p_emergency_disable: false,
      p_max_daily_requests: 50,
      p_max_daily_tokens: 100_000,
      p_estimated_tokens: 1500,
    });
  });

  it('durable store with missing or whitespace-only userId fails closed', async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, reservation_id: 'r5' }, error: null }));
    const store = createPostgresProjectSpendingStore({ rpc });

    for (const emptyUser of ['', '   ', undefined as any]) {
      const decision = await checkProjectSpendingGuard({
        config: { maxDailyRequests: 100 },
        estimatedRequestTokens: 1000,
        userId: emptyUser,
        capability: 'ask_course',
        store,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe('quota_exceeded');
      expect(rpc).not.toHaveBeenCalled();
    }
  });
});
