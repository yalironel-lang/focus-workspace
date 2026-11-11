import { describe, it, expect, vi } from 'vitest';
import {
  checkProjectSpendingGuard,
  createDistributedSimulationStore,
  createInFlightTracker,
  createPostgresProjectSpendingStore,
  createSupabaseDayUsageLoader,
  getSafeTokenReservation,
  getUtcDayStartIso,
  type ProjectDayUsageStats,
  type ProjectSpendingConfig,
} from './projectLevelSpendingGuard.ts';
import { estimateCostUsdMicros, VERIFIED_GEMINI_PRICE_USD_MICROS_PER_1M } from './aiPricing.ts';
import { normalizeProviderUsage } from './normalizeProviderUsage.ts';
import { normalizeGeminiUsage } from './providerGemini.ts';

describe('Project-Level AI Spending and Capacity Guard (Phase 6C + Phase 6C.1)', () => {
  const dummyUsage: ProjectDayUsageStats = {
    requestCount: 20,
    totalTokens: 50_000,
    totalCostMicros: 300_000, // $0.30
    unpricedRequestCount: 0,
  };

  // ---------------------------------------------------------------------------
  // 1. Two or more independent Edge isolates running concurrently
  // ---------------------------------------------------------------------------
  it('1. Multi-Isolate Concurrency: two isolates coordinate via shared durable store', async () => {
    const simStore = createDistributedSimulationStore();
    const isolateA = simStore.createIsolateWorker('isolate-us-east-1');
    const isolateB = simStore.createIsolateWorker('isolate-eu-west-1');

    const config: ProjectSpendingConfig = { maxDailyRequests: 3 };

    // Request 1 from Isolate A
    const resA1 = await isolateA.begin({
      userId: 'user-1',
      capability: 'ask_course',
      config,
      estimatedTokens: 7000,
    });
    expect(resA1.allowed).toBe(true);

    // Request 2 from Isolate B
    const resB1 = await isolateB.begin({
      userId: 'user-2',
      capability: 'ask_course',
      config,
      estimatedTokens: 7000,
    });
    expect(resB1.allowed).toBe(true);

    // Request 3 from Isolate A
    const resA2 = await isolateA.begin({
      userId: 'user-3',
      capability: 'ask_course',
      config,
      estimatedTokens: 7000,
    });
    expect(resA2.allowed).toBe(true);

    // Request 4 from Isolate B -> Cap reached across isolates!
    const resB2 = await isolateB.begin({
      userId: 'user-4',
      capability: 'ask_course',
      config,
      estimatedTokens: 7000,
    });
    expect(resB2.allowed).toBe(false);
    if (!resB2.allowed) {
      expect(resB2.code).toBe('quota_exceeded');
      expect(resB2.reason).toBe('project_daily_request_limit_exceeded');
    }

    // Verify shared stats reflect all isolates
    expect(simStore.getStats().dailyRequests).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // 2. Simultaneous admission at a nearly exhausted project quota
  // ---------------------------------------------------------------------------
  it('2. Simultaneous Admission: exactly 1 slot remaining, multiple simultaneous requests -> exactly 1 admitted', async () => {
    const simStore = createDistributedSimulationStore();
    const isolate1 = simStore.createIsolateWorker('worker-1');
    const isolate2 = simStore.createIsolateWorker('worker-2');
    const isolate3 = simStore.createIsolateWorker('worker-3');

    const config: ProjectSpendingConfig = { maxDailyRequests: 1 };

    // 3 concurrent requests arrive simultaneously at the quota boundary
    const [r1, r2, r3] = await Promise.all([
      isolate1.begin({ userId: 'u1', capability: 'ask_course', config, estimatedTokens: 5000 }),
      isolate2.begin({ userId: 'u2', capability: 'ask_course', config, estimatedTokens: 5000 }),
      isolate3.begin({ userId: 'u3', capability: 'ask_course', config, estimatedTokens: 5000 }),
    ]);

    const admitted = [r1, r2, r3].filter((r) => r.allowed);
    const denied = [r1, r2, r3].filter((r) => !r.allowed);

    expect(admitted.length).toBe(1);
    expect(denied.length).toBe(2);
    expect(simStore.getStats().dailyRequests).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 3. Dynamic Safe Token Sizing & Concurrent Reservations
  // ---------------------------------------------------------------------------
  it('3. Dynamic Safe Token Reservations: correctly sizes capabilities and guards token ceiling', async () => {
    // Sizing verification: includes safe embedding allowance for ask_course
    expect(getSafeTokenReservation('explain_selection')).toBe(3500);
    expect(getSafeTokenReservation('ask_course', 'gpt-4o')).toBe(10000);
    expect(getSafeTokenReservation('ask_course', 'gpt-5.6-luna')).toBe(17500);
    expect(getSafeTokenReservation('ask_course', 'gemini-3.6-flash')).toBe(17500);

    const simStore = createDistributedSimulationStore();
    const isolate = simStore.createIsolateWorker('worker-tokens');
    const config: ProjectSpendingConfig = { maxDailyTokens: 25_000 };

    // Request A reserves 16,000 tokens (Gemini reasoning)
    const resA = await isolate.begin({
      userId: 'u1',
      capability: 'ask_course',
      config,
      estimatedTokens: 16_000,
    });
    expect(resA.allowed).toBe(true);

    // Request B attempts another 16,000 tokens (16k + 16k = 32k > 25k) -> Blocked!
    const resB = await isolate.begin({
      userId: 'u2',
      capability: 'ask_course',
      config,
      estimatedTokens: 16_000,
    });
    expect(resB.allowed).toBe(false);
    if (!resB.allowed) {
      expect(resB.reason).toBe('project_daily_token_limit_exceeded');
    }

    // Request C attempts 8,500 tokens (16k + 8.5k = 24.5k <= 25k) -> Allowed!
    const resC = await isolate.begin({
      userId: 'u3',
      capability: 'ask_course',
      config,
      estimatedTokens: 8_500,
    });
    expect(resC.allowed).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 4. Reservation Expiration
  // ---------------------------------------------------------------------------
  it('4. Reservation Expiration: unsettled reservation automatically expires after 5 minutes', async () => {
    const simStore = createDistributedSimulationStore();
    const isolate = simStore.createIsolateWorker('worker-exp');
    const config: ProjectSpendingConfig = { maxDailyTokens: 10_000 };

    const t0 = new Date('2026-10-27T10:00:00Z');
    const res = await isolate.begin({
      userId: 'u1',
      capability: 'ask_course',
      config,
      estimatedTokens: 8000,
      now: t0,
    });
    expect(res.allowed).toBe(true);

    // At t0 + 1 min, capacity is still occupied (8k reserved out of 10k)
    const t1 = new Date('2026-10-27T10:01:00Z');
    const resBlocked = await isolate.begin({
      userId: 'u2',
      capability: 'ask_course',
      config,
      estimatedTokens: 5000,
      now: t1,
    });
    expect(resBlocked.allowed).toBe(false);

    // At t0 + 6 min (past 5m expiration), old reservation is purged automatically
    const t2 = new Date('2026-10-27T10:06:00Z');
    const resAdmitted = await isolate.begin({
      userId: 'u3',
      capability: 'ask_course',
      config,
      estimatedTokens: 5000,
      now: t2,
    });
    expect(resAdmitted.allowed).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 5. Worker Crash Before Settlement
  // ---------------------------------------------------------------------------
  it('5. Worker Crash: worker crashes mid-request; capacity is safely reclaimed upon expiration', async () => {
    const simStore = createDistributedSimulationStore();
    const worker = simStore.createIsolateWorker('worker-crash');
    const config: ProjectSpendingConfig = { maxDailyTokens: 15_000 };

    const start = new Date('2026-10-27T12:00:00Z');
    const decision = await worker.begin({
      userId: 'crashed-user',
      capability: 'ask_course',
      config,
      estimatedTokens: 12_000,
      now: start,
    });
    expect(decision.allowed).toBe(true);

    // Worker isolate abruptly terminates (no settleReservation, no releaseReservation called)
    // 6 minutes later:
    const future = new Date('2026-10-27T12:06:00Z');
    expect(simStore.getStats(future).activeReservedTokens).toBe(0);

    // New worker can immediately use the reclaimed capacity
    const nextDecision = await worker.begin({
      userId: 'healthy-user',
      capability: 'ask_course',
      config,
      estimatedTokens: 12_000,
      now: future,
    });
    expect(nextDecision.allowed).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 6. Provider Error After Token Consumption
  // ---------------------------------------------------------------------------
  it('6. Provider Error Settlement: billable tokens consumed before error are settled into project total', async () => {
    const simStore = createDistributedSimulationStore();
    const isolate = simStore.createIsolateWorker('worker-err');
    const config: ProjectSpendingConfig = { maxDailyTokens: 10_000 };

    const decision = await isolate.begin({
      userId: 'u1',
      capability: 'ask_course',
      config,
      estimatedTokens: 7000,
    });
    expect(decision.allowed).toBe(true);

    // Upstream provider processed 3,500 input tokens then returned HTTP 500
    // Settlement records actual consumed tokens
    if (decision.allowed) {
      await decision.settleReservation(3500);
    }

    const stats = simStore.getStats();
    expect(stats.settledTokens).toBe(3500);
    expect(stats.activeReservedTokens).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 7. Unknown Model Prices (gpt-5.6-luna)
  // ---------------------------------------------------------------------------
  it('7. Unknown Model Prices: fails closed when budget is set without token caps; succeeds with token caps', async () => {
    // gpt-5.6-luna returns null cost estimate
    const costEstimate = estimateCostUsdMicros('gpt-5.6-luna', {
      inputTokens: 1500,
      outputTokens: 500,
    });
    expect(costEstimate).toBeNull();

    // Budget-only configuration fails closed for unpriced models
    const budgetOnlyConfig: ProjectSpendingConfig = { maxDailyCostMicros: 1_000_000 };
    const unpricedUsage: ProjectDayUsageStats = {
      ...dummyUsage,
      unpricedRequestCount: 2,
    };
    const resBlocked = await checkProjectSpendingGuard({
      config: budgetOnlyConfig,
      loadDayUsage: async () => unpricedUsage,
    });
    expect(resBlocked.allowed).toBe(false);
    if (!resBlocked.allowed) {
      expect(resBlocked.reason).toBe('project_daily_budget_exceeded');
      expect(resBlocked.message).toContain('unpriced models without token limits');
    }

    // Configured with token cap -> protected deterministically by token bounds
    const safeConfig: ProjectSpendingConfig = {
      maxDailyCostMicros: 1_000_000,
      maxDailyTokens: 100_000,
    };
    const resAllowed = await checkProjectSpendingGuard({
      config: safeConfig,
      loadDayUsage: async () => unpricedUsage,
    });
    expect(resAllowed.allowed).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 8. Reasoning Token Accounting
  // ---------------------------------------------------------------------------
  it('8. Reasoning Token Accounting: verifies no double-counting between output and reasoning tokens', () => {
    // OpenAI raw usage format: completion_tokens includes reasoning_tokens
    const rawOpenAiUsage = {
      prompt_tokens: 1000,
      completion_tokens: 800, // already includes 300 reasoning tokens
      total_tokens: 1800,
      completion_tokens_details: {
        reasoning_tokens: 300,
      },
    };
    const normOpenAi = normalizeProviderUsage(rawOpenAiUsage);
    expect(normOpenAi).toEqual({
      inputTokens: 1000,
      outputTokens: 800,
      reasoningTokens: 300,
      totalTokens: 1800, // 1000 + 800 (not 1000 + 800 + 300)
    });

    // Gemini raw usage format: candidatesTokenCount excludes thoughtsTokenCount in v1beta API
    // totalTokenCount = promptTokenCount + candidatesTokenCount + thoughtsTokenCount
    // Google bills thoughtsTokenCount at standard output rate, so billed output = candidates + thoughts
    const rawGeminiUsage = {
      promptTokenCount: 1500,
      candidatesTokenCount: 2000, // visible text
      thoughtsTokenCount: 500, // reasoning/thinking tokens
      totalTokenCount: 4000, // 1500 + 2000 + 500
    };
    const normGemini = normalizeGeminiUsage(rawGeminiUsage);
    expect(normGemini).toEqual({
      inputTokens: 1500,
      outputTokens: 2500, // 2000 candidates + 500 thoughts (billed output tokens)
      reasoningTokens: 500,
      totalTokens: 4000,
    });

    // Verified Gemini cost calculation
    const geminiCost = estimateCostUsdMicros(
      'gemini-3.6-flash',
      normGemini!,
      VERIFIED_GEMINI_PRICE_USD_MICROS_PER_1M,
    );
    // input: 1500 * $1.50 / 1M = 2250 micros ($0.00225)
    // output: 2500 * $7.50 / 1M = 18750 micros ($0.01875)
    // total: 21000 micros ($0.02100)
    expect(geminiCost).toBe(21000);
  });

  // ---------------------------------------------------------------------------
  // 9. UTC Day Rollover
  // ---------------------------------------------------------------------------
  it('9. UTC Day Rollover: counters reset cleanly at UTC midnight', async () => {
    const simStore = createDistributedSimulationStore();
    const isolate = simStore.createIsolateWorker('worker-utc');
    const config: ProjectSpendingConfig = { maxDailyRequests: 2 };

    const day1 = new Date('2026-10-27T23:59:00Z');
    const r1 = await isolate.begin({ userId: 'u1', capability: 'ask_course', config, estimatedTokens: 1000, now: day1 });
    const r2 = await isolate.begin({ userId: 'u2', capability: 'ask_course', config, estimatedTokens: 1000, now: day1 });
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);

    // Limit reached on day 1
    const rBlockedDay1 = await isolate.begin({ userId: 'u3', capability: 'ask_course', config, estimatedTokens: 1000, now: day1 });
    expect(rBlockedDay1.allowed).toBe(false);

    // Roll over to Day 2 (UTC midnight)
    const day2 = new Date('2026-10-28T00:00:05Z');
    const rAllowedDay2 = await isolate.begin({ userId: 'u4', capability: 'ask_course', config, estimatedTokens: 1000, now: day2 });
    expect(rAllowedDay2.allowed).toBe(true);
    expect(simStore.getStats(day2).dailyRequests).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 10. Emergency Disable
  // ---------------------------------------------------------------------------
  it('10. Emergency Disable: returns 403 ai_disabled instantly with zero store interaction', async () => {
    const storeMock = { begin: vi.fn() };
    const config: ProjectSpendingConfig = { emergencyDisable: true };

    const res = await checkProjectSpendingGuard({
      config,
      store: storeMock,
      userId: 'test-user',
    });

    expect(res.allowed).toBe(false);
    if (!res.allowed) {
      expect(res.code).toBe('ai_disabled');
      expect(res.reason).toBe('emergency_disabled');
      expect(res.message).toBe('AI services are temporarily disabled for maintenance.');
    }
    expect(storeMock.begin).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 11. Existing Baseline Requests & Release on Preflight Abort
  // ---------------------------------------------------------------------------
  it('11. Release on Abort: releasing reservation decrements request count and removes reservation', async () => {
    const simStore = createDistributedSimulationStore();
    const isolate = simStore.createIsolateWorker('worker-abort');
    const config: ProjectSpendingConfig = { maxDailyRequests: 5 };

    const decision = await isolate.begin({
      userId: 'user-abort',
      capability: 'explain_selection',
      config,
      estimatedTokens: 3500,
    });
    expect(decision.allowed).toBe(true);
    expect(simStore.getStats().dailyRequests).toBe(1);

    // Request is aborted before provider dispatch (e.g. client disconnects or auth fails)
    if (decision.allowed) {
      await decision.releaseReservation();
    }

    // Reservation released and request count rolled back
    expect(simStore.getStats().dailyRequests).toBe(0);
    expect(simStore.getStats().activeReservedTokens).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 12. PostgreSQL RPC Store Adapter Wire Tests
  // ---------------------------------------------------------------------------
  it('12. Postgres Store Adapter: correctly invokes begin, settle, and release RPCs', async () => {
    const rpcMock = vi.fn().mockImplementation((fn: string, args: Record<string, unknown>) => {
      if (fn === 'ai_gateway_project_begin') {
        return Promise.resolve({
          data: { ok: true, reservation_id: 'test-res-uuid-123' },
          error: null,
        });
      }
      if (fn === 'ai_gateway_project_settle' || fn === 'ai_gateway_project_release') {
        return Promise.resolve({ data: fn==='ai_gateway_project_settle'?{ ok: true, settled_tokens:args.p_actual_tokens }:{ok:true,released:true}, error: null });
      }
      return Promise.resolve({ data: null, error: { message: 'unknown function' } });
    });

    const postgresStore = createPostgresProjectSpendingStore({ rpc: rpcMock });
    const config: ProjectSpendingConfig = { maxDailyRequests: 50, maxDailyTokens: 200_000 };

    const decision = await postgresStore.begin({
      userId: 'test-user-id',
      capability: 'ask_course',
      config,
      estimatedTokens: 7000,
    });

    expect(decision.allowed).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('ai_gateway_project_begin', {
      p_user_id: 'test-user-id',
      p_capability: 'ask_course',
      p_emergency_disable: false,
      p_max_daily_requests: 50,
      p_max_daily_tokens: 200_000,
      p_estimated_tokens: 7000,
    });

    if (decision.allowed) {
      await decision.settleReservation(6400);
      expect(rpcMock).toHaveBeenCalledWith('ai_gateway_project_settle', {
        p_reservation_id: 'test-res-uuid-123',
        p_actual_tokens: 6400,
      });

      expect(await decision.releaseReservation()).toEqual({ok:false,error:'ACCOUNTING_UNCONFIRMED'});
      expect(rpcMock).toHaveBeenCalledTimes(2); // never release a settled reservation
    }
  });

  // ---------------------------------------------------------------------------
  // 13. Supabase Day Usage Loader includes failed and timeout events
  // ---------------------------------------------------------------------------
  it('13. Supabase Day Usage Loader: aggregates all token-consuming outcomes, including provider errors', async () => {
    const mockRows = [
      { total_tokens: 2000, estimated_cost_usd_micros: 10000 },
      { total_tokens: 3000, estimated_cost_usd_micros: null }, // Unpriced
      { total_tokens: 1500, estimated_cost_usd_micros: 7500 }, // Failed attempt with token consumption
    ];

    const mockIn = vi.fn().mockResolvedValue({ data: mockRows, error: null });
    const mockGte = vi.fn().mockReturnValue({ in: mockIn });
    const mockSelect = vi.fn().mockReturnValue({ gte: mockGte });
    const mockClient = { from: vi.fn().mockReturnValue({ select: mockSelect }) };

    const loader = createSupabaseDayUsageLoader(mockClient as any);
    const stats = await loader(getUtcDayStartIso());

    expect(stats).toEqual({
      requestCount: 3,
      totalTokens: 6500,
      totalCostMicros: 17500,
      unpricedRequestCount: 1,
    });
    expect(mockIn).toHaveBeenCalledWith('outcome', [
      'success',
      'provider_error',
      'provider_timeout',
      'bad_response',
    ]);
  });

  // ---------------------------------------------------------------------------
  // 14. Crash-Safe Expired Reservation Accounting
  // ---------------------------------------------------------------------------
  it('14. Crash-Safe Accounting: dispatched reservation that times out charges reservedTokens to dailyTokens', async () => {
    const simStore = createDistributedSimulationStore();
    const worker = simStore.createIsolateWorker('worker-crash-test');
    const config: ProjectSpendingConfig = { maxDailyTokens: 50_000 };

    const t0 = new Date('2026-10-27T10:00:00Z');
    const decision = await worker.begin({
      userId: 'user-crashed',
      capability: 'ask_course',
      config,
      estimatedTokens: 8500,
      now: t0,
    });
    expect(decision.allowed).toBe(true);

    // Worker dispatches to provider
    if (decision.allowed) {
      await decision.dispatchReservation?.();
    }

    // Now worker crashes. 6 minutes elapse without settlement.
    const tExpired = new Date('2026-10-27T10:06:00Z');
    const statsAfterCrash = simStore.getStats(tExpired);

    // Conservative policy: the 8500 tokens were NOT erased as zero! They were committed to settledTokens.
    expect(statsAfterCrash.settledTokens).toBe(8500);
    expect(statsAfterCrash.activeReservedTokens).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 15. Late Settlement Reconciliation
  // ---------------------------------------------------------------------------
  it('15. Late Settlement Reconciliation: late settlement reconciles difference without double-counting', async () => {
    const simStore = createDistributedSimulationStore();
    const worker = simStore.createIsolateWorker('worker-slow');
    const config: ProjectSpendingConfig = { maxDailyTokens: 50_000 };

    const t0 = new Date('2026-10-27T10:00:00Z');
    const decision = await worker.begin({
      userId: 'user-slow',
      capability: 'ask_course',
      config,
      estimatedTokens: 8500,
      now: t0,
    });
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      await decision.dispatchReservation?.();
    }

    // 6 minutes elapse: reservation expires and assumes 8500 tokens consumed
    const tExpired = new Date('2026-10-27T10:06:00Z');
    simStore.getStats(tExpired);
    expect(simStore.getStats(tExpired).settledTokens).toBe(8500);

    // Worker eventually returns with actual usage of 4200 tokens
    if (decision.allowed) {
      await decision.settleReservation(4200);
    }

    // Daily tokens reconciled: 8500 + (4200 - 8500) = 4200 tokens!
    expect(simStore.getStats(tExpired).settledTokens).toBe(4200);
  });

  // ---------------------------------------------------------------------------
  // 16. Bounds Validation: Reasoning Models Safe Reservation
  // ---------------------------------------------------------------------------
  it('16. Bounds Validation: gpt-5.6-luna and gemini-3.6-flash reserve 16,000 / 17,500 tokens', () => {
    expect(getSafeTokenReservation('explain_selection', 'gpt-5.6-luna')).toBe(16_000);
    expect(getSafeTokenReservation('ask_course', 'gpt-5.6-luna')).toBe(17_500);
    expect(getSafeTokenReservation('ask_course', 'gemini-3.6-flash')).toBe(17_500);
    expect(getSafeTokenReservation('ask_course', 'o3-mini')).toBe(17_500);
    expect(getSafeTokenReservation('ask_course', 'gpt-4o')).toBe(10_000);
    expect(getSafeTokenReservation('explain_selection', 'gpt-4o')).toBe(3_500);
  });

  // ---------------------------------------------------------------------------
  // 17. Supabase Client Compatibility: PostgrestFilterBuilder PromiseLike (no .catch)
  // ---------------------------------------------------------------------------
  it('17. Supabase Client Compatibility: handles PostgrestFilterBuilder lacking .catch without throwing', async () => {
    // PostgrestFilterBuilder implements PromiseLike (has .then), but NOT .catch
    const createMockFilterBuilder = (resolveVal: unknown) => ({
      then(onFulfilled?: ((value: unknown) => unknown) | null, onRejected?: ((reason: unknown) => unknown) | null) {
        return Promise.resolve(resolveVal).then(onFulfilled, onRejected);
      },
      // Note: NO .catch method present, exactly matching PostgrestFilterBuilder in @supabase/supabase-js
    });

    const mockClient = {
      rpc: vi.fn((fnName: string, args: Record<string, unknown>) => {
        if (fnName === 'ai_gateway_project_begin') {
          return createMockFilterBuilder({
            data: { ok: true, reservation_id: 'test-res-123' },
            error: null,
          });
        }
        return createMockFilterBuilder({ data: null, error: null });
      }),
    };

    const store = createPostgresProjectSpendingStore(mockClient as any);
    const decision = await store.begin({
      userId: 'user-compat-test',
      capability: 'ask_course',
      config: { maxDailyRequests: 20 },
      estimatedTokens: 5000,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reservationId).toBe('test-res-123');

    // These must execute cleanly and not throw "client.rpc(...).catch is not a function"
    await expect(decision.dispatchReservation?.()).resolves.not.toThrow();
    await expect(decision.releaseReservation?.()).resolves.not.toThrow();
    await expect(decision.settleReservation?.(100)).resolves.not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // 18. RPC Lifecycle Reliability: Thrown exceptions fail closed / return errors
  // ---------------------------------------------------------------------------
  it('18. RPC Lifecycle Reliability: handles thrown exceptions with sanitized diagnostics', async () => {
    // 18.1 Begin RPC throws -> fails closed
    const throwingClient = {
      rpc: vi.fn(async () => {
        throw new Error('Connection refused to pooler');
      }),
    };
    const store = createPostgresProjectSpendingStore(throwingClient as any);
    const beginDecision = await store.begin({
      userId: 'user-err-1',
      capability: 'ask_course',
      config: { maxDailyRequests: 10 },
      estimatedTokens: 9500,
    });
    expect(beginDecision.allowed).toBe(false);
    if (!beginDecision.allowed) {
      expect(beginDecision.code).toBe('quota_exceeded');
    }

    // 18.2 Dispatch / Release / Settle throw -> return { ok: false } without unhandled crash
    const clientForLifecycle = {
      rpc: vi.fn(async (fnName: string) => {
        if (fnName === 'ai_gateway_project_begin') {
          return { data: { ok: true, reservation_id: 'res-thrown-test' }, error: null };
        }
        throw new Error('Network timeout');
      }),
    };
    const store2 = createPostgresProjectSpendingStore(clientForLifecycle as any);
    const decision2 = await store2.begin({
      userId: 'user-err-2',
      capability: 'ask_course',
      config: { maxDailyRequests: 10 },
      estimatedTokens: 9500,
    });
    expect(decision2.allowed).toBe(true);

    const dispatchRes = await decision2.dispatchReservation?.();
    expect(dispatchRes?.ok).toBe(false);

    // Because it was dispatched, releaseReservation delegates to settleInternal
    const releaseRes = await decision2.releaseReservation();
    expect(releaseRes?.ok).toBe(false);

    const settleRes = await decision2.settleReservation(500);
    expect(settleRes?.ok).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 19. RPC Lifecycle Reliability: Resolved { error } results fail closed / return errors
  // ---------------------------------------------------------------------------
  it('19. RPC Lifecycle Reliability: inspects resolved { error } without exceptions', async () => {
    // 19.1 Begin RPC resolves with error -> fails closed
    const errorClient = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: 'relation "ai_project_usage_counters" does not exist' },
      })),
    };
    const store = createPostgresProjectSpendingStore(errorClient as any);
    const beginDecision = await store.begin({
      userId: 'user-err-3',
      capability: 'ask_course',
      config: { maxDailyRequests: 10 },
      estimatedTokens: 9500,
    });
    expect(beginDecision.allowed).toBe(false);

    // 19.2 Dispatch / Release / Settle resolve with error
    const clientForErrors = {
      rpc: vi.fn(async (fnName: string) => {
        if (fnName === 'ai_gateway_project_begin') {
          return { data: { ok: true, reservation_id: 'res-error-obj-test' }, error: null };
        }
        return { data: null, error: { message: 'Lock wait timeout exceeded' } };
      }),
    };
    const store2 = createPostgresProjectSpendingStore(clientForErrors as any);
    const decision2 = await store2.begin({
      userId: 'user-err-4',
      capability: 'ask_course',
      config: { maxDailyRequests: 10 },
      estimatedTokens: 9500,
    });
    expect(decision2.allowed).toBe(true);

    const dispatchRes = await decision2.dispatchReservation?.();
    expect(dispatchRes?.ok).toBe(false);
    expect(dispatchRes?.error).toBe('ACCOUNTING_UNCONFIRMED');

    const releaseRes = await decision2.releaseReservation();
    expect(releaseRes?.ok).toBe(false);
    expect(releaseRes?.error).toBe('ACCOUNTING_UNCONFIRMED');

    const settleRes = await decision2.settleReservation(750);
    expect(settleRes?.ok).toBe(false);
    expect(settleRes?.error).toBe('ACCOUNTING_UNCONFIRMED');
  });

  // ---------------------------------------------------------------------------
  // 20. Embedding Cost Coverage: Successful Embedding + Generation Accounting
  // ---------------------------------------------------------------------------
  it('20. Embedding Cost Coverage: accounts for embedding tokens alongside generation without double-counting', async () => {
    const simStore = createDistributedSimulationStore();
    const worker = simStore.createIsolateWorker('worker-embed-gen');
    const config: ProjectSpendingConfig = { maxDailyRequests: 5, maxDailyTokens: 50_000 };

    const decision = await worker.begin({
      userId: 'user-embed-1',
      capability: 'ask_course',
      config,
      estimatedTokens: 9500,
    });
    expect(decision.allowed).toBe(true);

    // 1. Dispatch before embedding
    await decision.dispatchReservation?.();
    expect(decision.isDispatched?.()).toBe(true);

    // 2. Embedding consumes 35 tokens, LLM generation consumes 700 tokens -> total 735 tokens
    const embeddingTokens = 35;
    const generationTokens = 700;
    const totalActualTokens = embeddingTokens + generationTokens;

    await decision.settleReservation(totalActualTokens);

    const stats = simStore.getStats();
    expect(stats.dailyRequests).toBe(1);
    expect(stats.settledTokens).toBe(735);
    expect(stats.activeReservedTokens).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 21. Embedding Cost Coverage: Failed Embedding With Known Usage Settled Conservatively
  // ---------------------------------------------------------------------------
  it('21. Embedding Cost Coverage: failed embedding with known usage is settled rather than released as zero', async () => {
    const simStore = createDistributedSimulationStore();
    const worker = simStore.createIsolateWorker('worker-embed-fail-known');
    const config: ProjectSpendingConfig = { maxDailyRequests: 5, maxDailyTokens: 50_000 };

    const decision = await worker.begin({
      userId: 'user-embed-fail-1',
      capability: 'ask_course',
      config,
      estimatedTokens: 9500,
    });
    expect(decision.allowed).toBe(true);

    // Dispatched upstream to provider
    await decision.dispatchReservation?.();

    // Provider returns 429 after consuming 42 input tokens
    const consumedTokens = 42;
    await decision.settleReservation(consumedTokens);

    const stats = simStore.getStats();
    expect(stats.dailyRequests).toBe(1); // 1 request consumed
    expect(stats.settledTokens).toBe(42); // 42 billable tokens recorded
    expect(stats.activeReservedTokens).toBe(0); // in-flight freed
  });

  // ---------------------------------------------------------------------------
  // 22. Embedding Cost Coverage: Dispatched Reservation Never Released As Zero
  // ---------------------------------------------------------------------------
  it('22. Embedding Cost Coverage: dispatched reservation safely settles conservatively if releaseReservation is called', async () => {
    const simStore = createDistributedSimulationStore();
    const worker = simStore.createIsolateWorker('worker-safety-check');
    const config: ProjectSpendingConfig = { maxDailyRequests: 5, maxDailyTokens: 50_000 };

    const decision = await worker.begin({
      userId: 'user-safety-1',
      capability: 'ask_course',
      config,
      estimatedTokens: 9500,
    });
    expect(decision.allowed).toBe(true);

    // Provider dispatch occurs
    await decision.dispatchReservation?.();
    expect(decision.isDispatched?.()).toBe(true);

    // If an error handler calls releaseReservation() instead of settleReservation:
    // It must NOT zero out the billable dispatch! It settles conservatively with estimatedTokens.
    await decision.releaseReservation();

    const stats = simStore.getStats();
    expect(stats.dailyRequests).toBe(1);
    expect(stats.settledTokens).toBe(9500);
    expect(stats.activeReservedTokens).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 23. Embedding Cost Coverage: Pre-Dispatch Failure Safely Releases Slot
  // ---------------------------------------------------------------------------
  it('23. Embedding Cost Coverage: pre-dispatch failure cleanly releases request count and zero tokens', async () => {
    const simStore = createDistributedSimulationStore();
    const worker = simStore.createIsolateWorker('worker-predispatch');
    const config: ProjectSpendingConfig = { maxDailyRequests: 5, maxDailyTokens: 50_000 };

    const decision = await worker.begin({
      userId: 'user-predispatch-1',
      capability: 'ask_course',
      config,
      estimatedTokens: 9500,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.isDispatched?.()).toBe(false);

    // Preflight check fails (e.g. invalid course section, not dispatched upstream)
    await decision.releaseReservation();

    const stats = simStore.getStats();
    expect(stats.dailyRequests).toBe(0); // Decremented back to 0
    expect(stats.settledTokens).toBe(0);
    expect(stats.activeReservedTokens).toBe(0);
  });
});



