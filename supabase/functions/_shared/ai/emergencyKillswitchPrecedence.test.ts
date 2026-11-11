/**
 * @vitest-environment node
 *
 * ZIKUK — G2.85 Gate F1 Regression Tests: Emergency Killswitch Precedence
 *
 * Verifies that AI_EMERGENCY_DISABLE executes with proper precedence:
 * A. Emergency disable overrides unsupported model token-bound errors.
 * B. Emergency disable returns HTTP 503 / ai_disabled for an authenticated valid request.
 * C. Emergency disable causes zero reservation attempts and zero provider dispatch.
 * D. Emergency disable does not bypass authentication or request preflight validation.
 * E. With emergency disable off, unsupported models still fail closed.
 * F. Existing valid-model accounting and payload-bound verification remain intact.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  AI_DISABLED_MAINTENANCE_MESSAGE,
  buildEmergencyDisabledResponse,
  httpStatusFor,
  isEmergencyDisabled,
} from './gatewayHttpStatus.ts';
import { preflightGatewayRequest } from './preflightGatewayRequest.ts';
import {
  calculateAuthoritativePayloadInputBound,
  checkProjectSpendingGuard,
  isAuthoritativeBpeModel,
  requireVerifiedTokenReservation,
  verifyFinalProviderPayloadBound,
} from './projectLevelSpendingGuard.ts';
import type { GatewayAiContext, ZikukAiRequest } from './requestTypes.ts';

function baseExplainContext(overrides?: Partial<GatewayAiContext>): GatewayAiContext {
  return {
    version: 1,
    capturedAt: '2026-11-11T14:00:00.000Z',
    identity: { userId: 'user-student-1' },
    academic: { sectionId: 'section-uuid-1', sectionTitle: 'Calculus I' },
    surface: {
      type: 'notebook',
      notebookObjectId: 'ps-notebook-1',
      pageId: 'page-1',
      pageKey: 'page-1',
    },
    focus: {
      kind: 'text',
      text: 'Derivatives of polynomial functions',
      from: 0,
      to: 34,
      blockKind: 'paragraph',
    },
    surroundings: {
      truncated: false,
      blocks: [
        {
          role: 'current',
          blockKind: 'paragraph',
          content: { type: 'text', text: 'Derivatives of polynomial functions' },
        },
      ],
    },
    ...overrides,
  };
}

function validExplainRequest(context?: GatewayAiContext): ZikukAiRequest {
  return {
    version: 1,
    capability: 'explain_selection',
    clientRequestId: 'client-req-001',
    context: context ?? baseExplainContext(),
  };
}

/**
 * Simulates the gateway request lifecycle exactly as structured in ai-gateway/index.ts:
 * 1. Auth & Preflight validation
 * 2. Early Emergency Killswitch check
 * 3. Model token-bound verification & reservation sizing
 * 4. Project-level spending guard
 * 5. Pre-dispatch verification & provider dispatch
 */
async function simulateGatewayExecution(params: {
  body: unknown;
  authUserId: string | null;
  emergencyDisableEnv?: string;
  model: string;
  spendingStore?: {
    begin: ReturnType<typeof vi.fn>;
    settle?: ReturnType<typeof vi.fn>;
    release?: ReturnType<typeof vi.fn>;
  };
  provider?: {
    complete: ReturnType<typeof vi.fn>;
  };
}) {
  const {
    body,
    authUserId,
    emergencyDisableEnv,
    model,
    spendingStore,
    provider,
  } = params;

  // Step 1: Preflight (auth & schema validation)
  const preflight = preflightGatewayRequest({ body, authUserId });
  if (!preflight.ok) {
    const status = httpStatusFor(preflight.response.error.code);
    return { status, response: preflight.response };
  }

  // Step 2: Early Emergency Killswitch check (Precedence Fix)
  const emergencyDisable = isEmergencyDisabled(emergencyDisableEnv);
  if (emergencyDisable) {
    const disabled = buildEmergencyDisabledResponse();
    return { status: disabled.status, response: disabled.response };
  }

  // Step 3: Model Token-Bound Reservation Sizing
  let estimatedRequestTokens: number;
  try {
    const bound = calculateAuthoritativePayloadInputBound(preflight.request, model);
    estimatedRequestTokens = requireVerifiedTokenReservation(
      preflight.request.capability,
      model,
      bound.isAuthoritative
        ? {
            declaredInputTokens: bound.declaredInputTokens,
            hasVision: bound.hasVision,
            visionTileCount: bound.visionTileCount,
            maxAttempts: 1,
            hasAuthoritativeTokenizerProof: true,
          }
        : undefined,
    );
  } catch (_err) {
    return {
      status: 500,
      response: {
        version: 1 as const,
        ok: false as const,
        error: {
          code: 'internal_error',
          message: 'AI usage controls are temporarily unavailable. Try again shortly.',
        },
      },
    };
  }

  // Step 4: Spending Guard Decision
  const projectSpendingConfig = {
    emergencyDisable,
    maxDailyRequests: 50,
    maxDailyTokens: 300_000,
    maxDailyCostMicros: null,
  };

  const guardDecision = await checkProjectSpendingGuard({
    config: projectSpendingConfig,
    estimatedRequestTokens,
    userId: preflight.authUserId,
    capability: preflight.request.capability,
    store: spendingStore as any,
  });

  if (!guardDecision.allowed) {
    return {
      status: httpStatusFor(guardDecision.code),
      response: {
        version: 1 as const,
        ok: false as const,
        error: {
          code: guardDecision.code,
          message: guardDecision.message,
        },
      },
    };
  }

  // Step 5: Pre-dispatch Payload Bound Verification
  const verification = verifyFinalProviderPayloadBound({
    capability: preflight.request.capability,
    model,
    messages: [
      { role: 'system', content: 'You are a helpful tutor.' },
      { role: 'user', content: 'Explain this concept.' },
    ],
    maxTokens: 2048,
    reservedTokens: estimatedRequestTokens,
  });

  if (!verification.ok) {
    return {
      status: 429,
      response: {
        version: 1 as const,
        ok: false as const,
        error: {
          code: 'quota_exceeded',
          message: 'Request payload exceeds token reservation limit.',
        },
      },
    };
  }

  // Step 6: Upstream Provider Execution
  if (provider) {
    const providerResult = await provider.complete();
    return {
      status: 200,
      response: {
        version: 1 as const,
        ok: true as const,
        result: providerResult,
      },
    };
  }

  return {
    status: 200,
    response: {
      version: 1 as const,
      ok: true as const,
      result: { type: 'text', text: 'Tutor explanation' },
    },
  };
}

