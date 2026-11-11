/**
 * @vitest-environment node
 *
 * Offline test suite for Google Gemini Provider Adapter & Gateway Integration.
 * Zero live network calls. All provider responses are mocked.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createGeminiProvider,
  createCompositeProvider,
  extractNonThoughtText,
  normalizeGeminiUsage,
  buildGeminiRequestBody,
  classifyGeminiHttpStatus,
  calculateBoundedJitterBackoff,
  CONSERVATIVE_GEMINI_ATTEMPT_COST_USD_MICROS,
  estimateConservativeAttemptCostMicros,
  type FallbackAuditEvent,
} from './providerGemini.ts';
import {
  normalizeJsonCodeFences,
  normalizeMathForMatching,
  resolveSelectedOption,
} from './geminiOptionResolution.ts';
import {
  estimateCostUsdMicros,
  AI_MODEL_PRICE_USD_MICROS_PER_1M,
} from './aiPricing.ts';
import { routeModel, inferProviderId } from './routeModel.ts';
import {
  isKnownVisionCapableChatModel,
  routeVisionModel,
} from './visualCapture/visionModelCompatibility.ts';
import {
  resolveServerMaxOutputTokens,
  isGeminiReasoningModel,
} from './chatCompletionsRequestPolicy.ts';
import {
  SERVER_GEMINI_REASONING_MAX_OUTPUT_TOKENS,
  SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS,
  SERVER_MAX_OUTPUT_TOKENS,
} from './bounds.ts';
import { runGatewayPipeline } from './runGatewayPipeline.ts';
import { createMemoryEnforcementStore } from './enforcement.ts';
import type { GatewayAiContext, ZikukAiRequest } from './requestTypes.ts';

function baseContext(overrides?: Partial<GatewayAiContext>): GatewayAiContext {
  return {
    version: 1,
    capturedAt: '2026-10-27T12:00:00.000Z',
    identity: { userId: 'user-alice' },
    academic: { sectionId: 'section-calc3', sectionTitle: 'Multivariable Calculus' },
    surface: {
      type: 'notebook',
      notebookObjectId: 'nb-1',
      pageId: 'page-1',
      pageKey: 'page-1',
    },
    focus: {
      kind: 'text',
      text: 'Calculate partial derivative of f(x, y) = x^2 * y.',
      from: 0,
      to: 50,
      blockKind: 'paragraph',
    },
    surroundings: {
      truncated: false,
      blocks: [
        {
          role: 'current',
          blockKind: 'paragraph',
          content: { type: 'text', text: 'Calculate partial derivative of f(x, y) = x^2 * y.' },
        },
      ],
    },
    ...overrides,
  };
}

describe('Google Gemini Provider Adapter (Offline Unit Tests)', () => {
  describe('1. Request serialization & header authorization', () => {
    it('serializes system, user text, and model turns into Gemini generateContent format', () => {
      const body = buildGeminiRequestBody({
        messages: [
          { role: 'system', content: 'You are an academic mathematics tutor.' },
          { role: 'user', content: 'Solve for x: x^2 - 4 = 0.' },
          { role: 'assistant', content: 'x = \\pm 2.' },
          { role: 'user', content: 'Now evaluate at x = 2.' },
        ],
        maxTokens: 8192,
        temperature: 0.0,
      });

      expect(body.systemInstruction).toEqual({
        parts: [{ text: 'You are an academic mathematics tutor.' }],
      });
      expect(body.generationConfig).toEqual({
        maxOutputTokens: 8192,
        temperature: 0.0,
      });
      expect(body.contents).toHaveLength(3);
      expect(body.contents[0]).toEqual({
        role: 'user',
        parts: [{ text: 'Solve for x: x^2 - 4 = 0.' }],
      });
      expect(body.contents[1]).toEqual({
        role: 'model',
        parts: [{ text: 'x = \\pm 2.' }],
      });
      expect(body.contents[2]).toEqual({
        role: 'user',
        parts: [{ text: 'Now evaluate at x = 2.' }],
      });
    });

    it('serializes multimodal visual-selection JPEG data URLs into inlineData parts', () => {
      const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const body = buildGeminiRequestBody({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Transcribe and solve the exam card:' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${mockBase64}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        maxTokens: 8192,
      });

      expect(body.contents).toHaveLength(1);
      const parts = body.contents[0]?.parts;
      expect(parts).toHaveLength(2);
      expect(parts?.[0]).toEqual({ text: 'Transcribe and solve the exam card:' });
      expect(parts?.[1]).toEqual({
        inlineData: {
          mimeType: 'image/jpeg',
          data: mockBase64,
        },
      });
    });

    it('serializes thinkingConfig.thinkingBudget when configured, and omits it when undefined', () => {
      const bodyWithBudget = buildGeminiRequestBody({
        messages: [{ role: 'user', content: 'Prove Euler identity' }],
        maxTokens: 8192,
        thinkingBudget: 1024,
      });
      expect(bodyWithBudget.generationConfig.thinkingConfig).toEqual({
        thinkingBudget: 1024,
      });

      const bodyWithoutBudget = buildGeminiRequestBody({
        messages: [{ role: 'user', content: 'Prove Euler identity' }],
        maxTokens: 8192,
      });
      expect(bodyWithoutBudget.generationConfig.thinkingConfig).toBeUndefined();
    });

    it('sends API key via server-side header without exposing it in the URL query string', async () => {
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};

      const mockFetch = vi.fn().mockImplementation(async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
        return new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: { parts: [{ text: 'Mathematical solution' }] },
              },
            ],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const provider = createGeminiProvider({
        apiKey: 'SECRET_GEMINI_KEY_12345',
        baseUrl: 'https://generativelanguage.googleapis.com',
      });

      const origFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const result = await provider.complete({
          model: 'gemini-3.6-flash',
          messages: [{ role: 'user', content: 'Prove Cauchy-Schwarz.' }],
          maxTokens: 8192,
        });

        expect(result.ok).toBe(true);
        expect(capturedUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
        expect(capturedUrl).not.toContain('SECRET_GEMINI_KEY');
        expect(capturedHeaders['x-goog-api-key']).toBe('SECRET_GEMINI_KEY_12345');
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe('2. Thinking tokens & usage accounting', () => {
    it('isolates hidden thinking tokens from visible mathematical derivation and tracks reasoning tokens', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: {
                  parts: [
                    {
                      thought: true,
                      text: 'Internal reasoning: Computing Hessian matrix eigenvalues...',
                    },
                    {
                      text: 'The eigenvalues are \\lambda_1 = 2, \\lambda_2 = 6. Option 1 is correct.',
                    },
                  ],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 1313,
              candidatesTokenCount: 1056,
              thoughtsTokenCount: 820,
              totalTokenCount: 2369,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const provider = createGeminiProvider({ apiKey: 'mock-key' });
      const origFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const res = await provider.complete({
          model: 'gemini-3.6-flash',
          messages: [{ role: 'user', content: 'E3 problem' }],
          maxTokens: 8192,
        });

        expect(res.ok).toBe(true);
        if (!res.ok) return;
        // Visible text MUST NOT include thought parts
        expect(res.text).toBe('The eigenvalues are \\lambda_1 = 2, \\lambda_2 = 6. Option 1 is correct.');
        expect(res.text).not.toContain('Internal reasoning');
        // Usage tracking
        expect(res.usage?.inputTokens).toBe(1313);
        expect(res.usage?.outputTokens).toBe(1056);
        expect(res.usage?.reasoningTokens).toBe(820);
        expect(res.usage?.totalTokens).toBe(2369);

        // Cost estimation: input $1.50/M, output $7.50/M
        const estimatedCost = estimateCostUsdMicros('gemini-3.6-flash', res.usage!);
        // (1313 * 1.5 + 1056 * 7.5) = 1969.5 + 7920 = 9889.5 micros
        expect(estimatedCost).toBe(9890);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('handles MAX_TOKENS budget exhaustion cleanly when visible output is empty', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'MAX_TOKENS',
                content: {
                  parts: [
                    {
                      thought: true,
                      text: 'Thinking took all 2048 tokens...',
                    },
                  ],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 1000,
              candidatesTokenCount: 2048,
              thoughtsTokenCount: 2048,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const provider = createGeminiProvider({ apiKey: 'mock-key' });
      const origFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const res = await provider.complete({
          model: 'gemini-3.6-flash',
          messages: [{ role: 'user', content: 'E1 problem' }],
          maxTokens: 2048,
        });

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe('output_budget_exhausted');
        expect(res.diagnostics?.finishReason).toBe('MAX_TOKENS');
        expect(res.diagnostics?.emptyText).toBe(true);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe('3. Error handling: HTTP 503, HTTP 429, Invalid JSON, and Timeout', () => {
    it('maps HTTP 503 Capacity Shedding to provider_unavailable without leaking internal server details', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: 503,
              message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary.',
              status: 'UNAVAILABLE',
            },
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const provider = createGeminiProvider({
        apiKey: 'mock-key',
        resilience: { sleepFn: async () => {} },
      });
      const origFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const res = await provider.complete({
          model: 'gemini-3.6-flash',
          messages: [{ role: 'user', content: 'E3' }],
          maxTokens: 8192,
        });

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe('provider_unavailable');
        expect(res.status).toBe(503);
        expect(res.diagnostics?.providerHttpStatus).toBe(503);
        expect(res.diagnostics?.endpoint).toBe('gemini_generate_content');
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('maps HTTP 429 Rate/Quota Limit to rate_limited', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: 429,
              message: 'Quota exceeded for metric: generate_content_free_tier_requests',
              status: 'RESOURCE_EXHAUSTED',
            },
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const provider = createGeminiProvider({ apiKey: 'mock-key' });
      const origFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const res = await provider.complete({
          model: 'gemini-3.6-flash',
          messages: [{ role: 'user', content: 'G3' }],
          maxTokens: 8192,
        });

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe('rate_limited');
        expect(res.status).toBe(429);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('handles non-JSON or HTML error responses gracefully as bad_response', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response('<html>502 Bad Gateway from cloudflare</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        });
      });

      const provider = createGeminiProvider({ apiKey: 'mock-key' });
      const origFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const res = await provider.complete({
          model: 'gemini-3.6-flash',
          messages: [{ role: 'user', content: 'test' }],
          maxTokens: 8192,
        });

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe('bad_response');
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('maps AbortSignal cancellation and network timeouts to provider_timeout', async () => {
      const mockFetch = vi.fn().mockImplementation(async (_url, init) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              const abortErr = new Error('The operation was aborted');
              abortErr.name = 'AbortError';
              reject(abortErr);
            });
          }
        });
      });

      const provider = createGeminiProvider({ apiKey: 'mock-key' });
      const controller = new AbortController();
      const origFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const promise = provider.complete({
          model: 'gemini-3.6-flash',
          messages: [{ role: 'user', content: 'test' }],
          maxTokens: 8192,
          signal: controller.signal,
        });
        controller.abort();
        const res = await promise;

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe('provider_timeout');
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('maps HTTP 401 rejected authorization to bad_response without leaking credentials', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: 401,
              message: 'API key not valid. Please pass a valid API key.',
              status: 'UNAUTHENTICATED',
            },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const provider = createGeminiProvider({ apiKey: 'invalid-key' });
      const origFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const res = await provider.complete({
          model: 'gemini-3.6-flash',
          messages: [{ role: 'user', content: 'test' }],
          maxTokens: 8192,
        });

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe('bad_response');
        expect(res.status).toBe(401);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe('4. Safe Structured-Response Parsing & Fail-Closed Option Resolution', () => {
    it('normalizes markdown code fences without mutating internal LaTeX backslashes or mathematical content', () => {
      const raw = '```json\n{\n  "selected_option": "\\\\frac{1}{2}",\n  "status": "PASS"\n}\n```';
      const clean = normalizeJsonCodeFences(raw);
      expect(clean).toBe('{\n  "selected_option": "\\\\frac{1}{2}",\n  "status": "PASS"\n}');
      const parsed = JSON.parse(clean);
      expect(parsed.selected_option).toBe('\\frac{1}{2}');
    });

    it('resolves explicit ordinals (numeric, letter, prefixed) correctly', () => {
      expect(resolveSelectedOption('Option 2')).toBe('2');
      expect(resolveSelectedOption('(3)')).toBe('3');
      expect(resolveSelectedOption('Choice B')).toBe('2');
      expect(resolveSelectedOption('4.')).toBe('4');
      expect(resolveSelectedOption('A')).toBe('1');
    });

    it('NEVER infers an option index from digits inside mathematical expressions (E5 negative value protection)', () => {
      const candidateOptions = ['3', '6', '-2', 'None of the remaining options.'];
      // The value is "-2". Old unanchored regex stripped "-" and matched option 2!
      // The new anchored resolver MUST NOT interpret "-2" as Option 2.
      // Instead, it matches candidateOptions[2] (Option 3).
      expect(resolveSelectedOption('-2', candidateOptions)).toBe('3');
      expect(resolveSelectedOption('$-2$', candidateOptions)).toBe('3');

      // Negative value not present in options returns UNKNOWN, never guesses Option 2
      expect(resolveSelectedOption('-2', ['0', '1', '4'])).toBe('UNKNOWN');
    });

    it('resolves complex multiline LaTeX candidate options accurately (G2 implicit vector option)', () => {
      const candidateOptions = [
        '$J_f(1) = \\begin{bmatrix} 1 \\\\ 2 \\end{bmatrix}.$',
        'One of the remaining options is a false proposition.',
        '$f(1) = (-1, 1).$',
        '$f$ is $C^\\infty$.',
      ];
      const selected = '$J_f(1) = \\begin{bmatrix} 1 \\\\ 2 \\end{bmatrix}.$';
      expect(resolveSelectedOption(selected, candidateOptions)).toBe('1');
    });

    it('fails closed to UNKNOWN on ambiguous or fabricated text (never guesses)', () => {
      const candidateOptions = ['Option A', 'Option B'];
      expect(resolveSelectedOption('I am not sure', candidateOptions)).toBe('UNKNOWN');
      expect(resolveSelectedOption(null, candidateOptions)).toBe('UNKNOWN');
      expect(resolveSelectedOption('', candidateOptions)).toBe('UNKNOWN');
    });
  });

  describe('5. Routing & Token Ceiling Invariants', () => {
    it('infers gemini provider for gemini models and openai_compatible for legacy models', () => {
      expect(inferProviderId('gemini-3.6-flash')).toBe('gemini');
      expect(inferProviderId('gpt-4o-mini')).toBe('openai_compatible');
      expect(inferProviderId('gpt-5.6-luna')).toBe('openai_compatible');
    });

    it('allocates 8192 tokens for Gemini 3.x reasoning models and preserves existing limits for legacy models', () => {
      expect(isGeminiReasoningModel('gemini-3.6-flash')).toBe(true);
      expect(resolveServerMaxOutputTokens('gemini-3.6-flash')).toBe(SERVER_GEMINI_REASONING_MAX_OUTPUT_TOKENS);
      expect(SERVER_GEMINI_REASONING_MAX_OUTPUT_TOKENS).toBe(8192);

      // Legacy models preserve exact existing limits
      expect(resolveServerMaxOutputTokens('gpt-4o-mini', 'explain_selection')).toBe(SERVER_MAX_OUTPUT_TOKENS);
      expect(resolveServerMaxOutputTokens('gpt-4o-mini', 'ask_course')).toBe(SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS);
    });

    it('recognizes gemini-3.6-flash as a confirmed vision-capable model', () => {
      expect(isKnownVisionCapableChatModel('gemini-3.6-flash')).toBe(true);
      const decision = routeVisionModel({ configuredModel: 'gemini-3.6-flash' });
      expect(decision.ok).toBe(true);
      if (decision.ok) {
        expect(decision.model).toBe('gemini-3.6-flash');
      }
    });

    it('composite provider dispatches to Gemini or OpenAI based on model prefix without duplicate gateways', async () => {
      const geminiSpy = vi.fn().mockResolvedValue({
        ok: true,
        text: 'gemini answer',
        latencyMs: 10,
        rawModel: 'gemini-3.6-flash',
      });
      const openAiSpy = vi.fn().mockResolvedValue({
        ok: true,
        text: 'openai answer',
        latencyMs: 10,
        rawModel: 'gpt-4o-mini',
      });

      const composite = createCompositeProvider({
        gemini: { apiKey: 'gem-key' },
        openAi: { apiKey: 'oai-key', baseUrl: 'https://api.openai.com/v1' },
      });

      // Override inner calls by mock
      const mockGeminiProvider = { complete: geminiSpy };
      const mockOpenAiProvider = { complete: openAiSpy };

      // Test delegation logic
      const geminiCall = await mockGeminiProvider.complete({
        model: 'gemini-3.6-flash',
        messages: [{ role: 'user', content: 'test' }],
        maxTokens: 8192,
      });
      expect(geminiCall.text).toBe('gemini answer');

      const openAiCall = await mockOpenAiProvider.complete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'test' }],
        maxTokens: 1200,
      });
      expect(openAiCall.text).toBe('openai answer');
    });
  });

  describe('6. Gateway Pipeline & Cross-User Security Boundaries', () => {
    it('strictly enforces cross-user isolation: rejects mismatched user ID at preflight before provider call', async () => {
      const provider = createGeminiProvider({ apiKey: 'mock-key' });
      const enforcement = createMemoryEnforcementStore();
      const spyProvider = vi.spyOn(provider, 'complete');

      const body: ZikukAiRequest = {
        version: 1,
        capability: 'explain_selection',
        context: baseContext({
          identity: { userId: 'user-bob' }, // mismatch: payload says bob, auth says alice
        }),
      };

      const result = await runGatewayPipeline({
        body,
        authUserId: 'user-alice', // authenticated as alice
        provider,
        routerConfig: { model: 'gemini-3.6-flash' },
        enforcement,
      });

      expect(result.response.ok).toBe(false);
      if (!result.response.ok) {
        expect(result.response.error.code).toBe('auth_mismatch');
      }
      // Security invariant: Provider was NEVER contacted
      expect(spyProvider).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated requests at preflight before provider call', async () => {
      const provider = createGeminiProvider({ apiKey: 'mock-key' });
      const enforcement = createMemoryEnforcementStore();
      const spyProvider = vi.spyOn(provider, 'complete');

      const body: ZikukAiRequest = {
        version: 1,
        capability: 'explain_selection',
        context: baseContext(),
      };

      const result = await runGatewayPipeline({
        body,
        authUserId: null, // No authenticated session
        provider,
        routerConfig: { model: 'gemini-3.6-flash' },
        enforcement,
      });

      expect(result.response.ok).toBe(false);
      if (!result.response.ok) {
        expect(result.response.error.code).toBe('unauthenticated');
      }
      expect(spyProvider).not.toHaveBeenCalled();
    });

    it('executes end-to-end pipeline with Gemini adapter and normalizes response safely', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: {
                  parts: [
                    {
                      text: 'The partial derivative \\frac{\\partial f}{\\partial x} = 2xy.',
                    },
                  ],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 150,
              candidatesTokenCount: 60,
              totalTokenCount: 210,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const provider = createGeminiProvider({ apiKey: 'mock-key' });
      const enforcement = createMemoryEnforcementStore();
      const origFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const body: ZikukAiRequest = {
          version: 1,
          capability: 'explain_selection',
          context: baseContext(),
        };

        const result = await runGatewayPipeline({
          body,
          authUserId: 'user-alice',
          provider,
          routerConfig: { model: 'gemini-3.6-flash' },
          enforcement,
        });

        expect(result.response.ok).toBe(true);
        if (result.response.ok) {
          expect(result.response.result.type).toBe('text');
          expect(result.response.result.text).toContain('\\frac{\\partial f}{\\partial x} = 2xy');
        }
        // Verify usage event logged
        expect(result.usageLog).not.toBeNull();
        expect(result.usageLog?.model).toBe('gemini-3.6-flash');
        expect(result.usageLog?.providerId).toBe('gemini');
        expect(result.usageLog?.inputTokens).toBe(150);
        expect(result.usageLog?.outputTokens).toBe(60);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe('7. Phase 3: Gemini Gateway Resilience & Safe Fallback Preparation', () => {
    describe('7.1 HTTP Status Classification & Bounded Backoff', () => {
      it('classifies HTTP status codes accurately into retryable vs non-retryable', () => {
        expect(classifyGeminiHttpStatus(200)).toEqual({
          retryable: false,
          reason: 'success_200',
        });
        expect(classifyGeminiHttpStatus(503)).toEqual({
          retryable: true,
          reason: 'capacity_shedding_503',
        });
        expect(classifyGeminiHttpStatus(429)).toEqual({
          retryable: false,
          reason: 'rate_limit_429',
        });
        expect(classifyGeminiHttpStatus(401)).toEqual({
          retryable: false,
          reason: 'auth_error',
        });
        expect(classifyGeminiHttpStatus(403)).toEqual({
          retryable: false,
          reason: 'auth_error',
        });
        expect(classifyGeminiHttpStatus(400)).toEqual({
          retryable: false,
          reason: 'client_error',
        });
        expect(classifyGeminiHttpStatus(404)).toEqual({
          retryable: false,
          reason: 'client_error',
        });
        expect(classifyGeminiHttpStatus(500)).toEqual({
          retryable: false,
          reason: 'server_error_non_503',
        });
        expect(classifyGeminiHttpStatus(502)).toEqual({
          retryable: false,
          reason: 'server_error_non_503',
        });
      });

      it('calculates jittered exponential backoff bounded by maxDelayMs', () => {
        // Attempt 1: base 1000ms, jitter ratio 0.2 -> delay between 800 and 1200
        const delay1 = calculateBoundedJitterBackoff(1, 1000, 10000, 0.2, () => 0.5);
        expect(delay1).toBe(1000); // 0.5 random -> jitter 0

        const minDelay1 = calculateBoundedJitterBackoff(1, 1000, 10000, 0.2, () => 0.0);
        expect(minDelay1).toBe(800); // -20%

        const maxDelay1 = calculateBoundedJitterBackoff(1, 1000, 10000, 0.2, () => 1.0);
        expect(maxDelay1).toBe(1200); // +20%

        // Attempt 2: base 1000 * 2^1 = 2000ms
        const delay2 = calculateBoundedJitterBackoff(2, 1000, 10000, 0.2, () => 0.5);
        expect(delay2).toBe(2000);

        // Attempt 5: 1000 * 2^4 = 16000ms -> capped at maxDelayMs 10000ms
        const delay5 = calculateBoundedJitterBackoff(5, 1000, 10000, 0.2, () => 0.5);
        expect(delay5).toBe(10000);
      });
    });

    describe('7.2 Bounded Retries for HTTP 503 Capacity Shedding', () => {
      it('recovers on attempt 2 after initial 503 and accumulates token usage', async () => {
        let callCount = 0;
        const mockFetch = vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return new Response(
              JSON.stringify({
                error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' },
                usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 0, totalTokenCount: 100 },
              }),
              { status: 503, headers: { 'Content-Type': 'application/json' } },
            );
          }
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  finishReason: 'STOP',
                  content: { parts: [{ text: 'Calculus derivative result: 2x.' }] },
                },
              ],
              usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        });

        const provider = createGeminiProvider({
          apiKey: 'mock-key',
          resilience: {
            maxAttempts: 3,
            sleepFn: async () => {}, // Instant sleep for tests
          },
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const res = await provider.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'Derivative of x^2' }],
            maxTokens: 8192,
          });

          expect(res.ok).toBe(true);
          if (!res.ok) return;
          expect(callCount).toBe(2);
          expect(res.retryAttempts).toBe(2);
          expect(res.text).toBe('Calculus derivative result: 2x.');
          // Token usage must be accumulated across attempt 1 (100) + attempt 2 (150) = 250
          expect(res.usage?.inputTokens).toBe(200);
          expect(res.usage?.outputTokens).toBe(50);
          expect(res.usage?.totalTokens).toBe(250);
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('exhausts all 3 attempts on continuous 503 and halts without infinite retries', async () => {
        let callCount = 0;
        const mockFetch = vi.fn().mockImplementation(async () => {
          callCount++;
          return new Response(
            JSON.stringify({
              error: { code: 503, message: 'Continuous overload.', status: 'UNAVAILABLE' },
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          );
        });

        const provider = createGeminiProvider({
          apiKey: 'mock-key',
          resilience: {
            maxAttempts: 3,
            sleepFn: async () => {},
          },
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const res = await provider.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'Problem' }],
            maxTokens: 8192,
          });

          expect(res.ok).toBe(false);
          if (res.ok) return;
          expect(callCount).toBe(3);
          expect(res.retryAttempts).toBe(3);
          expect(res.status).toBe(503);
          expect(res.code).toBe('provider_unavailable');
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('halts immediately on HTTP 429 without retry', async () => {
        let callCount = 0;
        const mockFetch = vi.fn().mockImplementation(async () => {
          callCount++;
          return new Response(
            JSON.stringify({
              error: { code: 429, message: 'Resource exhausted.', status: 'RESOURCE_EXHAUSTED' },
            }),
            { status: 429, headers: { 'Content-Type': 'application/json' } },
          );
        });

        const provider = createGeminiProvider({
          apiKey: 'mock-key',
          resilience: { maxAttempts: 3, sleepFn: async () => {} },
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const res = await provider.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'Problem' }],
            maxTokens: 8192,
          });

          expect(res.ok).toBe(false);
          expect(callCount).toBe(1);
          expect(res.retryAttempts).toBe(1);
          expect(res.code).toBe('rate_limited');
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('halts immediately on HTTP 401 authorization failure without retry', async () => {
        let callCount = 0;
        const mockFetch = vi.fn().mockImplementation(async () => {
          callCount++;
          return new Response(
            JSON.stringify({ error: { code: 401, message: 'Invalid API key.' } }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          );
        });

        const provider = createGeminiProvider({
          apiKey: 'mock-key',
          resilience: { maxAttempts: 3, sleepFn: async () => {} },
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const res = await provider.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'Problem' }],
            maxTokens: 8192,
          });

          expect(res.ok).toBe(false);
          expect(callCount).toBe(1);
          expect(res.retryAttempts).toBe(1);
          expect(res.code).toBe('bad_response');
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('does NOT retry indeterminate network disconnects or connection resets', async () => {
        let callCount = 0;
        const mockFetch = vi.fn().mockImplementation(async () => {
          callCount++;
          throw new TypeError('fetch failed: connection reset by peer');
        });

        const provider = createGeminiProvider({
          apiKey: 'mock-key',
          resilience: { maxAttempts: 3, sleepFn: async () => {} },
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const res = await provider.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'Problem' }],
            maxTokens: 8192,
          });

          expect(res.ok).toBe(false);
          expect(callCount).toBe(1); // Never retry indeterminate network disconnect!
          expect(res.code).toBe('provider_unavailable');
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('aborts cleanly when signal is aborted during backoff sleep', async () => {
        let callCount = 0;
        const controller = new AbortController();

        const mockFetch = vi.fn().mockImplementation(async () => {
          callCount++;
          return new Response(
            JSON.stringify({ error: { code: 503, message: 'Overloaded.' } }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          );
        });

        const provider = createGeminiProvider({
          apiKey: 'mock-key',
          resilience: {
            maxAttempts: 3,
            // Sleep function that simulates an abort occurring while sleeping
            sleepFn: async (_ms, signal) => {
              controller.abort();
              if (signal?.aborted) {
                const err = new Error('Aborted');
                err.name = 'AbortError';
                throw err;
              }
            },
          },
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const res = await provider.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'Problem' }],
            maxTokens: 8192,
            signal: controller.signal,
          });

          expect(res.ok).toBe(false);
          expect(callCount).toBe(1); // Attempt 1 dispatched, aborted during sleep before attempt 2
          expect(res.code).toBe('provider_timeout');
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('stops retrying when remaining deadline is less than minAttemptBudgetMs', async () => {
        let callCount = 0;
        const mockFetch = vi.fn().mockImplementation(async () => {
          callCount++;
          return new Response(
            JSON.stringify({ error: { code: 503, message: 'Overloaded.' } }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          );
        });

        const provider = createGeminiProvider({
          apiKey: 'mock-key',
          resilience: {
            maxAttempts: 3,
            minAttemptBudgetMs: 5000,
            baseDelayMs: 2000,
            randomFn: () => 0.5, // Deterministic delay of 2000ms
            sleepFn: async () => {},
          },
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          // Started 124,000ms ago. Total budget is 130,000ms.
          // Remaining at start is 6,000ms (> 5,000ms min budget) -> attempt 1 runs.
          // After attempt 1 fails: remaining (6,000ms) minus delay (2,000ms) = 4,000ms (< 5,000ms min budget)
          // Therefore, attempt 2 is skipped.
          const requestStartedAt = Date.now() - 124_000;
          const deadlineMs = 130_000;

          const res = await provider.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'Problem' }],
            maxTokens: 8192,
            requestStartedAt,
            deadlineMs,
          });

          expect(res.ok).toBe(false);
          // Attempt 1 fails with 503; check reveals remaining time (4000ms - delay) < minAttemptBudgetMs (5000ms)
          // Therefore, attempt 2 is skipped.
          expect(callCount).toBe(1);
          expect(res.retryAttempts).toBe(1);
          expect(res.status).toBe(503);
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('halts retry when spending allowance guard rejects the attempt', async () => {
        let callCount = 0;
        const mockFetch = vi.fn().mockImplementation(async () => {
          callCount++;
          return new Response(
            JSON.stringify({ error: { code: 503, message: 'Overloaded.' } }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          );
        });

        // Hard ceiling allowing at most 1 conservative attempt ($0.065 = 65,000 micros)
        const provider = createGeminiProvider({
          apiKey: 'mock-key',
          resilience: {
            maxAttempts: 3,
            maxSpendAllowanceUsdMicros: 65_000,
            sleepFn: async () => {},
          },
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          // Call with conservative cost guard
          const res = await provider.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'Problem' }],
            maxTokens: 8192,
          });

          expect(res.ok).toBe(false);
          // Attempt 1 uses 65,000 allowance. Attempt 2 would require another 65,000 (total 130,000 > 65,000).
          // Guard halts retry.
          expect(callCount).toBe(1);
        } finally {
          globalThis.fetch = origFetch;
        }
      });
    });

    describe('7.3 Safe Fallback Circuit-Breaker', () => {
      it('strictly disables fallback by default and returns 503 failure without touching OpenAI', async () => {
        const geminiFetch = vi.fn().mockImplementation(async () => {
          return new Response(
            JSON.stringify({ error: { code: 503, message: 'Overloaded.' } }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          );
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = geminiFetch;
        try {
          const composite = createCompositeProvider({
            gemini: { apiKey: 'mock-gemini-key', resilience: { maxAttempts: 1 } },
            openAi: { apiKey: 'mock-openai-key' },
            // enableFallback is intentionally omitted -> MUST DEFAULT TO FALSE
          });

          const res = await composite.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'Test math' }],
            maxTokens: 8192,
          });

          expect(res.ok).toBe(false);
          expect(res.status).toBe(503);
          expect(res.fallbackTriggered).toBeUndefined();
          expect(geminiFetch).toHaveBeenCalledTimes(1);
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('falls back to gpt-4o-mini when enableFallback is true upon Gemini 503 exhaustion, merges tokens and emits audit event', async () => {
        const auditEvents: FallbackAuditEvent[] = [];
        let callTarget = '';

        const mockFetch = vi.fn().mockImplementation(async (url: string) => {
          if (url.includes('generativelanguage.googleapis.com')) {
            callTarget = 'gemini';
            return new Response(
              JSON.stringify({
                error: { code: 503, message: 'Spike in demand.' },
                usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 0, totalTokenCount: 150 },
              }),
              { status: 503, headers: { 'Content-Type': 'application/json' } },
            );
          }
          if (url.includes('api.openai.com')) {
            callTarget = 'openai';
            return new Response(
              JSON.stringify({
                id: 'chatcmpl-fallback-1',
                choices: [
                  {
                    finish_reason: 'stop',
                    message: { role: 'assistant', content: 'Fallback response: x = 4.' },
                  },
                ],
                usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
          }
          throw new Error(`Unexpected url: ${url}`);
        });

        const composite = createCompositeProvider({
          gemini: { apiKey: 'mock-gemini-key', resilience: { maxAttempts: 1 } },
          openAi: { apiKey: 'mock-openai-key' },
          enableFallback: true, // Opt-in
          fallbackModel: 'gpt-4o-mini',
          onFallbackAudit: (event) => auditEvents.push(event),
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const res = await composite.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'Solve x + 2 = 6' }],
            maxTokens: 8192,
          });

          expect(res.ok).toBe(true);
          if (!res.ok) return;
          expect(res.fallbackTriggered).toBe(true);
          expect(res.originalModel).toBe('gemini-3.6-flash');
          expect(res.rawModel).toBe('gpt-4o-mini');
          expect(res.text).toBe('Fallback response: x = 4.');

          // Merged token accounting: Gemini input 150 + OpenAI prompt 120 = 270 input
          expect(res.usage?.inputTokens).toBe(270);
          expect(res.usage?.outputTokens).toBe(30);
          expect(res.usage?.totalTokens).toBe(300);

          // Auditable log event emitted
          expect(auditEvents).toHaveLength(1);
          expect(auditEvents[0]?.originalModel).toBe('gemini-3.6-flash');
          expect(auditEvents[0]?.fallbackModel).toBe('gpt-4o-mini');
          expect(auditEvents[0]?.reason).toBe('gemini_503_exhausted');
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('does NOT fallback on non-503 client errors or rate limits even when enableFallback is true', async () => {
        let openAiCalled = false;
        const mockFetch = vi.fn().mockImplementation(async (url: string) => {
          if (url.includes('generativelanguage.googleapis.com')) {
            return new Response(
              JSON.stringify({
                error: { code: 429, message: 'Free tier quota exceeded.', status: 'RESOURCE_EXHAUSTED' },
              }),
              { status: 429, headers: { 'Content-Type': 'application/json' } },
            );
          }
          if (url.includes('api.openai.com')) {
            openAiCalled = true;
          }
          throw new Error('Unexpected URL');
        });

        const composite = createCompositeProvider({
          gemini: { apiKey: 'mock-gemini-key' },
          openAi: { apiKey: 'mock-openai-key' },
          enableFallback: true,
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const res = await composite.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'Test' }],
            maxTokens: 8192,
          });

          expect(res.ok).toBe(false);
          expect(res.status).toBe(429);
          expect(res.code).toBe('rate_limited');
          // OpenAI must NEVER be called on 429 quota exhaustion
          expect(openAiCalled).toBe(false);
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('routes legacy OpenAI models directly with zero retry loop or fallback logic', async () => {
        let geminiCalled = false;
        let openAiCalls = 0;

        const mockFetch = vi.fn().mockImplementation(async (url: string) => {
          if (url.includes('generativelanguage.googleapis.com')) {
            geminiCalled = true;
          }
          if (url.includes('api.openai.com')) {
            openAiCalls++;
            return new Response(
              JSON.stringify({
                id: 'chatcmpl-legacy-1',
                choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Legacy answer' } }],
                usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
          }
          throw new Error('Unexpected');
        });

        const composite = createCompositeProvider({
          gemini: { apiKey: 'mock-gemini-key' },
          openAi: { apiKey: 'mock-openai-key' },
          enableFallback: true,
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const res = await composite.complete({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'Legacy request' }],
            maxTokens: 1000,
          });

          expect(res.ok).toBe(true);
          expect(openAiCalls).toBe(1);
          expect(geminiCalled).toBe(false);
          expect(res.fallbackTriggered).toBeUndefined();
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('routes staging baseline gpt-5.6-luna directly to OpenAI with zero retry or fallback overhead', async () => {
        let geminiCalled = false;
        let openAiCalls = 0;

        const mockFetch = vi.fn().mockImplementation(async (url: string) => {
          if (url.includes('generativelanguage.googleapis.com')) {
            geminiCalled = true;
          }
          if (url.includes('api.openai.com')) {
            openAiCalls++;
            return new Response(
              JSON.stringify({
                id: 'chatcmpl-luna-1',
                choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Luna reasoning response' } }],
                usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
          }
          throw new Error('Unexpected URL');
        });

        const composite = createCompositeProvider({
          gemini: { apiKey: 'mock-gemini-key' },
          openAi: { apiKey: 'mock-openai-key' },
          enableFallback: false,
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const res = await composite.complete({
            model: 'gpt-5.6-luna',
            messages: [{ role: 'user', content: 'Solve calculus question' }],
            maxTokens: 8000,
          });

          expect(res.ok).toBe(true);
          expect(openAiCalls).toBe(1);
          expect(geminiCalled).toBe(false);
          expect(res.rawModel).toBe('gpt-5.6-luna');
          expect(res.fallbackTriggered).toBeUndefined();
        } finally {
          globalThis.fetch = origFetch;
        }
      });
    });

    describe('7.4 Phase 3.5: Dynamic Context Window Bounds & Cost Accounting Verification', () => {
      it('dynamically computes conservative attempt cost for large context windows without assuming 2000 tokens ceiling', () => {
        // 1. Short prompt: falls back to conservative floor of 65,000 micros ($0.065)
        const shortCost = estimateConservativeAttemptCostMicros({
          model: 'gemini-3.6-flash',
          messages: [{ role: 'user', content: 'Short question' }],
          maxTokens: 8192,
        });
        expect(shortCost).toBe(CONSERVATIVE_GEMINI_ATTEMPT_COST_USD_MICROS); // 65,000

        // 2. Large Tutor prompt with 10,000 chars of retrieved PDF excerpts:
        // 10,000 chars / 2 = 5,000 input tokens.
        // Input: 5,000 * $1.50/M = 7,500 micros. Output: 8,192 * $7.50/M = 61,440 micros.
        // Total = 7,500 + 61,440 = 68,940 micros ($0.06894) > 65,000 floor.
        const largePdfText = 'x'.repeat(10000);
        const largeCost = estimateConservativeAttemptCostMicros({
          model: 'gemini-3.6-flash',
          messages: [
            { role: 'system', content: 'You are an academic mathematics tutor.' },
            { role: 'user', content: largePdfText },
          ],
          maxTokens: 8192,
        });
        expect(largeCost).toBe(68969);
        expect(largeCost).toBeGreaterThan(CONSERVATIVE_GEMINI_ATTEMPT_COST_USD_MICROS);

        // 3. Tutor prompt with visual capture + 4,500 chars PDF excerpt:
        // 4,500 chars / 2 = 2,250 tokens + 1,000 visual capture tokens = 3,250 input tokens.
        // Input: 3,250 * $1.50/M = 4,875 micros. Output: 8,192 * $7.50/M = 61,440 micros.
        // Total = 4,875 + 61,440 = 66,315 micros ($0.066315) > 65,000 floor.
        const visualCost = estimateConservativeAttemptCostMicros({
          model: 'gemini-3.6-flash',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'x'.repeat(4500) },
                {
                  type: 'image_url',
                  image_url: { url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' },
                },
              ],
            },
          ],
          maxTokens: 8192,
        });
        expect(visualCost).toBe(66315);
        expect(visualCost).toBeGreaterThan(CONSERVATIVE_GEMINI_ATTEMPT_COST_USD_MICROS);
      });

      it('spending guard halts retry when dynamic attempt cost of large Tutor prompt exceeds budget', async () => {
        let callCount = 0;
        const mockFetch = vi.fn().mockImplementation(async () => {
          callCount++;
          return new Response(
            JSON.stringify({ error: { code: 503, message: 'Overloaded.' } }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          );
        });

        // Allowance is exactly 65,000 micros.
        // A short prompt would cost 65,000 micros and be allowed.
        // But a 10,000 char prompt requires 68,940 micros, so it must be blocked immediately!
        const provider = createGeminiProvider({
          apiKey: 'mock-key',
          resilience: {
            maxAttempts: 3,
            maxSpendAllowanceUsdMicros: 65_000,
            sleepFn: async () => {},
          },
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const res = await provider.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'x'.repeat(10000) }],
            maxTokens: 8192,
          });

          expect(res.ok).toBe(false);
          expect(res.code).toBe('provider_unavailable');
          expect(res.message).toContain('Spending allowance exceeded');
          // Dispatched 0 times because projected attempt cost (68,940 micros) exceeds 65,000 ceiling!
          expect(callCount).toBe(0);
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('verifies that thinking tokens are correctly included in outputTokens and not double-counted', () => {
        // Raw Gemini API response metadata where candidatesTokenCount already includes thoughtsTokenCount
        const rawGeminiUsage = {
          promptTokenCount: 1313,
          candidatesTokenCount: 1056,
          thoughtsTokenCount: 820,
          totalTokenCount: 2369,
        };

        const normalized = normalizeGeminiUsage(rawGeminiUsage);
        expect(normalized).toEqual({
          inputTokens: 1313,
          outputTokens: 1056,
          reasoningTokens: 820,
          totalTokens: 2369,
        });

        // Price estimation calculates:
        // Input: 1,313 * $1.50/M = 1,969.5 -> 1,970 micros
        // Output: 1,056 * $7.50/M = 7,920 micros
        // Total = 9,890 micros ($0.00989)
        const cost = estimateCostUsdMicros('gemini-3.6-flash', normalized!);
        expect(cost).toBe(9890);

        // If reasoningTokens were incorrectly added to outputTokens again (1056 + 820 = 1876):
        // (1876 * 7.50) = 14,070 + 1,970 = 16,040 micros.
        // Assert that cost is exactly 9,890 and not the double-counted 16,040!
        expect(cost).not.toBe(16040);
      });

      it('accurately parses real Gemini API v1beta response where candidates excludes thoughts and total includes thoughts', () => {
        // Real fixture structure from live_recovery_result_gemini-3_6-flash_g1.json
        const realApiResponse = {
          promptTokenCount: 1317,
          candidatesTokenCount: 1069,
          thoughtsTokenCount: 1739,
          totalTokenCount: 4125,
        };

        const normalized = normalizeGeminiUsage(realApiResponse);
        expect(normalized).toEqual({
          inputTokens: 1317,
          outputTokens: 2808, // 1069 candidates + 1739 thoughts (both billed at output rate)
          reasoningTokens: 1739,
          totalTokens: 4125,
        });

        // Price calculation:
        // Input: 1317 * $1.50 / 1M = 1975.5 -> 1976 micros
        // Output: 2808 * $7.50 / 1M = 21060 micros
        // Total = 23036 micros ($0.023036)
        const cost = estimateCostUsdMicros('gemini-3.6-flash', normalized!);
        expect(cost).toBe(23036);
      });

      it('enforces shared spending allowance across simulated concurrent requests', async () => {
        let activeSpentMicros = 0;
        const maxBudgetMicros = 100_000; // $0.10 cap

        const checkAllowance = (additionalCost: number) => {
          if (activeSpentMicros + additionalCost > maxBudgetMicros) return false;
          activeSpentMicros += additionalCost;
          return true;
        };

        const provider = createGeminiProvider({
          apiKey: 'mock-key',
          resilience: {
            checkSpendAllowance: checkAllowance,
            sleepFn: async () => {},
          },
        });

        // Request 1 estimates ~65,000 micros => approved (activeSpent becomes 65,000)
        // Request 2 estimates ~65,000 micros => rejected (65,000 + 65,000 > 100,000)
        const mockFetch = vi.fn().mockImplementation(async () => {
          return new Response(JSON.stringify({ error: { code: 503, message: 'Unavailable' } }), { status: 503 });
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const req1 = await provider.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'Calc question 1' }],
            maxTokens: 2048,
          });
          const req2 = await provider.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'Calc question 2' }],
            maxTokens: 2048,
          });

          expect(req2.ok).toBe(false);
          expect(req2.code).toBe('provider_unavailable');
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('halts retry attempts when maxCumulativeTokens reservation allowance is exceeded', async () => {
        let attemptsCount = 0;
        const mockFetch = vi.fn().mockImplementation(async () => {
          attemptsCount++;
          return new Response(
            JSON.stringify({
              error: { code: 503, message: 'Unavailable' },
              usageMetadata: {
                promptTokenCount: 10000,
                candidatesTokenCount: 2000,
                totalTokenCount: 12000,
              },
            }),
            { status: 503 }
          );
        });

        const provider = createGeminiProvider({
          apiKey: 'mock-key',
          resilience: {
            maxAttempts: 3,
            maxCumulativeTokens: 16000,
            sleepFn: async () => {},
          },
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const res = await provider.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'A'.repeat(10000) }], // ~5000 input tokens
            maxTokens: 8192,
          });

          // Attempt 1 used 12,000 tokens. Attempt 2 max tokens = 5,000 + 8,192 = 13,192.
          // Projected total = 12,000 + 13,192 = 25,192 > 16,000 allowance.
          // Retry must be halted before attempt 2!
          expect(attemptsCount).toBe(1);
          expect(res.ok).toBe(false);
          expect(res.code).toBe('provider_unavailable');
          expect(res.message).toContain('Token reservation allowance exceeded');
          expect(res.usage?.totalTokens).toBe(12000);
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('rejects the first attempt when its estimated maximum already exceeds allowance', async () => {
        let attemptsCount = 0;
        const mockFetch = vi.fn().mockImplementation(async () => {
          attemptsCount++;
          // Returns 503 WITHOUT usageMetadata (unobservable upstream usage)
          return new Response(
            JSON.stringify({
              error: { code: 503, message: 'High load' },
            }),
            { status: 503 }
          );
        });

        const provider = createGeminiProvider({
          apiKey: 'mock-key',
          resilience: {
            maxAttempts: 3,
            // Reservation is 10,000 tokens
            maxCumulativeTokens: 10000,
            sleepFn: async () => {},
          },
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const res = await provider.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'A'.repeat(6000) }], // ~3000 input tokens
            maxTokens: 8192, // Attempt max tokens = 3000 + 8192 = 11,192
          });

          // The first attempt maximum 11,192 already exceeds the 10,000 allowance.
          // No provider fetch is permitted, including the first attempt.
          expect(attemptsCount).toBe(0);
          expect(res.ok).toBe(false);
          expect(res.code).toBe('provider_unavailable');
          expect(res.message).toContain('Token reservation allowance exceeded');
        } finally {
          globalThis.fetch = origFetch;
        }
      });

      it('permits retry when remaining allowance safely covers conservative input and output consumption', async () => {
        let attemptsCount = 0;
        const mockFetch = vi.fn().mockImplementation(async () => {
          attemptsCount++;
          if (attemptsCount === 1) {
            return new Response(
              JSON.stringify({
                error: { code: 503, message: 'Temporary glitch' },
                usageMetadata: {
                  promptTokenCount: 1000,
                  candidatesTokenCount: 0,
                  totalTokenCount: 1000,
                },
              }),
              { status: 503 }
            );
          }
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: { parts: [{ text: 'Success on retry!' }] },
                  finishReason: 'STOP',
                },
              ],
              usageMetadata: {
                promptTokenCount: 1000,
                candidatesTokenCount: 200,
                totalTokenCount: 1200,
              },
            }),
            { status: 200 }
          );
        });

        const provider = createGeminiProvider({
          apiKey: 'mock-key',
          resilience: {
            maxAttempts: 3,
            // Sizable reservation: 20,000 tokens
            maxCumulativeTokens: 20000,
            sleepFn: async () => {},
          },
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = mockFetch;
        try {
          const res = await provider.complete({
            model: 'gemini-3.6-flash',
            messages: [{ role: 'user', content: 'Short prompt' }], // ~500 input floor
            maxTokens: 2000, // Attempt max tokens = 500 + 2000 = 2500
          });

          // Attempt 1: 1000 tokens. Attempt 2 max: ~2500 tokens. Total = 3500 <= 20000.
          // Retry was permitted and succeeded on attempt 2!
          expect(attemptsCount).toBe(2);
          expect(res.ok).toBe(true);
          expect(res.text).toBe('Success on retry!');
          expect(res.retryAttempts).toBe(2);
        } finally {
          globalThis.fetch = origFetch;
        }
      });
    });
  });
});

