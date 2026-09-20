/**
 * Classify ai-knowledge-process client errors for handoff marker policy.
 */

import type { KnowledgeProcessClientErrorCode } from '../knowledgeProcessClient';

export type KnowledgeProcessFailureKind =
  | 'permanent'
  | 'retryable'
  | 'stale'
  | 'auth_retain'
  | 'aborted';

const PERMANENT = new Set<string>([
  'no_extractable_text',
  'too_large',
  'too_many_pages',
  'not_pdf',
  'invalid_request',
  'auth_mismatch',
  'extract_failed',
]);

/**
 * Map process error codes to marker disposition.
 * - permanent → clear marker
 * - auth_retain / retryable / stale / aborted → keep marker
 */
export function classifyKnowledgeProcessFailure(
  code: KnowledgeProcessClientErrorCode | string,
): KnowledgeProcessFailureKind {
  if (code === 'aborted') return 'aborted';
  if (code === 'unauthenticated') return 'auth_retain';
  if (code === 'stale_job') return 'stale';
  if (PERMANENT.has(code)) return 'permanent';
  return 'retryable';
}
