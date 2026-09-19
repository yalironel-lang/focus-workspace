/**
 * @vitest-environment node
 *
 * M0.2.6 preflight — authz + validation independent of provider config.
 */

import { describe, expect, it, vi } from 'vitest';
import { preflightGatewayRequest } from '../../../../supabase/functions/_shared/ai/preflightGatewayRequest.ts';
import type { GatewayAiContext, ZikukAiRequest } from '../../../../supabase/functions/_shared/ai/requestTypes.ts';
import { runGatewayPipeline } from '../../../../supabase/functions/_shared/ai/runGatewayPipeline.ts';
import type { AiProvider } from '../../../../supabase/functions/_shared/ai/providerTypes.ts';

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
      from: 1,
      to: 35,
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

function validRequest(ctx?: GatewayAiContext): ZikukAiRequest {
  return { version: 1, capability: 'explain_selection', context: ctx ?? baseContext() };
}

describe('preflightGatewayRequest', () => {
  it('correct user + valid request passes preflight', () => {
    const r = preflightGatewayRequest({
      body: validRequest(),
      authUserId: 'user-auth-1',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.authUserId).toBe('user-auth-1');
      expect(r.request.capability).toBe('explain_selection');
      expect(r.request.context.focus.kind).toBe('text');
    }
  });

  it('forged user fails auth_mismatch before any provider stage', () => {
    const r = preflightGatewayRequest({
      body: validRequest(baseContext({ identity: { userId: '00000000-0000-4000-8000-000000000000' } })),
      authUserId: 'user-auth-1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.error.code).toBe('auth_mismatch');
    }
  });

  it('malformed request fails validation', () => {
    const r = preflightGatewayRequest({
      body: { version: 1, capability: 'explain_selection' },
      authUserId: 'user-auth-1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.error.code).toBe('invalid_request');
    }
  });

  it('unsupported image content fails before provider configuration', () => {
    const r = preflightGatewayRequest({
      body: validRequest(
        baseContext({
          focus: { kind: 'image', assetKey: 'img-x', alt: '', from: 1, to: 2 },
        }),
      ),
      authUserId: 'user-auth-1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.error.code).toBe('unsupported_content');
    }
  });

  it('unauthenticated fails preflight', () => {
    const r = preflightGatewayRequest({
      body: validRequest(),
      authUserId: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.error.code).toBe('unauthenticated');
    }
  });

  it('preflight itself cannot call a provider (pure sync, no complete)', () => {
    const provider: AiProvider = {
      complete: vi.fn(async () => {
        throw new Error('provider must not be called from preflight');
      }),
    };
    const r = preflightGatewayRequest({
      body: validRequest(),
      authUserId: 'user-auth-1',
    });
    expect(r.ok).toBe(true);
    expect(provider.complete).not.toHaveBeenCalled();
  });
});

describe('runGatewayPipeline after preflight refactor', () => {
  it('still normalizes success via fake provider', async () => {
    const complete = vi.fn(async () => ({
      ok: true as const,
      text: 'ok',
      rawModel: 'm',
      latencyMs: 1,
    }));
    const { response } = await runGatewayPipeline({
      body: validRequest(),
      authUserId: 'user-auth-1',
      provider: { complete },
      routerConfig: { model: 'm' },
    });
    expect(response.ok).toBe(true);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('auth_mismatch never reaches provider', async () => {
    const complete = vi.fn(async () => ({
      ok: true as const,
      text: 'nope',
      rawModel: 'm',
      latencyMs: 1,
    }));
    const { response } = await runGatewayPipeline({
      body: validRequest(baseContext({ identity: { userId: 'attacker' } })),
      authUserId: 'user-auth-1',
      provider: { complete },
      routerConfig: { model: 'm' },
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('auth_mismatch');
    expect(complete).not.toHaveBeenCalled();
  });
});
