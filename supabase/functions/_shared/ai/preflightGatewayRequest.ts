/**
 * Pure Gateway preflight (server-only).
 *
 * Authz + request validation — NO provider, NO secrets, NO network.
 *
 * Flow:
 *   auth.getUser() [Edge entry]
 *   → preflightGatewayRequest
 *   → [AI config gate]
 *   → sanitize / prompt / router / provider
 */

import { authorizeGatewayUser } from './authorize.ts';
import type { ZikukAiRequest, ZikukAiResponse } from './requestTypes.ts';
import { validateZikukAiRequest } from './validateRequest.ts';

export type PreflightGatewayInput = {
  body: unknown;
  /** From verified JWT / auth.getUser(); null if missing/invalid. */
  authUserId: string | null;
};

export type PreflightGatewaySuccess = {
  ok: true;
  authUserId: string;
  request: ZikukAiRequest;
};

export type PreflightGatewayFailure = {
  ok: false;
  response: Extract<ZikukAiResponse, { ok: false }>;
};

export type PreflightGatewayResult = PreflightGatewaySuccess | PreflightGatewayFailure;

function peekContextUserId(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const identity = (body as { context?: { identity?: { userId?: unknown } } }).context?.identity;
  return typeof identity?.userId === 'string' ? identity.userId : undefined;
}

/**
 * Authorize + validate before any provider configuration or model call.
 */
export function preflightGatewayRequest(input: PreflightGatewayInput): PreflightGatewayResult {
  // Early authz using peeked userId (catches unauthenticated / obvious mismatch
  // even when the body is malformed). Full validate follows.
  const authzPeek = authorizeGatewayUser(input.authUserId, peekContextUserId(input.body));
  if (!authzPeek.ok) {
    return {
      ok: false,
      response: {
        version: 1,
        ok: false,
        error: { code: authzPeek.code, message: authzPeek.message },
      },
    };
  }

  const validated = validateZikukAiRequest(input.body);
  if (!validated.ok) {
    return {
      ok: false,
      response: {
        version: 1,
        ok: false,
        error: { code: validated.code, message: validated.message },
      },
    };
  }

  const { request } = validated;
  // Authoritative authz against validated context.identity.userId
  const authz = authorizeGatewayUser(authzPeek.authUserId, request.context.identity.userId);
  if (!authz.ok) {
    return {
      ok: false,
      response: {
        version: 1,
        ok: false,
        error: { code: authz.code, message: authz.message },
      },
    };
  }

  return {
    ok: true,
    authUserId: authz.authUserId,
    request,
  };
}
