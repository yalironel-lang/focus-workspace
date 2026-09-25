/**
 * M1.1D — enroll selected historical Free Space PDFs via existing handoff only.
 */

import {
  isStructuredFsoSafeForKnowledgeProcess,
  scheduleKnowledgeProcessDrainSafe,
} from '../knowledgeProcessHandoff/pdfKnowledgeWiring';
import { buildSpatialAssetPath } from '../../spatialAssetCloud';
import { supabase } from '../../supabase';
import { USER_CONTENT_BUCKET } from '../../userContentStorage';
import {
  HISTORICAL_ENROLL_COOLDOWN_MS,
  HISTORICAL_ENROLL_MAX_MARKS_PER_WAVE,
  planHistoricalEnrollment,
  type PlanHistoricalEnrollmentInput,
} from './planHistoricalEnrollment';
import { isCourseKnowledgeHistoricalEnrollEnabled } from './historicalEnrollmentFlag';
import type {
  EligibleKnowledgeMaterialRef,
  KnowledgeNeedsProcessMarkerRef,
  KnowledgeSourceReadinessRow,
} from './courseKnowledgeReadiness';
import { markNeedsProcess } from '../knowledgeProcessHandoff/controller';

/** Section → last successful enrollment wave timestamp (ms). */
const lastWaveAtBySection = new Map<string, number>();

/** In-flight enroll per section (dedupe concurrent Ask loads). */
const inFlightBySection = new Set<string>();

export function resetHistoricalEnrollmentCooldownForTests(): void {
  lastWaveAtBySection.clear();
  inFlightBySection.clear();
}

export function getHistoricalEnrollmentLastWaveAtForTests(
  sectionId: string,
): number | null {
  return lastWaveAtBySection.get(sectionId.trim()) ?? null;
}

export type EnrollHistoricalResult = {
  attempted: boolean;
  markedIds: string[];
  skipReason: string | null;
};

async function isPdfCloudBacked(input: {
  userId: string;
  sectionId: string;
  sourceObjectId: string;
}): Promise<boolean> {
  const path = buildSpatialAssetPath({
    userId: input.userId,
    sectionId: input.sectionId,
    objectId: input.sourceObjectId,
    assetType: 'pdf',
  });
  try {
    const { data, error } = await supabase.storage
      .from(USER_CONTENT_BUCKET)
      .download(path);
    return !error && !!data && data.size > 0;
  } catch {
    return false;
  }
}

/**
 * Probe which Free Space PDF ids have trusted cloud Storage (authenticated client).
 * Caps probes to avoid Network storms (candidates only, sorted).
 */
export async function probeCloudBackedFreeSpacePdfs(input: {
  userId: string;
  sectionId: string;
  candidateObjectIds: readonly string[];
  /** Soft cap on parallel Storage probes. */
  maxProbes?: number;
}): Promise<Set<string>> {
  const maxProbes = input.maxProbes ?? 8;
  const ids = [...input.candidateObjectIds]
    .filter(Boolean)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, maxProbes);
  const out = new Set<string>();
  await Promise.all(
    ids.map(async id => {
      const ok = await isPdfCloudBacked({
        userId: input.userId,
        sectionId: input.sectionId,
        sourceObjectId: id,
      });
      if (ok) out.add(id);
    }),
  );
  return out;
}

/**
 * Fire-and-forget safe from Ask-open. Never throws to UI.
 * Reuses markNeedsProcess + scheduleKnowledgeProcessDrainSafe only.
 */
export async function enrollHistoricalFreeSpacePdfs(input: {
  sectionId: string;
  userId: string;
  eligible: readonly EligibleKnowledgeMaterialRef[];
  rows: readonly KnowledgeSourceReadinessRow[];
  markers: readonly KnowledgeNeedsProcessMarkerRef[];
  nowMs?: number;
  enabled?: boolean;
  maxMarks?: number;
  cooldownMs?: number;
}): Promise<EnrollHistoricalResult> {
  const sectionId = input.sectionId.trim();
  const userId = input.userId.trim();
  if (!sectionId || !userId) {
    return { attempted: false, markedIds: [], skipReason: 'missing_ids' };
  }

  const enabled =
    input.enabled ?? isCourseKnowledgeHistoricalEnrollEnabled();
  if (!enabled) {
    return { attempted: false, markedIds: [], skipReason: 'flag_off' };
  }

  if (inFlightBySection.has(sectionId)) {
    return { attempted: false, markedIds: [], skipReason: 'in_flight' };
  }

  const nowMs = input.nowMs ?? Date.now();
  const lastWaveAtMs = lastWaveAtBySection.get(sectionId) ?? null;
  const cooldownMs = input.cooldownMs ?? HISTORICAL_ENROLL_COOLDOWN_MS;
  const maxMarks = input.maxMarks ?? HISTORICAL_ENROLL_MAX_MARKS_PER_WAVE;

  // Cooldown gate before Storage probes.
  if (lastWaveAtMs != null && nowMs - lastWaveAtMs < cooldownMs) {
    return { attempted: false, markedIds: [], skipReason: 'cooldown' };
  }

  const unenrolledPdfIds = input.eligible
    .filter(e => e.kind === 'free_space_pdf')
    .map(e => e.sourceObjectId)
    .filter(id => {
      const hasRow = input.rows.some(
        r => r.source_kind === 'free_space_pdf' && r.source_object_id === id,
      );
      const hasMarker = input.markers.some(
        m => m.sourceKind === 'free_space_pdf' && m.sourceObjectId === id,
      );
      return !hasRow && !hasMarker;
    });

  if (unenrolledPdfIds.length === 0) {
    return { attempted: false, markedIds: [], skipReason: 'none_eligible' };
  }

  inFlightBySection.add(sectionId);
  try {
    const cloudBackedPdfIds = await probeCloudBackedFreeSpacePdfs({
      userId,
      sectionId,
      candidateObjectIds: unenrolledPdfIds,
      maxProbes: Math.max(maxMarks * 4, 8),
    });

    const excludedPdfIds = new Set<string>();
    for (const id of cloudBackedPdfIds) {
      const safe = await isStructuredFsoSafeForKnowledgeProcess(
        userId,
        sectionId,
        id,
      );
      if (!safe) excludedPdfIds.add(id);
    }

    const planInput: PlanHistoricalEnrollmentInput = {
      eligible: input.eligible,
      rows: input.rows,
      markers: input.markers,
      cloudBackedPdfIds,
      excludedPdfIds,
      maxMarks,
      nowMs,
      lastWaveAtMs,
      cooldownMs,
      enabled: true,
    };
    const plan = planHistoricalEnrollment(planInput);
    // Bound Storage probes / mark attempts: one wave evaluation per cooldown
    // even when zero PDFs were marked (local-only, excluded, or mark failure).
    lastWaveAtBySection.set(sectionId, nowMs);

    if (plan.sourceObjectIds.length === 0) {
      return {
        attempted: false,
        markedIds: [],
        skipReason: plan.skipReason ?? 'all_skipped',
      };
    }

    const markedIds: string[] = [];
    for (const sourceObjectId of plan.sourceObjectIds) {
      try {
        await markNeedsProcess(sectionId, sourceObjectId);
        scheduleKnowledgeProcessDrainSafe(sectionId, sourceObjectId);
        markedIds.push(sourceObjectId);
      } catch {
        // Never surface to Ask UX; continue remaining.
      }
    }

    return {
      attempted: markedIds.length > 0,
      markedIds,
      skipReason: markedIds.length === 0 ? 'mark_failed' : null,
    };
  } finally {
    inFlightBySection.delete(sectionId);
  }
}
