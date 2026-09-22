/**
 * Deterministic recovery operation identity (no durable job store in B2).
 */

import { PAGE_OCR_RECOVERY_VERSION } from './bounds.ts';

export function buildRecoveryIdentity(input: {
  sourceId: string;
  sourceVersion: number;
  pageNumber: number;
  recoveryVersion?: string;
}): string {
  const v = input.recoveryVersion ?? PAGE_OCR_RECOVERY_VERSION;
  return `${input.sourceId}@v${input.sourceVersion}:p${input.pageNumber}:${v}`;
}
