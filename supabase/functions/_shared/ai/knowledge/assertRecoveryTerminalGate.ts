/**
 * M1.0B B3.3A — recovery terminal gate + processing authority (pure).
 */

import {
  decidePageRecoveryTrigger,
  type RecoveryTriggerResult,
} from './pageRecoveryPolicy.ts';
import {
  isTerminalPageRecoveryJobStatus,
  type PageRecoveryJobStatus,
} from './pageRecoveryJobState.ts';
import type { PageSuspicionReasonCode } from './detectPageExtractionSuspicion.ts';

export type RecoveryJobSnapshot = {
  pageNumber: number;
  status: PageRecoveryJobStatus;
  detectorReasons: string[];
};

export type PageTextSnapshot = {
  pageNumber: number;
  detectorReasons: string[];
};

export type ProcessingAuthorityOk = { ok: true };
export type ProcessingAuthorityFail = {
  ok: false;
  code: 'stale_processing_version' | 'invalid_request';
};

export function assertProcessingAuthority(input: {
  targetSourceVersion: number;
  currentSourceVersion: number;
}): ProcessingAuthorityOk | ProcessingAuthorityFail {
  if (
    !Number.isInteger(input.targetSourceVersion) ||
    input.targetSourceVersion < 1 ||
    !Number.isInteger(input.currentSourceVersion) ||
    input.currentSourceVersion < 1
  ) {
    return { ok: false, code: 'invalid_request' };
  }
  if (input.targetSourceVersion !== input.currentSourceVersion) {
    return { ok: false, code: 'stale_processing_version' };
  }
  return { ok: true };
}

export type RecoveryTerminalGateOk = {
  ok: true;
  requiredPages: number[];
  triggerByPage: Map<number, RecoveryTriggerResult>;
};

export type RecoveryTerminalGateFail = {
  ok: false;
  code:
    | 'recovery_not_terminal'
    | 'discarded_stale_authority'
    | 'missing_required_job'
    | 'invalid_request';
  detail?: string;
};

/**
 * Assembly may begin only when every auto-recover page has a terminal job.
 * discarded_stale on a required job → fail closed (re-evaluate authority upstream).
 */
export function assertRecoveryTerminalGate(input: {
  pages: readonly PageTextSnapshot[];
  jobs: readonly RecoveryJobSnapshot[];
  recoveryEnabled?: boolean;
}): RecoveryTerminalGateOk | RecoveryTerminalGateFail {
  const jobsByPage = new Map<number, RecoveryJobSnapshot[]>();
  for (const job of input.jobs) {
    if (!Number.isInteger(job.pageNumber) || job.pageNumber < 1) {
      return { ok: false, code: 'invalid_request', detail: 'bad_job_page' };
    }
    const list = jobsByPage.get(job.pageNumber) ?? [];
    list.push(job);
    jobsByPage.set(job.pageNumber, list);
  }

  const requiredPages: number[] = [];
  const triggerByPage = new Map<number, RecoveryTriggerResult>();

  for (const page of input.pages) {
    const reasons = page.detectorReasons.filter(Boolean) as PageSuspicionReasonCode[];
    const trigger = decidePageRecoveryTrigger(reasons, {
      enabled: input.recoveryEnabled,
    });
    triggerByPage.set(page.pageNumber, trigger);
    if (!trigger.autoRecover) continue;

    requiredPages.push(page.pageNumber);
    const pageJobs = jobsByPage.get(page.pageNumber) ?? [];
    if (pageJobs.length === 0) {
      return {
        ok: false,
        code: 'missing_required_job',
        detail: `page_${page.pageNumber}`,
      };
    }

    for (const job of pageJobs) {
      if (job.status === 'discarded_stale') {
        return {
          ok: false,
          code: 'discarded_stale_authority',
          detail: `page_${page.pageNumber}`,
        };
      }
      if (!isTerminalPageRecoveryJobStatus(job.status)) {
        return {
          ok: false,
          code: 'recovery_not_terminal',
          detail: `page_${page.pageNumber}:${job.status}`,
        };
      }
    }
  }

  // Any non-terminal job for this version (even non-required) blocks assembly.
  for (const job of input.jobs) {
    if (job.status === 'discarded_stale') {
      return {
        ok: false,
        code: 'discarded_stale_authority',
        detail: `page_${job.pageNumber}`,
      };
    }
    if (!isTerminalPageRecoveryJobStatus(job.status)) {
      return {
        ok: false,
        code: 'recovery_not_terminal',
        detail: `page_${job.pageNumber}:${job.status}`,
      };
    }
  }

  return { ok: true, requiredPages, triggerByPage };
}
