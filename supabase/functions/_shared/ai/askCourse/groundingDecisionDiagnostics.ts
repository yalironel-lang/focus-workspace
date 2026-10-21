/**
 * Staging-only metadata for claim-level grounding decisions.
 * Logs codes and counts. Never logs prompts, answers, claim text, PDF text,
 * user identifiers, document identifiers, or credentials.
 */

import type { KnowledgeTier } from '../requestTypes.ts';

export const GROUNDING_DECISION_DIAGNOSTICS_FLAG = 'ZIKUK_GROUNDING_DECISION_DIAGNOSTICS';

const STAGING_SUPABASE_HOST = 'lmgrhmyurhjlwwdedojk.supabase.co';
const PRODUCTION_PROJECT_REF = 'comxmviofnotfwzbupxg';

const RELATION_CLASSES = [
  'verbatim',
  'equivalent',
  'contradiction',
  'unmatched',
  'unparsed',
  'none',
  'not_applicable',
] as const;

const DECISION_CODES = [
  'empty',
  'self_limitation',
  'relation_contradiction',
  'choice_only_unmatched',
  'derived_unverified',
  'option_repeat',
  'causal_split',
  'course_fact',
  'polarity_conflict',
  'numeric_conflict',
  'quoted',
  'equivalent',
  'zero_overlap',
  'faithful_paraphrase',
  'interpretive',
  'skipped_echo',
  'skipped_narration',
  'skipped_symbol',
  'skipped_fragment',
  'label_verified',
  'label_contradicted',
  'label_unverified',
] as const;

const DISPOSITIONS = ['retained', 'rewritten', 'removed'] as const;

const NOTICE_CLASSES = [
  'none',
  'combined',
  'additional_explanation',
  'interpretation',
  'rejected_part',
  'contradicted_option',
  'additional_explanation_and_contradicted_option',
  'interpretation_and_contradicted_option',
  'source_limitation',
  'derived_unverified',
] as const;

const TIERS = ['course_material', 'pdf_selection', 'general_academic', 'mixed'] as const;

export type GroundingRelationClass = (typeof RELATION_CLASSES)[number];
export type GroundingDecisionCode = (typeof DECISION_CODES)[number];
export type GroundingClaimDisposition = (typeof DISPOSITIONS)[number];
export type GroundingNoticeClass = (typeof NOTICE_CLASSES)[number];

export type GroundingClaimTrace = {
  claimIndex: number;
  relation: GroundingRelationClass;
  decision: GroundingDecisionCode;
  disposition: GroundingClaimDisposition;
};

export type GroundingDecisionDiagnosticSink = {
  correlationId: string;
  emit: (line: string) => void;
};

const CORRELATION_ID_RE = /^[a-f0-9]{12}$/;

const DECISION_KEYS = [
  'event',
  'correlationId',
  'claimIndex',
  'claimCount',
  'relation',
  'decision',
  'disposition',
  'knowledgeTier',
  'notice',
] as const;

const SUMMARY_KEYS = ['event', 'correlationId', 'claimCount', 'knowledgeTier', 'notice'] as const;

function isListed<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

/**
 * Enabled only when the flag is exactly "1" and the Supabase URL host is the
 * staging project. A production host, a missing URL, or any other flag value
 * stays off, including when the production ref appears anywhere in the URL.
 */
export function isGroundingDecisionDiagnosticsEnabled(input: {
  flag: string | undefined;
  supabaseUrl: string | undefined;
}): boolean {
  if ((input.flag ?? '').trim() !== '1') return false;
  const rawUrl = (input.supabaseUrl ?? '').trim();
  if (!rawUrl || rawUrl.toLowerCase().includes(PRODUCTION_PROJECT_REF)) return false;
  try {
    return new URL(rawUrl).host === STAGING_SUPABASE_HOST;
  } catch {
    return false;
  }
}

export function readGroundingDecisionDiagnosticsEnabled(): boolean {
  try {
    const deno = (globalThis as { Deno?: { env: { get(name: string): string | undefined } } }).Deno;
    if (!deno?.env?.get) return false;
    return isGroundingDecisionDiagnosticsEnabled({
      flag: deno.env.get(GROUNDING_DECISION_DIAGNOSTICS_FLAG),
      supabaseUrl: deno.env.get('SUPABASE_URL'),
    });
  } catch {
    return false;
  }
}

