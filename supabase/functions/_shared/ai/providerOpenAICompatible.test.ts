/**
 * @vitest-environment node
 *
 * Safe provider diagnostics — status/type/code/requestId only.
 * Never logs error.message, prompts, Authorization, or API keys.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProviderFailureDiagnostics,
  chatCompletionsUrl,
  createOpenAICompatibleProvider,
  formatProviderDiagnosticLog,
} from '../../../../supabase/functions/_shared/ai/providerOpenAICompatible.ts';
import { runGatewayPipeline } from '../../../../supabase/functions/_shared/ai/runGatewayPipeline.ts';
import { createMemoryEnforcementStore } from '../../../../supabase/functions/_shared/ai/enforcement.ts';
import type { GatewayAiContext, ZikukAiRequest } from '../../../../supabase/functions/_shared/ai/requestTypes.ts';

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
      text: 'The derivative of x squared is 2x.',
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
          content: { type: 'text', text: 'The derivative of x squared is 2x.' },
        },
      ],
    },
    ...overrides,
  };
}

function validRequest(): ZikukAiRequest {
  return { version: 1, capability: 'explain_selection', context: baseContext() };
}

function mockFetchResponse(input: {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  jsonThrow?: boolean;
}): Response {
  const headers = new Headers(input.headers ?? {});
  if (input.jsonThrow) {
    return {
      ok: input.status >= 200 && input.status < 300,
      status: input.status,
      headers,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    } as unknown as Response;
  }
  return {
    ok: input.status >= 200 && input.status < 300,
    status: input.status,
    headers,
    json: async () => input.body,
  } as unknown as Response;
}

const SENSITIVE_MESSAGE = 'sensitive provider message with sk-SECRETKEY and prompt text';
const API_KEY = 'sk-test-never-log-this-key';
const MODEL = 'gpt-5.6-luna';

describe('chatCompletionsUrl', () => {
  it('builds /v1/chat/completions from OpenAI base', () => {
    expect(chatCompletionsUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });
});

describe('formatProviderDiagnosticLog', () => {
  it('omits undefined optional fields and never includes message', () => {
    const line = formatProviderDiagnosticLog(
      buildProviderFailureDiagnostics({
        status: 400,
        model: MODEL,
        errorType: 'invalid_request_error',
        errorCode: 'unsupported_parameter',
        requestId: 'req_abc',
      }),
    );
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toEqual({
      event: 'zikuk_ai_gateway_provider',
      ok: false,
      providerHttpStatus: 400,
      providerErrorType: 'invalid_request_error',
      providerErrorCode: 'unsupported_parameter',
      model: MODEL,
      endpoint: 'chat_completions',
      requestId: 'req_abc',
    });
    expect(line).not.toMatch(/message/i);
    expect(line).not.toContain(SENSITIVE_MESSAGE);
  });
});

describe('createOpenAICompatibleProvider diagnostics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function completeWith(status: number, body: unknown, headers?: Record<string, string>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockFetchResponse({ status, body, headers })),
    );
    const provider = createOpenAICompatibleProvider({
      apiKey: API_KEY,
      baseUrl: 'https://api.openai.com/v1',
    });
    return provider.complete({
      model: MODEL,
      messages: [
        { role: 'system', content: 'SECRET_SYSTEM_PROMPT' },
        { role: 'user', content: 'SECRET_USER_SELECTION' },
      ],
      maxTokens: 1200,
    });
  }

  function assertSafeDiagnostics(result: Awaited<ReturnType<typeof completeWith>>) {
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const diag = result.diagnostics;
    expect(diag).toBeDefined();
    if (!diag) return;
    const serialized = JSON.stringify({ result, log: formatProviderDiagnosticLog(diag) });
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain('Authorization');
    expect(serialized).not.toContain('Bearer');
    expect(serialized).not.toContain('SECRET_SYSTEM_PROMPT');
    expect(serialized).not.toContain('SECRET_USER_SELECTION');
    expect(serialized).not.toContain(SENSITIVE_MESSAGE);
    expect(Object.keys(diag).sort()).toEqual(
      expect.arrayContaining(['providerHttpStatus', 'model', 'endpoint']),
    );
    expect('message' in diag).toBe(false);
  }

  it('A. OpenAI-style 400 captures type/code and excludes sensitive message', async () => {
    const result = await completeWith(400, {
      error: {
        message: SENSITIVE_MESSAGE,
        type: 'invalid_request_error',
        code: 'unsupported_parameter',
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('bad_response');
    expect(result.status).toBe(400);
    expect(result.diagnostics).toEqual({
      providerHttpStatus: 400,
      providerErrorType: 'invalid_request_error',
      providerErrorCode: 'unsupported_parameter',
      model: MODEL,
      endpoint: 'chat_completions',
    });
    assertSafeDiagnostics(result);
  });

  it('B. 401', async () => {
    const result = await completeWith(401, {
      error: { message: SENSITIVE_MESSAGE, type: 'invalid_request_error', code: 'invalid_api_key' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('bad_response');
    expect(result.diagnostics?.providerHttpStatus).toBe(401);
    expect(result.diagnostics?.providerErrorCode).toBe('invalid_api_key');
    assertSafeDiagnostics(result);
  });

  it('C. 403', async () => {
    const result = await completeWith(403, {
      error: { message: SENSITIVE_MESSAGE, type: 'invalid_request_error', code: 'model_not_found' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('bad_response');
    expect(result.diagnostics?.providerHttpStatus).toBe(403);
    assertSafeDiagnostics(result);
  });

  it('D. 404', async () => {
    const result = await completeWith(404, {
      error: { message: SENSITIVE_MESSAGE, type: 'invalid_request_error', code: 'model_not_found' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('bad_response');
    expect(result.diagnostics?.providerHttpStatus).toBe(404);
    assertSafeDiagnostics(result);
  });

  it('E. 429 → rate_limited with diagnostics', async () => {
    const result = await completeWith(429, {
      error: { message: SENSITIVE_MESSAGE, type: 'tokens', code: 'rate_limit_exceeded' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('rate_limited');
    expect(result.diagnostics).toMatchObject({
      providerHttpStatus: 429,
      providerErrorType: 'tokens',
      providerErrorCode: 'rate_limit_exceeded',
      endpoint: 'chat_completions',
    });
    assertSafeDiagnostics(result);
  });

  it('F. 500 → provider_unavailable with diagnostics', async () => {
    const result = await completeWith(500, {
      error: { message: SENSITIVE_MESSAGE, type: 'server_error', code: 'internal_error' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('provider_unavailable');
    expect(result.diagnostics?.providerHttpStatus).toBe(500);
    assertSafeDiagnostics(result);
  });

  it('G. malformed/non-JSON provider response still records status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mockFetchResponse({
          status: 502,
          body: null,
          jsonThrow: true,
          headers: { 'x-request-id': 'req_malformed' },
        }),
      ),
    );
    const provider = createOpenAICompatibleProvider({
      apiKey: API_KEY,
      baseUrl: 'https://api.openai.com/v1',
    });
    const result = await provider.complete({
      model: MODEL,
      messages: [{ role: 'user', content: 'SECRET_USER_SELECTION' }],
      maxTokens: 10,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('bad_response');
    expect(result.diagnostics).toEqual({
      providerHttpStatus: 502,
      model: MODEL,
      endpoint: 'chat_completions',
      requestId: 'req_malformed',
    });
    assertSafeDiagnostics(result);
  });

  it('H. captures x-request-id', async () => {
    const result = await completeWith(
      400,
      {
        error: {
          message: SENSITIVE_MESSAGE,
          type: 'invalid_request_error',
          code: 'unsupported_parameter',
        },
      },
      { 'x-request-id': 'req_from_openai_123' },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics?.requestId).toBe('req_from_openai_123');
    assertSafeDiagnostics(result);
  });
});

describe('I. client-safe mappings remain unchanged', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pipeline collapses bad_response to provider_unavailable without leaking diagnostics', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { response } = await runGatewayPipeline({
      body: validRequest(),
      authUserId: 'user-auth-1',
      provider: {
        complete: vi.fn(async () => ({
          ok: false as const,
          code: 'bad_response' as const,
          message: 'The model provider could not complete this request.',
          status: 400,
          latencyMs: 12,
          diagnostics: {
            providerHttpStatus: 400,
            providerErrorType: 'invalid_request_error',
            providerErrorCode: 'unsupported_parameter',
            model: MODEL,
            endpoint: 'chat_completions' as const,
            requestId: 'req_x',
          },
        })),
      },
      routerConfig: { model: MODEL },
      enforcement: createMemoryEnforcementStore(),
    });

    expect(response).toEqual({
      version: 1,
      ok: false,
      error: {
        code: 'provider_unavailable',
        message: 'The AI service is temporarily unavailable.',
      },
    });
    expect(JSON.stringify(response)).not.toContain('unsupported_parameter');
    expect(JSON.stringify(response)).not.toContain('invalid_request_error');
    expect(JSON.stringify(response)).not.toContain('req_x');

    expect(errorSpy).toHaveBeenCalledOnce();
    const logged = String(errorSpy.mock.calls[0]?.[0] ?? '');
    const parsed = JSON.parse(logged) as Record<string, unknown>;
    expect(parsed).toEqual({
      event: 'zikuk_ai_gateway_provider',
      ok: false,
      providerHttpStatus: 400,
      providerErrorType: 'invalid_request_error',
      providerErrorCode: 'unsupported_parameter',
      model: MODEL,
      endpoint: 'chat_completions',
      requestId: 'req_x',
    });
    expect(logged).not.toContain(SENSITIVE_MESSAGE);
    expect(logged).not.toContain(API_KEY);
  });

  it('pipeline keeps rate_limited and provider_timeout client codes', async () => {
    const rate = await runGatewayPipeline({
      body: validRequest(),
      authUserId: 'user-auth-1',
      provider: {
        complete: vi.fn(async () => ({
          ok: false as const,
          code: 'rate_limited' as const,
          message: 'internal',
          status: 429,
          latencyMs: 1,
          diagnostics: {
            providerHttpStatus: 429,
            model: MODEL,
            endpoint: 'chat_completions' as const,
          },
        })),
      },
      routerConfig: { model: MODEL },
      enforcement: createMemoryEnforcementStore(),
    });
    expect(rate.response.ok).toBe(false);
    if (!rate.response.ok) {
      expect(rate.response.error.code).toBe('rate_limited');
      expect(rate.response.error.message).toBe('Too many requests. Try again shortly.');
    }

    const timeout = await runGatewayPipeline({
      body: validRequest(),
      authUserId: 'user-auth-1',
      provider: {
        complete: vi.fn(async () => ({
          ok: false as const,
          code: 'provider_timeout' as const,
          message: 'SECRET_STACK',
          latencyMs: 1,
        })),
      },
      routerConfig: { model: MODEL },
      enforcement: createMemoryEnforcementStore(),
    });
    expect(timeout.response.ok).toBe(false);
    if (!timeout.response.ok) {
      expect(timeout.response.error.code).toBe('provider_timeout');
      expect(timeout.response.error.message).not.toContain('SECRET_STACK');
    }
  });
});
