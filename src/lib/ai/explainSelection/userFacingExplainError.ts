/**
 * Release 1 — safe Explain panel copy for normalized gateway error codes.
 * Prefer these over raw transport messages; never invent a parallel error system.
 */

import type { ZikukAiErrorCode } from '../gatewayClient';

const SAFE_COPY: Partial<Record<ZikukAiErrorCode, string>> = {
  quota_exceeded: 'Daily AI limit reached. Try again tomorrow.',
  rate_limited: 'Too many requests. Try again shortly.',
  ai_disabled: 'AI is disabled for this account.',
  provider_unavailable: 'The AI service is temporarily unavailable. Try again shortly.',
  provider_timeout: 'The AI service timed out. Try again.',
  internal_error: 'AI is temporarily unavailable. Try again later.',
};

/** Codes where Retry with the same frozen context is useful. */
const RETRYABLE: ReadonlySet<ZikukAiErrorCode> = new Set([
  'rate_limited',
  'provider_unavailable',
  'provider_timeout',
  'internal_error',
]);

export function userFacingExplainErrorMessage(
  code: ZikukAiErrorCode | null,
  fallback: string | null,
): string {
  if (code && SAFE_COPY[code]) return SAFE_COPY[code]!;
  return fallback ?? 'Something went wrong.';
}

export function isExplainRetryAllowed(code: ZikukAiErrorCode | null): boolean {
  return code != null && RETRYABLE.has(code);
}
