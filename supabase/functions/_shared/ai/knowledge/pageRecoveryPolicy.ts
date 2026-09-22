/**
 * M1.0B B3.1 — versioned selective page recovery trigger policy.
 * Pure / deterministic. Does not enqueue jobs itself.
 */

import {
  KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION,
  KNOWLEDGE_PAGE_RECOVERY_POLICY_VERSION,
  KNOWLEDGE_SELECTIVE_PAGE_RECOVERY_ENABLED,
} from './bounds.ts';
import type { PageSuspicionReasonCode } from './detectPageExtractionSuspicion.ts';

export type RecoveryTriggerDecision =
  | 'auto_recover'
  | 'observe_only'
  | 'disabled_experimental'
  | 'healthy';

export type RecoveryTriggerResult = {
  decision: RecoveryTriggerDecision;
  autoRecover: boolean;
  policyVersion: typeof KNOWLEDGE_PAGE_RECOVERY_POLICY_VERSION;
  recoveryVersion: typeof KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION;
  /** Reasons that caused auto_recover (subset of input). */
  strongTriggers: PageSuspicionReasonCode[];
  /** Reasons present but not auto-recovering under this policy version. */
  observeOnlyReasons: PageSuspicionReasonCode[];
};

const AUTO_RECOVER = new Set<PageSuspicionReasonCode>([
  'SHELL_WITH_MISSING_CONTENT',
  'LOW_TEXT_ITEM_COUNT',
]);

const OBSERVE_ONLY = new Set<PageSuspicionReasonCode>(['SPARSE_TEXT']);

const EXPERIMENTAL = new Set<PageSuspicionReasonCode>(['SUSPICIOUS_UNICODE']);

/**
 * Tiered initial policy (page-recovery-policy-v1):
 * - AUTO: SHELL_WITH_MISSING_CONTENT, LOW_TEXT_ITEM_COUNT
 * - OBSERVE: SPARSE_TEXT alone
 * - EXPERIMENTAL/disabled: SUSPICIOUS_UNICODE
 * If any strong trigger is present among reasons → auto_recover.
 */
export function decidePageRecoveryTrigger(
  reasons: readonly PageSuspicionReasonCode[],
  opts?: { enabled?: boolean },
): RecoveryTriggerResult {
  const enabled = opts?.enabled ?? KNOWLEDGE_SELECTIVE_PAGE_RECOVERY_ENABLED;
  const unique = [...new Set(reasons)];
  const strongTriggers = unique.filter((r) => AUTO_RECOVER.has(r));
  const observeOnlyReasons = unique.filter((r) => OBSERVE_ONLY.has(r) || EXPERIMENTAL.has(r));

  if (!enabled) {
    return {
      decision: unique.length === 0 ? 'healthy' : 'observe_only',
      autoRecover: false,
      policyVersion: KNOWLEDGE_PAGE_RECOVERY_POLICY_VERSION,
      recoveryVersion: KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION,
      strongTriggers,
      observeOnlyReasons: unique,
    };
  }

  if (strongTriggers.length > 0) {
    return {
      decision: 'auto_recover',
      autoRecover: true,
      policyVersion: KNOWLEDGE_PAGE_RECOVERY_POLICY_VERSION,
      recoveryVersion: KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION,
      strongTriggers,
      observeOnlyReasons: unique.filter((r) => !AUTO_RECOVER.has(r)),
    };
  }

  if (unique.some((r) => EXPERIMENTAL.has(r)) && !unique.some((r) => OBSERVE_ONLY.has(r))) {
    return {
      decision: 'disabled_experimental',
      autoRecover: false,
      policyVersion: KNOWLEDGE_PAGE_RECOVERY_POLICY_VERSION,
      recoveryVersion: KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION,
      strongTriggers: [],
      observeOnlyReasons: unique,
    };
  }

  if (unique.length > 0) {
    return {
      decision: 'observe_only',
      autoRecover: false,
      policyVersion: KNOWLEDGE_PAGE_RECOVERY_POLICY_VERSION,
      recoveryVersion: KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION,
      strongTriggers: [],
      observeOnlyReasons,
    };
  }

  return {
    decision: 'healthy',
    autoRecover: false,
    policyVersion: KNOWLEDGE_PAGE_RECOVERY_POLICY_VERSION,
    recoveryVersion: KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION,
    strongTriggers: [],
    observeOnlyReasons: [],
  };
}
