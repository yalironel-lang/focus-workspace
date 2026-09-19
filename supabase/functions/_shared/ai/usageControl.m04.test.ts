/**
 * @vitest-environment node
 *
 * M0.4 — entitlements, safety rate limit, product quota, usage accounting.
 * Mocked provider + in-memory enforcement. No live provider / no remote DB.
 */

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AI_QUOTA_BETA_REQUESTS_PER_DAY,
  AI_QUOTA_PRO_REQUESTS_PER_DAY,
  AI_SAFETY_REQUESTS_PER_WINDOW,
  resolveDailyRequestLimit,
} from '../../../../supabase/functions/_shared/ai/aiPolicy.ts';
import {
  AI_MODEL_PRICE_USD_MICROS_PER_1M,
  estimateCostUsdMicros,
} from '../../../../supabase/functions/_shared/ai/aiPricing.ts';
import { createMemoryEnforcementStore } from '../../../../supabase/functions/_shared/ai/enforcement.ts';
import { normalizeProviderUsage } from '../../../../supabase/functions/_shared/ai/normalizeProviderUsage.ts';
import { runGatewayPipeline } from '../../../../supabase/functions/_shared/ai/runGatewayPipeline.ts';
import type { AiProvider } from '../../../../supabase/functions/_shared/ai/providerTypes.ts';
import type { GatewayAiContext, ZikukAiRequest } from '../../../../supabase/functions/_shared/ai/requestTypes.ts';
import { validateZikukAiRequest } from '../../../../supabase/functions/_shared/ai/validateRequest.ts';

function baseContext(overrides?: Partial<GatewayAiContext>): GatewayAiContext {
  return {
    version: 1,
    capturedAt: '2026-09-19T12:00:00.000Z',
    identity: { userId: 'user-auth-1' },
    academic: { sectionId: 'section-uuid-1', sectionTitle: 'Calculus I' },
    surface: {
      type: 'notebook',
      notebookObjectId: 'ps-notebook-1',
      pageId: 'page-1',
      pageKey: 'page-1',
    },
    focus: {
      kind: 'text',
      text: 'Explain derivatives.',
      from: 0,
      to: 19,
      blockKind: 'paragraph',
    },
    surroundings: {
      truncated: false,
      blocks: [
        {
          role: 'current',
          blockKind: 'paragraph',
          content: { type: 'text', text: 'Explain derivatives.' },
        },
      ],
    },
    ...overrides,
  };
}

function validRequest(ctx?: GatewayAiContext): ZikukAiRequest {
  return { version: 1, capability: 'explain_selection', context: ctx ?? baseContext() };
}

function okProvider(text = 'explanation'): AiProvider {
  return {
    complete: vi.fn(async () => ({
      ok: true as const,
      text,
      rawModel: 'gpt-5.6-luna',
      latencyMs: 11,
      usage: {
        inputTokens: 12,
        outputTokens: 34,
        totalTokens: 46,
        reasoningTokens: 5,
      },
      providerRequestId: 'req_test',
    })),
  };
}

describe('M0.4 policy helpers', () => {
  it('1–2. missing entitlement → beta limit 40; pro default 200', () => {
    expect(resolveDailyRequestLimit({ plan: 'beta', dailyRequestLimit: null })).toBe(
      AI_QUOTA_BETA_REQUESTS_PER_DAY,
    );
    expect(AI_QUOTA_BETA_REQUESTS_PER_DAY).toBe(40);
    expect(resolveDailyRequestLimit({ plan: 'pro', dailyRequestLimit: null })).toBe(
      AI_QUOTA_PRO_REQUESTS_PER_DAY,
    );
    expect(AI_QUOTA_PRO_REQUESTS_PER_DAY).toBe(200);
  });

  it('8. custom daily limit overrides plan default', () => {
    expect(resolveDailyRequestLimit({ plan: 'beta', dailyRequestLimit: 7 })).toBe(7);
  });
});

