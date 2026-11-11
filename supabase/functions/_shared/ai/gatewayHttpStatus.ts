/**
 * ZIKUK AI Gateway — HTTP Status Code & Emergency Response Helpers
 */

import type { ZikukAiResponse } from './requestTypes.ts';

export const AI_DISABLED_MAINTENANCE_MESSAGE =
  'AI services are temporarily disabled for maintenance.';

/**
 * Maps normalized Zikuk AI error codes to standard HTTP status codes.
 * Specifically aligns 'ai_disabled' with HTTP 503 Service Unavailable for maintenance.
 */
export function httpStatusFor(code: string): number {
  switch (code) {
    case 'unauthenticated':
      return 401;
    case 'auth_mismatch':
      return 403;
    case 'ai_disabled':
      return 503;
    case 'invalid_request':
    case 'unsupported_capability':
    case 'unsupported_content':
      return 400;
    case 'not_found':
    case 'knowledge_not_found':
      return 404;
    case 'rate_limited':
    case 'quota_exceeded':
      return 429;
    case 'provider_timeout':
      return 504;
    case 'output_budget_exhausted':
      return 422;
    case 'provider_unavailable':
      return 502;
    default:
      return 500;
  }
}

/**
 * Checks whether the AI emergency killswitch environment variable is set to active.
 */
export function isEmergencyDisabled(envValue?: string | null): boolean {
  return (envValue ?? '').trim().toLowerCase() === 'true';
}

/**
 * Constructs the standard versioned error response envelope for emergency disable.
 */
export function buildEmergencyDisabledResponse(): {
  response: Extract<ZikukAiResponse, { ok: false }>;
  status: number;
} {
  return {
    response: {
      version: 1,
      ok: false,
      error: {
        code: 'ai_disabled',
        message: AI_DISABLED_MAINTENANCE_MESSAGE,
      },
    },
    status: httpStatusFor('ai_disabled'),
  };
}
