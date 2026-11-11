import type { ZikukAiErrorCode } from '../gatewayClient';

/**
 * Format student-friendly, nontechnical error copy for ZIKUK Tutor.
 *
 * Guarantees:
 * - No internal DB/RPC/SQL/provider/project details leaked.
 * - Daily quota reset is accurately stated as midnight UTC (no false promises).
 * - Distinguishes between daily request limit and reading capacity (token limit).
 * - Emergency disable is framed as scheduled maintenance, not an account ban.
 * - Always provides a clear, polite next step (e.g. consult materials directly).
 */
export function formatStudentTutorErrorMessage(
  code: ZikukAiErrorCode | null | undefined,
  rawMessage?: string | null,
): string {
  // 1. Emergency Killswitch / AI Disabled
  if (
    code === 'ai_disabled' ||
    (rawMessage && /emergency\s*killswitch|ai\s*disabled/i.test(rawMessage))
  ) {
    return 'AI tutoring is temporarily unavailable for scheduled maintenance. Please consult your course materials directly or check back shortly.';
  }

  // 2. Daily Quota Exceeded (Requests vs Tokens / Reading Capacity)
  if (
    code === 'quota_exceeded' ||
    (rawMessage && /quota|capacity|daily.*limit|budget/i.test(rawMessage))
  ) {
    const isTokenCapacity = Boolean(rawMessage && /token|reading\s*capacity/i.test(rawMessage));
    if (isTokenCapacity) {
      return 'Daily reading capacity reached for this course. Your allowance will reset at midnight UTC. You can continue reviewing your notes and documents directly.';
    }
    const isRequestLimit = Boolean(rawMessage && /request/i.test(rawMessage));
    if (isRequestLimit) {
      return 'Daily question limit reached. Your allowance will reset at midnight UTC. You can continue reading your course materials in the meantime.';
    }
    return 'Daily study capacity reached for this course. Your allowance will reset at midnight UTC. Please continue reviewing your course materials directly.';
  }

  // 3. Rate Limited
  if (code === 'rate_limited') {
    return 'Too many questions asked in a short period. Please pause for a moment and try again.';
  }

  // 4. Output Budget Exhausted
  if (code === 'output_budget_exhausted') {
    if (rawMessage && !isTechnicalLeak(rawMessage)) return rawMessage;
    return "The explanation was too long to complete. Try asking about a more specific part of this concept.";
  }

  // 5. Knowledge Not Found
  if (code === 'knowledge_not_found') {
    return "I couldn't find enough support for that in the indexed course material. Try asking about a specific concept from your course.";
  }

  // 6. Authentication Issues
  if (code === 'unauthenticated') {
    return 'Please sign in to ask questions about your course.';
  }
  if (code === 'auth_mismatch') {
    return 'Your session expired. Please sign in again to continue.';
  }

  // 7. Provider Errors
  if (code === 'provider_timeout') {
    if (rawMessage && !isTechnicalLeak(rawMessage)) return rawMessage;
    return 'The AI service timed out. Please try again.';
  }
  if (code === 'provider_unavailable') {
    if (rawMessage && !isTechnicalLeak(rawMessage)) return rawMessage;
    return 'The AI service is temporarily unavailable. Please try again shortly.';
  }

  // 8. Sanitized fallback for raw messages
  if (rawMessage && !isTechnicalLeak(rawMessage) && rawMessage.length < 200) {
    return rawMessage;
  }

  return 'Something went wrong while generating an answer. Please try again or consult your course materials directly.';
}

/** Check whether a message leaks internal database, RPC, schema, or infrastructure details. */
export function isTechnicalLeak(message: string): boolean {
  return /sql|rpc|postgres|supabase|relation|schema|column\b|table\b|foreign\s*key|syntax\s*error|pg_|pgrst|violates\b|permission\s*denied|function\s+[a-z0-9_]+\s*\(|stack\s*trace/i.test(
    message,
  );
}

/** Determines whether Retry should be offered to the student. */
export function isTutorRetryAllowed(code: ZikukAiErrorCode | null | undefined): boolean {
  if (!code) return true;
  if (
    code === 'ai_disabled' ||
    code === 'quota_exceeded' ||
    code === 'output_budget_exhausted' ||
    code === 'unauthenticated' ||
    code === 'auth_mismatch' ||
    code === 'invalid_request'
  ) {
    return false;
  }
  return true;
}
