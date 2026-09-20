/**
 * M0.6 — safe Ask ZIKUK panel copy for normalized gateway error codes.
 * Prefer these over raw transport messages; never invent a parallel error system.
 */

import type { ZikukAiErrorCode } from '../gatewayClient';

const SAFE_COPY: Partial<Record<ZikukAiErrorCode, string>> = {
  knowledge_not_found:
    "I couldn't find enough support for that in the indexed course material.\nTry asking about a more specific concept from your course.",
  unauthenticated: 'Sign in to ask about your course.',
  auth_mismatch: 'Sign in again to continue.',
  not_found: 'This workspace is unavailable for Ask ZIKUK.',
  rate_limited: 'Too many requests. Try again shortly.',
  quota_exceeded: 'Daily AI limit reached. Try again tomorrow.',
  ai_disabled: 'AI is disabled for this account.',
  provider_unavailable: 'The AI service is temporarily unavailable. Try again shortly.',
  provider_timeout: 'The AI service timed out. Try again.',
  invalid_request: 'That question could not be sent. Try rephrasing it.',
  unsupported_capability: 'Ask ZIKUK is not available right now.',
  unsupported_content: 'That question could not be answered from course material.',
  internal_error: 'Something went wrong. Try again later.',
};

/** Transient failures where Retry with the same question is useful. */
const RETRYABLE: ReadonlySet<ZikukAiErrorCode> = new Set([
  'rate_limited',
  'provider_unavailable',
  'provider_timeout',
  'internal_error',
]);

export function userFacingAskCourseErrorMessage(
  code: ZikukAiErrorCode | null,
  fallback: string | null,
): string {
  if (code && SAFE_COPY[code]) return SAFE_COPY[code]!;
  return fallback ?? 'Something went wrong. Try again later.';
}

export function isAskCourseRetryAllowed(code: ZikukAiErrorCode | null): boolean {
  return code != null && RETRYABLE.has(code);
}