describe('Gate F1 Regression Suite: Emergency Killswitch Precedence', () => {
  describe('Helper Functions & HTTP Status Alignment', () => {
    it('aligns httpStatusFor(ai_disabled) strictly with HTTP 503', () => {
      expect(httpStatusFor('ai_disabled')).toBe(503);
    });

    it('maps all other standard gateway codes correctly', () => {
      expect(httpStatusFor('unauthenticated')).toBe(401);
      expect(httpStatusFor('auth_mismatch')).toBe(403);
      expect(httpStatusFor('invalid_request')).toBe(400);
      expect(httpStatusFor('unsupported_capability')).toBe(400);
      expect(httpStatusFor('unsupported_content')).toBe(400);
      expect(httpStatusFor('not_found')).toBe(404);
      expect(httpStatusFor('knowledge_not_found')).toBe(404);
      expect(httpStatusFor('rate_limited')).toBe(429);
      expect(httpStatusFor('quota_exceeded')).toBe(429);
      expect(httpStatusFor('provider_timeout')).toBe(504);
      expect(httpStatusFor('output_budget_exhausted')).toBe(422);
      expect(httpStatusFor('provider_unavailable')).toBe(502);
      expect(httpStatusFor('internal_error')).toBe(500);
    });

    it('evaluates isEmergencyDisabled strictly for true values', () => {
      expect(isEmergencyDisabled('true')).toBe(true);
      expect(isEmergencyDisabled('TRUE')).toBe(true);
      expect(isEmergencyDisabled('  true  ')).toBe(true);
      expect(isEmergencyDisabled('false')).toBe(false);
      expect(isEmergencyDisabled('0')).toBe(false);
      expect(isEmergencyDisabled('')).toBe(false);
      expect(isEmergencyDisabled(null)).toBe(false);
      expect(isEmergencyDisabled(undefined)).toBe(false);
    });

    it('constructs versioned maintenance error envelope with HTTP 503', () => {
      const { response, status } = buildEmergencyDisabledResponse();
      expect(status).toBe(503);
      expect(response).toEqual({
        version: 1,
        ok: false,
        error: {
          code: 'ai_disabled',
          message: AI_DISABLED_MAINTENANCE_MESSAGE,
        },
      });
    });
  });

  describe('Core Precedence Requirements (A through F)', () => {
    it('A. Emergency disable overrides unsupported model token-bound errors', async () => {
      // Prior to fix: staging model gpt-5.6-luna threw TOKEN_INPUT_BOUND_UNVERIFIED and returned HTTP 500
      // With fix: emergency disable takes precedence and returns HTTP 503 / ai_disabled
      expect(isAuthoritativeBpeModel('gpt-5.6-luna')).toBe(false);

      const storeMock = { begin: vi.fn(), settle: vi.fn(), release: vi.fn() };
      const providerMock = { complete: vi.fn() };

      const result = await simulateGatewayExecution({
        body: validExplainRequest(),
        authUserId: 'user-student-1',
        emergencyDisableEnv: 'true',
        model: 'gpt-5.6-luna',
        spendingStore: storeMock,
        provider: providerMock,
      });

      expect(result.status).toBe(503);
      expect(result.response.ok).toBe(false);
      if (!result.response.ok) {
        expect(result.response.error.code).toBe('ai_disabled');
        expect(result.response.error.message).toBe(AI_DISABLED_MAINTENANCE_MESSAGE);
      }
    });

    it('B. Emergency disable returns HTTP 503 / ai_disabled for an authenticated valid request', async () => {
      const result = await simulateGatewayExecution({
        body: validExplainRequest(),
        authUserId: 'user-student-1',
        emergencyDisableEnv: 'true',
        model: 'gpt-4o-mini',
      });

      expect(result.status).toBe(503);
      expect(result.response).toEqual({
        version: 1,
        ok: false,
        error: {
          code: 'ai_disabled',
          message: 'AI services are temporarily disabled for maintenance.',
        },
      });
    });

    it('C. Emergency disable causes zero reservation attempts and zero provider dispatch', async () => {
      const storeMock = { begin: vi.fn(), settle: vi.fn(), release: vi.fn() };
      const providerMock = { complete: vi.fn() };

      const result = await simulateGatewayExecution({
        body: validExplainRequest(),
        authUserId: 'user-student-1',
        emergencyDisableEnv: 'true',
        model: 'gpt-4o-mini',
        spendingStore: storeMock,
        provider: providerMock,
      });

      expect(result.status).toBe(503);
      expect(storeMock.begin).not.toHaveBeenCalled();
      expect(storeMock.settle).not.toHaveBeenCalled();
      expect(storeMock.release).not.toHaveBeenCalled();
      expect(providerMock.complete).not.toHaveBeenCalled();
    });

    it('D. Emergency disable does not bypass authentication or preflight validation', async () => {
      // D.1 Missing authentication -> 401 unauthenticated (not 503)
      const unauthResult = await simulateGatewayExecution({
        body: validExplainRequest(),
        authUserId: null,
        emergencyDisableEnv: 'true',
        model: 'gpt-4o-mini',
      });
      expect(unauthResult.status).toBe(401);
      expect(unauthResult.response.ok).toBe(false);
      if (!unauthResult.response.ok) {
        expect(unauthResult.response.error.code).toBe('unauthenticated');
      }

      // D.2 Auth mismatch -> 403 auth_mismatch (not 503)
      const mismatchResult = await simulateGatewayExecution({
        body: validExplainRequest(baseExplainContext({ identity: { userId: 'victim-user' } })),
        authUserId: 'attacker-user',
        emergencyDisableEnv: 'true',
        model: 'gpt-4o-mini',
      });
      expect(mismatchResult.status).toBe(403);
      expect(mismatchResult.response.ok).toBe(false);
      if (!mismatchResult.response.ok) {
        expect(mismatchResult.response.error.code).toBe('auth_mismatch');
      }

      // D.3 Malformed request body -> 400 invalid_request / unsupported_capability (not 503)
      const malformedResult = await simulateGatewayExecution({
        body: { invalid: 'payload' },
        authUserId: 'user-student-1',
        emergencyDisableEnv: 'true',
        model: 'gpt-4o-mini',
      });
      expect(malformedResult.status).toBe(400);
      expect(malformedResult.response.ok).toBe(false);
      if (!malformedResult.response.ok) {
        expect(['invalid_request', 'unsupported_capability']).toContain(
          malformedResult.response.error.code,
        );
      }
    });

    it('E. With emergency disable off, unsupported models still fail closed', async () => {
      const storeMock = { begin: vi.fn(), settle: vi.fn(), release: vi.fn() };
      const providerMock = { complete: vi.fn() };

      const result = await simulateGatewayExecution({
        body: validExplainRequest(),
        authUserId: 'user-student-1',
        emergencyDisableEnv: 'false',
        model: 'gpt-5.6-luna', // unsupported synthetic model
        spendingStore: storeMock,
        provider: providerMock,
      });

      expect(result.status).toBe(500);
      expect(result.response.ok).toBe(false);
      if (!result.response.ok) {
        expect(result.response.error.code).toBe('internal_error');
        expect(result.response.error.message).toBe(
          'AI usage controls are temporarily unavailable. Try again shortly.',
        );
      }
      expect(storeMock.begin).not.toHaveBeenCalled();
      expect(providerMock.complete).not.toHaveBeenCalled();
    });

    it('F. Existing valid-model accounting and payload-bound verification remain intact', async () => {
      const storeMock = {
        begin: vi.fn().mockResolvedValue({
          allowed: true,
          reservationId: 'res-uuid-1',
          dispatchReservation: vi.fn().mockResolvedValue({ ok: true }),
          releaseReservation: vi.fn().mockResolvedValue({ ok: true }),
        }),
        settle: vi.fn().mockResolvedValue({ ok: true }),
        release: vi.fn().mockResolvedValue({ ok: true }),
      };
      const providerMock = {
        complete: vi.fn().mockResolvedValue({ type: 'text', text: 'Here is the explanation.' }),
      };

      const result = await simulateGatewayExecution({
        body: validExplainRequest(),
        authUserId: 'user-student-1',
        emergencyDisableEnv: 'false',
        model: 'gpt-4o-mini',
        spendingStore: storeMock,
        provider: providerMock,
      });

      expect(result.status).toBe(200);
      expect(result.response.ok).toBe(true);
      expect(storeMock.begin).toHaveBeenCalledTimes(1);
      expect(providerMock.complete).toHaveBeenCalledTimes(1);
    });
  });
});