export function createGroundingCorrelationId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createGroundingDecisionDiagnosticSink(): GroundingDecisionDiagnosticSink | undefined {
  try {
    if (!readGroundingDecisionDiagnosticsEnabled()) return undefined;
    const correlationId = createGroundingCorrelationId();
    return {
      correlationId,
      emit(line: string) {
        console.log(line);
      },
    };
  } catch {
    return undefined;
  }
}

/** Compares claim text only to choose a code. The text is not returned. */
export function claimDisposition(original: string, kept: string | null): GroundingClaimDisposition {
  if (kept == null || kept.trim() === '') return 'removed';
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  return normalize(original) === normalize(kept) ? 'retained' : 'rewritten';
}

function assertClosedRecord(
  payload: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const keys = Object.keys(payload);
  if (keys.length !== allowedKeys.length || allowedKeys.some((key) => !keys.includes(key))) {
    throw new Error('unexpected grounding diagnostic shape');
  }
  const correlationId = payload.correlationId;
  if (typeof correlationId !== 'string' || !CORRELATION_ID_RE.test(correlationId)) {
    throw new Error('unexpected grounding diagnostic correlation id');
  }
  const claimCount = payload.claimCount;
  if (typeof claimCount !== 'number' || !Number.isInteger(claimCount) || claimCount < 0) {
    throw new Error('unexpected grounding diagnostic claim count');
  }
  const tier = payload.knowledgeTier;
  const notice = payload.notice;
  if (typeof tier !== 'string' || !isListed(tier, TIERS)) {
    throw new Error('unexpected grounding diagnostic tier');
  }
  if (typeof notice !== 'string' || !isListed(notice, NOTICE_CLASSES)) {
    throw new Error('unexpected grounding diagnostic notice');
  }
}

export function formatGroundingDecisionLog(input: {
  correlationId: string;
  claimCount: number;
  knowledgeTier: KnowledgeTier;
  notice: GroundingNoticeClass;
  trace: GroundingClaimTrace;
}): string {
  const line = {
    event: 'ask_course_grounding_decision',
    correlationId: input.correlationId,
    claimIndex: input.trace.claimIndex,
    claimCount: input.claimCount,
    relation: input.trace.relation,
    decision: input.trace.decision,
    disposition: input.trace.disposition,
    knowledgeTier: input.knowledgeTier,
    notice: input.notice,
  };
  assertClosedRecord(line, DECISION_KEYS);
  if (
    typeof line.claimIndex !== 'number' ||
    !Number.isInteger(line.claimIndex) ||
    line.claimIndex < 0 ||
    line.claimIndex >= line.claimCount
  ) {
    throw new Error('unexpected grounding diagnostic claim index');
  }
  if (!isListed(line.relation, RELATION_CLASSES)) throw new Error('unexpected grounding diagnostic relation');
  if (!isListed(line.decision, DECISION_CODES)) throw new Error('unexpected grounding diagnostic decision');
  if (!isListed(line.disposition, DISPOSITIONS)) throw new Error('unexpected grounding diagnostic disposition');
  return JSON.stringify(line);
}

export function formatGroundingSummaryLog(input: {
  correlationId: string;
  claimCount: number;
  knowledgeTier: KnowledgeTier;
  notice: GroundingNoticeClass;
}): string {
  const line = {
    event: 'ask_course_grounding_summary',
    correlationId: input.correlationId,
    claimCount: input.claimCount,
    knowledgeTier: input.knowledgeTier,
    notice: input.notice,
  };
  assertClosedRecord(line, SUMMARY_KEYS);
  if (line.event !== 'ask_course_grounding_summary') {
    throw new Error('unexpected grounding diagnostic event');
  }
  return JSON.stringify(line);
}

export function emitGroundingDecisionDiagnostics(
  sink: GroundingDecisionDiagnosticSink | undefined,
  input: {
    claimCount: number;
    knowledgeTier: KnowledgeTier;
    notice: GroundingNoticeClass;
    traces: GroundingClaimTrace[];
  },
): void {
  if (!sink) return;
  try {
    for (const trace of input.traces) {
      try {
        sink.emit(
          formatGroundingDecisionLog({
            correlationId: sink.correlationId,
            claimCount: input.claimCount,
            knowledgeTier: input.knowledgeTier,
            notice: input.notice,
            trace,
          }),
        );
      } catch {
        // One bad claim line must not suppress the summary or the answer.
      }
    }
    sink.emit(
      formatGroundingSummaryLog({
        correlationId: sink.correlationId,
        claimCount: input.claimCount,
        knowledgeTier: input.knowledgeTier,
        notice: input.notice,
      }),
    );
  } catch {
    // Diagnostics must not break the tutor response.
  }
}
