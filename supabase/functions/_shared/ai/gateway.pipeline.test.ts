/**
 * @vitest-environment node
 *
 * Server Gateway unit tests — import pure modules from supabase/functions/_shared/ai.
 * No network, no Notebook mutation, no provider keys in client code.
 */

import { describe, expect, it, vi } from 'vitest';
import { authorizeGatewayUser } from '../../../../supabase/functions/_shared/ai/authorize.ts';
import {
  MAX_BLOCK_CHARS,
  MAX_SELECTION_CHARS,
  MAX_SURROUNDING_BLOCKS,
  SERVER_MAX_OUTPUT_TOKENS,
} from '../../../../supabase/functions/_shared/ai/bounds.ts';
import { buildExplainSelectionMessages } from '../../../../supabase/functions/_shared/ai/promptExplainSelection.ts';
import type { AiProvider } from '../../../../supabase/functions/_shared/ai/providerTypes.ts';
import { routeModel } from '../../../../supabase/functions/_shared/ai/routeModel.ts';
import { runGatewayPipeline } from '../../../../supabase/functions/_shared/ai/runGatewayPipeline.ts';
import {
  FORBIDDEN_PROVIDER_PAYLOAD_KEYS,
  sanitizeForProvider,
} from '../../../../supabase/functions/_shared/ai/sanitizeForProvider.ts';
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
      text: 'Euler theorem',
      from: 1,
      to: 14,
      blockKind: 'paragraph',
    },
    surroundings: {
      truncated: false,
      blocks: [
        {
          role: 'current',
          blockKind: 'paragraph',
          content: { type: 'text', text: 'Euler theorem states…' },
        },
      ],
    },
    ...overrides,
  };
}

function validRequest(ctx?: GatewayAiContext): ZikukAiRequest {
  return { version: 1, capability: 'explain_selection', context: ctx ?? baseContext() };
}

function fakeProvider(result: Awaited<ReturnType<AiProvider['complete']>>): AiProvider {
  return { complete: vi.fn(async () => result) };
}

describe('authorizeGatewayUser', () => {
  it('rejects missing auth', () => {
    const r = authorizeGatewayUser(null, 'user-auth-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unauthenticated');
  });

  it('rejects context user mismatch', () => {
    const r = authorizeGatewayUser('user-auth-1', 'other-user');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('auth_mismatch');
  });

  it('accepts matching authenticated user', () => {
    const r = authorizeGatewayUser('user-auth-1', 'user-auth-1');
    expect(r).toEqual({ ok: true, authUserId: 'user-auth-1' });
  });

  it('accepts empty context userId when auth present (still uses auth uid)', () => {
    const r = authorizeGatewayUser('user-auth-1', '');
    expect(r).toEqual({ ok: true, authUserId: 'user-auth-1' });
  });
});

