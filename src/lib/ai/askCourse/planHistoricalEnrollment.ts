/**
 * M1.1D — pure planner for bounded historical Free Space PDF enrollment.
 * Selects unenrolled cloud-backed Free Space PDFs only (no notebooks/shelf).
 */

import type {
  EligibleKnowledgeMaterialRef,
  KnowledgeNeedsProcessMarkerRef,
  KnowledgeSourceReadinessRow,
} from './courseKnowledgeReadiness';

/** Max historical Free Space PDFs marked per section per wave. */
export const HISTORICAL_ENROLL_MAX_MARKS_PER_WAVE = 2;

/** Minimum ms between enrollment waves for the same section. */
export const HISTORICAL_ENROLL_COOLDOWN_MS = 60_000;

export type HistoricalEnrollmentPlan = {
  /** Free Space PDF object ids to mark this wave (length ≤ max). */
  sourceObjectIds: string[];
  /** Why the wave is empty (for tests / diagnostics; never UI). */
  skipReason:
    | null
    | 'flag_off'
    | 'cooldown'
    | 'none_eligible'
    | 'all_skipped';
};

export type PlanHistoricalEnrollmentInput = {
  eligible: readonly EligibleKnowledgeMaterialRef[];
  rows: readonly KnowledgeSourceReadinessRow[];
  markers: readonly KnowledgeNeedsProcessMarkerRef[];
  /** Object ids known to have trusted user-content Storage. */
  cloudBackedPdfIds: ReadonlySet<string>;
  /** Object ids with pending FSO delete (or otherwise unsafe). */
  excludedPdfIds?: ReadonlySet<string>;
  maxMarks?: number;
  nowMs: number;
  lastWaveAtMs: number | null;
  cooldownMs?: number;
  /** When false, always return empty (flag seam for pure tests). */
  enabled: boolean;
};

function pdfRowKey(sourceObjectId: string): string {
  return `pdf:${sourceObjectId}`;
}

/**
 * Deterministic selection of historical Free Space PDFs to enroll.
 * Skips: notebooks, non-cloud, excluded, any existing source row, markers,
 * terminal failed (row present), already in-flight via marker.
 */
export function planHistoricalEnrollment(
  input: PlanHistoricalEnrollmentInput,
): HistoricalEnrollmentPlan {
  const maxMarks = input.maxMarks ?? HISTORICAL_ENROLL_MAX_MARKS_PER_WAVE;
  const cooldownMs = input.cooldownMs ?? HISTORICAL_ENROLL_COOLDOWN_MS;

  if (!input.enabled) {
    return { sourceObjectIds: [], skipReason: 'flag_off' };
  }

  if (
    input.lastWaveAtMs != null &&
    Number.isFinite(input.lastWaveAtMs) &&
    input.nowMs - input.lastWaveAtMs < cooldownMs
  ) {
    return { sourceObjectIds: [], skipReason: 'cooldown' };
  }

  const markerPdfIds = new Set<string>();
  for (const m of input.markers) {
    if (m.sourceKind === 'free_space_pdf') markerPdfIds.add(m.sourceObjectId);
  }

  const rowByPdfId = new Map<string, KnowledgeSourceReadinessRow>();
  for (const row of input.rows) {
    if (row.source_kind !== 'free_space_pdf') continue;
    rowByPdfId.set(row.source_object_id, row);
  }

  const excluded = input.excludedPdfIds ?? new Set<string>();

  const candidates: string[] = [];
  for (const el of input.eligible) {
    if (el.kind !== 'free_space_pdf') continue;
    const id = el.sourceObjectId;
    if (!id || excluded.has(id)) continue;
    if (!input.cloudBackedPdfIds.has(id)) continue;
    if (markerPdfIds.has(id)) continue;
    const row = rowByPdfId.get(id);
    if (row) {
      // Any existing source row ⇒ not "historical unenrolled".
      // Terminal failed: do not remount continuously.
      continue;
    }
    candidates.push(id);
  }

  if (candidates.length === 0) {
    const hadPdfEligible = input.eligible.some(e => e.kind === 'free_space_pdf');
    return {
      sourceObjectIds: [],
      skipReason: hadPdfEligible ? 'all_skipped' : 'none_eligible',
    };
  }

  candidates.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const selected = candidates.slice(0, Math.max(0, maxMarks));
  return {
    sourceObjectIds: selected,
    skipReason: selected.length === 0 ? 'all_skipped' : null,
  };
}

export function historicalEnrollmentMaterialKey(
  sourceObjectId: string,
): string {
  return pdfRowKey(sourceObjectId);
}
