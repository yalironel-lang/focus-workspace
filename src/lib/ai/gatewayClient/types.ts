/**
 * Client-facing ZIKUK AI Gateway contracts (M0.2).
 * Provider-independent. No secrets, models, or provider SDKs.
 *
 * Wire shape must stay aligned with supabase/functions/_shared/ai/requestTypes.ts.
 */

import type { ZikukAiContext } from '../context/types';

export type ZikukAiCapability = 'explain_selection';

export type ZikukAiErrorCode =
  | 'unauthenticated'
  | 'auth_mismatch'
  | 'invalid_request'
  | 'unsupported_capability'
  | 'unsupported_content'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'quota_exceeded'
  | 'internal_error';

/**
 * Provider-independent request. Client must NOT include provider/model/apiKey/messages.
 */
export type ZikukAiRequest = {
  version: 1;
  capability: ZikukAiCapability;
  context: ZikukAiContext;
};

export type ZikukAiResponse =
  | {
      version: 1;
      ok: true;
      result: { type: 'text'; text: string };
      meta?: { capability: ZikukAiCapability; latencyMs?: number };
    }
  | {
      version: 1;
      ok: false;
      error: { code: ZikukAiErrorCode; message: string };
    };

export const AI_GATEWAY_FUNCTION_NAME = 'ai-gateway';