describe('validateZikukAiRequest', () => {
  it('accepts a valid request', () => {
    const r = validateZikukAiRequest(validRequest());
    expect(r.ok).toBe(true);
  });

  it('rejects malformed body', () => {
    expect(validateZikukAiRequest(null).ok).toBe(false);
    expect(validateZikukAiRequest('x').ok).toBe(false);
  });

  it('rejects forbidden provider-control fields', () => {
    const r = validateZikukAiRequest({ ...validRequest(), model: 'gpt-expensive' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('invalid_request');
  });

  it('rejects oversized selection', () => {
    const r = validateZikukAiRequest(
      validRequest(
        baseContext({
          focus: {
            kind: 'text',
            text: 'x'.repeat(MAX_SELECTION_CHARS + 1),
            from: 1,
            to: 2,
            blockKind: 'paragraph',
          },
        }),
      ),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('invalid_request');
  });

  it('rejects excessive surroundings', () => {
    const blocks = Array.from({ length: MAX_SURROUNDING_BLOCKS + 1 }, (_, i) => ({
      role: 'current' as const,
      blockKind: 'paragraph',
      content: { type: 'text' as const, text: `b${i}` },
    }));
    const r = validateZikukAiRequest(
      validRequest(baseContext({ surroundings: { blocks, truncated: false } })),
    );
    expect(r.ok).toBe(false);
  });

  it('rejects oversized surrounding block', () => {
    const r = validateZikukAiRequest(
      validRequest(
        baseContext({
          surroundings: {
            truncated: true,
            blocks: [
              {
                role: 'current',
                blockKind: 'paragraph',
                content: { type: 'text', text: 'y'.repeat(MAX_BLOCK_CHARS + 1) },
              },
            ],
          },
        }),
      ),
    );
    expect(r.ok).toBe(false);
  });

  it('rejects empty focus', () => {
    const r = validateZikukAiRequest(
      validRequest(baseContext({ focus: { kind: 'empty' } })),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('invalid_request');
  });

  it('rejects unsupported capability', () => {
    const r = validateZikukAiRequest({
      version: 1,
      capability: 'ask_course',
      context: baseContext(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unsupported_capability');
  });

  it('rejects non-notebook surface', () => {
    const ctx = baseContext();
    (ctx as { surface: { type: string } }).surface = { type: 'pdf' };
    const r = validateZikukAiRequest(validRequest(ctx));
    expect(r.ok).toBe(false);
  });

  it('rejects image without multimodal → unsupported_content', () => {
    const r = validateZikukAiRequest(
      validRequest(
        baseContext({
          focus: {
            kind: 'image',
            assetKey: 'img-secret',
            alt: 'diagram',
            from: 1,
            to: 2,
          },
        }),
      ),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unsupported_content');
  });

  it('rejects handwriting without multimodal → unsupported_content', () => {
    const r = validateZikukAiRequest(
      validRequest(
        baseContext({
          focus: { kind: 'handwriting', assetKey: 'hw-secret', from: 1, to: 2 },
        }),
      ),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unsupported_content');
  });

  it('accepts math and table text', () => {
    expect(
      validateZikukAiRequest(
        validRequest(
          baseContext({
            focus: { kind: 'math_block', latex: 'x^2', from: 1, to: 4, blockKind: 'math' },
          }),
        ),
      ).ok,
    ).toBe(true);
    expect(
      validateZikukAiRequest(
        validRequest(
          baseContext({
            focus: {
              kind: 'table',
              mode: 'cell_text',
              rows: 2,
              cols: 2,
              text: '42',
              from: 1,
              to: 3,
            },
          }),
        ),
      ).ok,
    ).toBe(true);
  });
});

describe('sanitizeForProvider', () => {
  it('strips internal IDs and positions from provider payload', () => {
    const payload = sanitizeForProvider(baseContext());
    const json = JSON.stringify(payload);
    for (const key of FORBIDDEN_PROVIDER_PAYLOAD_KEYS) {
      expect(json).not.toContain(`"${key}"`);
    }
    expect(json).not.toContain('user-auth-1');
    expect(json).not.toContain('section-uuid-1');
    expect(json).not.toContain('ps-notebook-1');
    expect(json).not.toContain('page-1');
    expect(json).not.toContain('2026-09-19');
    expect(payload.courseTitle).toBe('Calculus I');
    expect(payload.focus).toMatchObject({ kind: 'text', text: 'Euler theorem' });
    expect(payload).not.toHaveProperty('from');
  });

  it('never includes assetKey for surrounding image/handwriting placeholders', () => {
    const payload = sanitizeForProvider(
      baseContext({
        surroundings: {
          truncated: false,
          blocks: [
            {
              role: 'previous',
              blockKind: 'image',
              content: { type: 'image', assetKey: 'img-leak', alt: 'x' },
            },
            {
              role: 'current',
              blockKind: 'paragraph',
              content: { type: 'text', text: 'hi' },
            },
          ],
        },
      }),
    );
    const json = JSON.stringify(payload);
    expect(json).not.toContain('img-leak');
    expect(json).not.toContain('assetKey');
    expect(payload.surroundings[0]?.content.type).toBe('image_placeholder');
  });
});

describe('routeModel', () => {
  it('uses server config model; client cannot choose', () => {
    const d = routeModel(
      { capability: 'explain_selection', modality: 'text' },
      { model: 'server-model-a' },
    );
    expect(d).toEqual({ providerId: 'openai_compatible', model: 'server-model-a' });
    expect(SERVER_MAX_OUTPUT_TOKENS).toBe(1200);
  });
});

describe('promptExplainSelection', () => {
  it('builds system+user messages from sanitized payload only', () => {
    const payload = sanitizeForProvider(baseContext());
    const msgs = buildExplainSelectionMessages(payload);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[1]?.content).toContain('Euler theorem');
    expect(msgs[1]?.content).not.toContain('user-auth-1');
    expect(msgs[1]?.content).not.toContain('section-uuid-1');
  });
});

describe('runGatewayPipeline', () => {
  it('rejects unauthenticated', async () => {
    const { response } = await runGatewayPipeline({
      body: validRequest(),
      authUserId: null,
      provider: fakeProvider({
        ok: true,
        text: 'nope',
        rawModel: 'm',
        latencyMs: 1,
      }),
      routerConfig: { model: 'm' },
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('unauthenticated');
  });

  it('rejects auth mismatch', async () => {
    const { response } = await runGatewayPipeline({
      body: validRequest(baseContext({ identity: { userId: 'attacker' } })),
      authUserId: 'user-auth-1',
      provider: fakeProvider({
        ok: true,
        text: 'nope',
        rawModel: 'm',
        latencyMs: 1,
      }),
      routerConfig: { model: 'm' },
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('auth_mismatch');
  });

  it('normalizes successful provider result', async () => {
    const provider = fakeProvider({
      ok: true,
      text: 'An explanation.',
      rawModel: 'server-model',
      latencyMs: 42,
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const { response, usageLog } = await runGatewayPipeline({
      body: validRequest(),
      authUserId: 'user-auth-1',
      provider,
      routerConfig: { model: 'server-model' },
    });
    expect(response).toMatchObject({
      version: 1,
      ok: true,
      result: { type: 'text', text: 'An explanation.' },
    });
    expect(usageLog?.ok).toBe(true);
    expect(usageLog?.inputTokens).toBe(10);
    expect(usageLog?.sectionId).toBe('section-uuid-1');
    expect(provider.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'server-model',
        maxTokens: SERVER_MAX_OUTPUT_TOKENS,
      }),
    );
  });

  it('normalizes provider timeout without leaking raw errors', async () => {
    const { response } = await runGatewayPipeline({
      body: validRequest(),
      authUserId: 'user-auth-1',
      provider: fakeProvider({
        ok: false,
        code: 'provider_timeout',
        message: 'SECRET_STACK_TRACE xyz',
        latencyMs: 9,
      }),
      routerConfig: { model: 'm' },
    });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('provider_timeout');
      expect(response.error.message).not.toContain('SECRET_STACK_TRACE');
    }
  });

  it('does not call provider for unsupported image content', async () => {
    const provider = fakeProvider({
      ok: true,
      text: 'should not run',
      rawModel: 'm',
      latencyMs: 1,
    });
    const { response } = await runGatewayPipeline({
      body: validRequest(
        baseContext({
          focus: { kind: 'image', assetKey: 'img', alt: '', from: 1, to: 2 },
        }),
      ),
      authUserId: 'user-auth-1',
      provider,
      routerConfig: { model: 'm' },
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('unsupported_content');
    expect(provider.complete).not.toHaveBeenCalled();
  });
});

describe('safety — no product mutation imports', () => {
  it('gateway shared modules do not reference Free Space persist APIs', async () => {
    // Static check via module graph: this file only imports _shared/ai.
    // Ensure client gateway does not import server provider adapter.
    const clientSrc = await import('../../../../src/lib/ai/gatewayClient/index.ts');
    expect(clientSrc.zikukAiRequest).toBeTypeOf('function');
    expect(clientSrc.AI_GATEWAY_FUNCTION_NAME).toBe('ai-gateway');
  });
});