describe('M0.4 entitlements via pipeline', () => {
  it('1. missing entitlement → beta allows provider', async () => {
    const store = createMemoryEnforcementStore();
    const provider = okProvider();
    const { response } = await runGatewayPipeline({
      body: validRequest(),
      authUserId: 'user-auth-1',
      provider,
      routerConfig: { model: 'gpt-5.6-luna' },
      enforcement: store,
    });
    expect(response.ok).toBe(true);
    expect(provider.complete).toHaveBeenCalledOnce();
  });

  it('3. owner bypasses product quota when safety windows are spaced', async () => {
    let t = Date.UTC(2026, 8, 19, 0, 0, 0);
    const store = createMemoryEnforcementStore({
      entitlements: { owner: { plan: 'owner' } },
      nowMs: () => t,
    });
    for (let i = 0; i < 45; i += 1) {
      t += 61_000;
      expect((await store.beginRequest('owner', 'explain_selection')).ok).toBe(true);
    }
  });

  it('4. owner denied after 20 safety requests in the same window', async () => {
    const store = createMemoryEnforcementStore({
      entitlements: { owner: { plan: 'owner' } },
    });
    const provider = okProvider();
    for (let i = 0; i < AI_SAFETY_REQUESTS_PER_WINDOW; i += 1) {
      const r = await runGatewayPipeline({
        body: validRequest(baseContext({ identity: { userId: 'owner' } })),
        authUserId: 'owner',
        provider,
        routerConfig: { model: 'm' },
        enforcement: store,
      });
      expect(r.response.ok).toBe(true);
    }
    const denied = await runGatewayPipeline({
      body: validRequest(baseContext({ identity: { userId: 'owner' } })),
      authUserId: 'owner',
      provider,
      routerConfig: { model: 'm' },
      enforcement: store,
    });
    expect(denied.response.ok).toBe(false);
    if (!denied.response.ok) expect(denied.response.error.code).toBe('rate_limited');
    expect(provider.complete).toHaveBeenCalledTimes(AI_SAFETY_REQUESTS_PER_WINDOW);
  });

  it('5. pro policy resolves without payments', async () => {
    const store = createMemoryEnforcementStore({
      entitlements: { u: { plan: 'pro' } },
    });
    const begin = await store.beginRequest('u', 'explain_selection');
    expect(begin.ok).toBe(true);
    if (begin.ok) expect(begin.quotaLimit).toBe(200);
  });

  it('6. disabled → denied, provider not called', async () => {
    const store = createMemoryEnforcementStore({
      entitlements: { u: { plan: 'disabled' } },
    });
    const provider = okProvider();
    const { response } = await runGatewayPipeline({
      body: validRequest(baseContext({ identity: { userId: 'u' } })),
      authUserId: 'u',
      provider,
      routerConfig: { model: 'm' },
      enforcement: store,
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('ai_disabled');
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('7. client cannot forge plan/owner/quota', () => {
    for (const key of ['plan', 'owner', 'quota', 'isOwner', 'dailyRequestLimit']) {
      const r = validateZikukAiRequest({ ...validRequest(), [key]: 'owner' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('invalid_request');
    }
  });
});

describe('M0.4 safety + product quota', () => {
  it('9–11. safety under/boundary/over', async () => {
    const store = createMemoryEnforcementStore();
    for (let i = 0; i < 20; i += 1) {
      expect((await store.beginRequest('u', 'explain_selection')).ok).toBe(true);
    }
    expect((await store.beginRequest('u', 'explain_selection')).ok).toBe(false);
  });

  it('13. concurrent safety cannot bypass', async () => {
    const store = createMemoryEnforcementStore();
    const results = await Promise.all(
      Array.from({ length: 40 }, () => store.beginRequest('u', 'explain_selection')),
    );
    const ok = results.filter(r => r.ok).length;
    const denied = results.filter(r => !r.ok && r.code === 'rate_limited').length;
    expect(ok).toBe(20);
    expect(denied).toBe(20);
  });

  it('14–16. beta quota 40 under/boundary/over', async () => {
    let t = Date.UTC(2026, 8, 19, 12, 0, 0);
    const store = createMemoryEnforcementStore({
      nowMs: () => t,
    });
    // Advance clock each request so safety window does not bind first
    for (let i = 0; i < 40; i += 1) {
      t += 61_000;
      const r = await store.beginRequest('beta-user', 'explain_selection');
      expect(r.ok).toBe(true);
    }
    t += 61_000;
    const over = await store.beginRequest('beta-user', 'explain_selection');
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.code).toBe('quota_exceeded');
  });

  it('17. owner bypasses product quota', async () => {
    let t = Date.UTC(2026, 8, 19, 12, 0, 0);
    const store = createMemoryEnforcementStore({
      entitlements: { owner: { plan: 'owner' } },
      nowMs: () => t,
    });
    for (let i = 0; i < 50; i += 1) {
      t += 61_000; // new safety window each time
      const r = await store.beginRequest('owner', 'explain_selection');
      expect(r.ok).toBe(true);
    }
  });

  it('18. concurrent daily requests cannot bypass', async () => {
    const raceStore = createMemoryEnforcementStore({
      entitlements: { r: { plan: 'beta', dailyRequestLimit: 5 } },
      nowMs: () => Date.UTC(2026, 8, 20, 0, 0, 0),
    });
    const race = await Promise.all(
      Array.from({ length: 20 }, () => raceStore.beginRequest('r', 'explain_selection')),
    );
    expect(race.filter(x => x.ok).length).toBe(5);
    expect(race.filter(x => !x.ok && x.code === 'quota_exceeded').length).toBe(15);
  });

  it('19. UTC day window resets', async () => {
    let t = Date.UTC(2026, 8, 19, 12, 0, 0);
    const store = createMemoryEnforcementStore({
      entitlements: { u: { plan: 'beta', dailyRequestLimit: 2 } },
      nowMs: () => t,
    });
    expect((await store.beginRequest('u', 'explain_selection')).ok).toBe(true);
    t += 61_000;
    expect((await store.beginRequest('u', 'explain_selection')).ok).toBe(true);
    t += 61_000;
    expect((await store.beginRequest('u', 'explain_selection')).ok).toBe(false);
    t = Date.UTC(2026, 8, 20, 0, 1, 0);
    expect((await store.beginRequest('u', 'explain_selection')).ok).toBe(true);
  });
});

describe('M0.4 fail-closed enforcement', () => {
  it('20–22. begin failure → provider NOT called', async () => {
    const store = createMemoryEnforcementStore({ beginThrows: true });
    const provider = okProvider();
    const { response } = await runGatewayPipeline({
      body: validRequest(),
      authUserId: 'user-auth-1',
      provider,
      routerConfig: { model: 'm' },
      enforcement: store,
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('internal_error');
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('missing enforcement → provider NOT called', async () => {
    const provider = okProvider();
    const { response } = await runGatewayPipeline({
      body: validRequest(),
      authUserId: 'user-auth-1',
      provider,
      routerConfig: { model: 'm' },
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('internal_error');
    expect(provider.complete).not.toHaveBeenCalled();
  });
});

describe('M0.4 provider usage + accounting', () => {
  it('24–27. normalize tokens including reasoning/total/missing', () => {
    expect(
      normalizeProviderUsage({
        prompt_tokens: 1,
        completion_tokens: 2,
        total_tokens: 3,
        completion_tokens_details: { reasoning_tokens: 9 },
      }),
    ).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
      reasoningTokens: 9,
    });
    expect(normalizeProviderUsage({ prompt_tokens: 4 })).toEqual({
      inputTokens: 4,
      totalTokens: 4,
    });
    expect(normalizeProviderUsage(undefined)).toBeUndefined();
    expect(normalizeProviderUsage({})).toBeUndefined();
  });

  it('23. success records metadata without content fields', async () => {
    const store = createMemoryEnforcementStore();
    const provider = okProvider('SECRET_RESPONSE_TEXT');
    const { response } = await runGatewayPipeline({
      body: validRequest(),
      authUserId: 'user-auth-1',
      provider,
      routerConfig: { model: 'gpt-5.6-luna' },
      enforcement: store,
    });
    expect(response.ok).toBe(true);
    expect(store.events).toHaveLength(1);
    const ev = store.events[0]!;
    expect(ev.outcome).toBe('success');
    expect(ev.inputTokens).toBe(12);
    expect(ev.outputTokens).toBe(34);
    expect(ev.reasoningTokens).toBe(5);
    expect(ev.totalTokens).toBe(46);
    expect(JSON.stringify(ev)).not.toContain('SECRET_RESPONSE_TEXT');
    expect(JSON.stringify(ev)).not.toContain('Explain derivatives');
    expect(ev).not.toHaveProperty('prompt');
    expect(ev).not.toHaveProperty('selection');
    expect(ev).not.toHaveProperty('surroundings');
  });

  it('28–29. provider failure/timeout keep consumed quota', async () => {
    const store = createMemoryEnforcementStore({
      entitlements: { u: { plan: 'beta', dailyRequestLimit: 2 } },
    });
    const failProvider: AiProvider = {
      complete: vi.fn(async () => ({
        ok: false as const,
        code: 'provider_unavailable' as const,
        message: 'x',
        latencyMs: 1,
      })),
    };
    await runGatewayPipeline({
      body: validRequest(baseContext({ identity: { userId: 'u' } })),
      authUserId: 'u',
      provider: failProvider,
      routerConfig: { model: 'm' },
      enforcement: store,
    });
    await runGatewayPipeline({
      body: validRequest(baseContext({ identity: { userId: 'u' } })),
      authUserId: 'u',
      provider: {
        complete: vi.fn(async () => ({
          ok: false as const,
          code: 'provider_timeout' as const,
          message: 't',
          latencyMs: 1,
        })),
      },
      routerConfig: { model: 'm' },
      enforcement: store,
    });
    const third = await runGatewayPipeline({
      body: validRequest(baseContext({ identity: { userId: 'u' } })),
      authUserId: 'u',
      provider: okProvider(),
      routerConfig: { model: 'm' },
      enforcement: store,
    });
    expect(third.response.ok).toBe(false);
    if (!third.response.ok) expect(third.response.error.code).toBe('quota_exceeded');
  });

  it('30. usage insert failure after success still returns success', async () => {
    const store = createMemoryEnforcementStore({ recordFails: true });
    const provider = okProvider();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { response } = await runGatewayPipeline({
      body: validRequest(),
      authUserId: 'user-auth-1',
      provider,
      routerConfig: { model: 'm' },
      enforcement: store,
    });
    expect(response.ok).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('31. usage insert failure after provider failure preserves provider error', async () => {
    const store = createMemoryEnforcementStore({ recordFails: true });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { response } = await runGatewayPipeline({
      body: validRequest(),
      authUserId: 'user-auth-1',
      provider: {
        complete: vi.fn(async () => ({
          ok: false as const,
          code: 'provider_timeout' as const,
          message: 'SECRET',
          latencyMs: 1,
        })),
      },
      routerConfig: { model: 'm' },
      enforcement: store,
    });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('provider_timeout');
      expect(response.error.message).not.toContain('SECRET');
    }
    errorSpy.mockRestore();
  });
});

describe('M0.4 cost + security', () => {
  it('unknown pricing → null estimate (never invent)', () => {
    expect(Object.keys(AI_MODEL_PRICE_USD_MICROS_PER_1M)).toHaveLength(0);
    expect(
      estimateCostUsdMicros('gpt-5.6-luna', { inputTokens: 10, outputTokens: 20 }),
    ).toBeNull();
    expect(
      estimateCostUsdMicros('known', { inputTokens: 1_000_000, outputTokens: 0 }, {
        known: { inputPer1M: 1_000_000, outputPer1M: 2_000_000 },
      }),
    ).toBe(1_000_000);
  });

  it('34–35. unauthenticated / auth mismatch unchanged', async () => {
    const provider = okProvider();
    const a = await runGatewayPipeline({
      body: validRequest(),
      authUserId: null,
      provider,
      routerConfig: { model: 'm' },
      enforcement: createMemoryEnforcementStore(),
    });
    expect(a.response.ok).toBe(false);
    if (!a.response.ok) expect(a.response.error.code).toBe('unauthenticated');

    const b = await runGatewayPipeline({
      body: validRequest(baseContext({ identity: { userId: 'other' } })),
      authUserId: 'user-auth-1',
      provider,
      routerConfig: { model: 'm' },
      enforcement: createMemoryEnforcementStore(),
    });
    expect(b.response.ok).toBe(false);
    if (!b.response.ok) expect(b.response.error.code).toBe('auth_mismatch');
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('36–38. migration locks down client access (static)', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/010_ai_usage_control.sql'),
      'utf8',
    );
    expect(sql).toContain('revoke all on table public.ai_entitlements from anon, authenticated');
    expect(sql).toContain('revoke all on table public.ai_usage_counters from anon, authenticated');
    expect(sql).toContain('revoke all on table public.ai_usage_events from anon, authenticated');
    expect(sql).toContain('grant execute on function public.ai_gateway_begin_request');
    expect(sql).toContain('to service_role');
    expect(sql).toContain('from public, anon, authenticated');
  });

  it('39. service role never appears in client AI source', () => {
    const client = readFileSync(resolve(process.cwd(), 'src/lib/ai/gatewayClient/client.ts'), 'utf8');
    const types = readFileSync(resolve(process.cwd(), 'src/lib/ai/gatewayClient/types.ts'), 'utf8');
    expect(client).not.toMatch(/SERVICE_ROLE/);
    expect(types).not.toMatch(/SERVICE_ROLE/);
    expect(client).not.toMatch(/VITE_.*SERVICE/);
  });
});
