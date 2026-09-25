/**
 * M1.1D — historical Free Space PDF enrollment planner + enroll bounds.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HISTORICAL_ENROLL_COOLDOWN_MS,
  HISTORICAL_ENROLL_MAX_MARKS_PER_WAVE,
  planHistoricalEnrollment,
} from './planHistoricalEnrollment';
import {
  enrollHistoricalFreeSpacePdfs,
  resetHistoricalEnrollmentCooldownForTests,
} from './enrollHistoricalFreeSpacePdfs';
import type {
  EligibleKnowledgeMaterialRef,
  KnowledgeNeedsProcessMarkerRef,
  KnowledgeSourceReadinessRow,
} from './courseKnowledgeReadiness';
import { deriveCourseKnowledgeReadiness } from './courseKnowledgeReadiness';

const markNeedsProcess = vi.hoisted(() => vi.fn(async (_s: string, id: string) => ({
  sectionId: _s,
  sourceObjectId: id,
  sourceKind: 'free_space_pdf' as const,
  markedAt: Date.now(),
})));
const scheduleKnowledgeProcessDrainSafe = vi.hoisted(() => vi.fn());
const isStructuredFsoSafeForKnowledgeProcess = vi.hoisted(() =>
  vi.fn(async () => true),
);
const storageDownload = vi.hoisted(() =>
  vi.fn(async () => ({ data: new Blob(['%PDF']), error: null })),
);

vi.mock('../knowledgeProcessHandoff/controller', () => ({
  markNeedsProcess,
}));

vi.mock('../knowledgeProcessHandoff/pdfKnowledgeWiring', () => ({
  scheduleKnowledgeProcessDrainSafe,
  isStructuredFsoSafeForKnowledgeProcess,
}));

vi.mock('../../spatialAssetCloud', () => ({
  buildSpatialAssetPath: (input: { objectId: string }) =>
    `u/sec/pdf/${input.objectId}.pdf`,
}));

vi.mock('../../supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        download: storageDownload,
      }),
    },
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }),
    },
  },
}));

vi.mock('../../userContentStorage', () => ({
  USER_CONTENT_BUCKET: 'user-content',
}));

function pdfEligible(id: string): EligibleKnowledgeMaterialRef {
  return { kind: 'free_space_pdf', sourceObjectId: id };
}

function nbEligible(nb: string, page: string): EligibleKnowledgeMaterialRef {
  return { kind: 'notebook_page', notebookObjectId: nb, pageId: page };
}

function pdfRow(
  partial: Partial<KnowledgeSourceReadinessRow> & { source_object_id: string },
): KnowledgeSourceReadinessRow {
  return {
    source_kind: 'free_space_pdf',
    notebook_object_id: null,
    status: 'ready',
    source_version: 1,
    retrieval_source_version: 1,
    error_code: null,
    ...partial,
  };
}

describe('planHistoricalEnrollment', () => {
  const nowMs = 1_000_000;

  it('flag OFF → zero historical marks', () => {
    const plan = planHistoricalEnrollment({
      eligible: [pdfEligible('a'), pdfEligible('b')],
      rows: [],
      markers: [],
      cloudBackedPdfIds: new Set(['a', 'b']),
      nowMs,
      lastWaveAtMs: null,
      enabled: false,
    });
    expect(plan.sourceObjectIds).toEqual([]);
    expect(plan.skipReason).toBe('flag_off');
  });

  it('flag ON → eligible unenrolled selected (deterministic order)', () => {
    const plan = planHistoricalEnrollment({
      eligible: [pdfEligible('c'), pdfEligible('a'), pdfEligible('b')],
      rows: [],
      markers: [],
      cloudBackedPdfIds: new Set(['a', 'b', 'c']),
      nowMs,
      lastWaveAtMs: null,
      enabled: true,
    });
    expect(plan.sourceObjectIds).toEqual(['a', 'b']);
    expect(plan.sourceObjectIds.length).toBe(HISTORICAL_ENROLL_MAX_MARKS_PER_WAVE);
    expect(plan.skipReason).toBeNull();
  });

  it('maximum 2 per wave', () => {
    const plan = planHistoricalEnrollment({
      eligible: ['p1', 'p2', 'p3'].map(pdfEligible),
      rows: [],
      markers: [],
      cloudBackedPdfIds: new Set(['p1', 'p2', 'p3']),
      nowMs,
      lastWaveAtMs: null,
      enabled: true,
    });
    expect(plan.sourceObjectIds).toHaveLength(2);
  });

  it('60-second cooldown', () => {
    const plan = planHistoricalEnrollment({
      eligible: [pdfEligible('a')],
      rows: [],
      markers: [],
      cloudBackedPdfIds: new Set(['a']),
      nowMs: nowMs + HISTORICAL_ENROLL_COOLDOWN_MS - 1,
      lastWaveAtMs: nowMs,
      enabled: true,
    });
    expect(plan.sourceObjectIds).toEqual([]);
    expect(plan.skipReason).toBe('cooldown');
  });

  it('cooldown elapsed → selects again', () => {
    const plan = planHistoricalEnrollment({
      eligible: [pdfEligible('a')],
      rows: [],
      markers: [],
      cloudBackedPdfIds: new Set(['a']),
      nowMs: nowMs + HISTORICAL_ENROLL_COOLDOWN_MS,
      lastWaveAtMs: nowMs,
      enabled: true,
    });
    expect(plan.sourceObjectIds).toEqual(['a']);
  });

  it('already-ready skipped', () => {
    const plan = planHistoricalEnrollment({
      eligible: [pdfEligible('a')],
      rows: [pdfRow({ source_object_id: 'a', status: 'ready' })],
      markers: [],
      cloudBackedPdfIds: new Set(['a']),
      nowMs,
      lastWaveAtMs: null,
      enabled: true,
    });
    expect(plan.sourceObjectIds).toEqual([]);
  });

  it('already-marked skipped', () => {
    const markers: KnowledgeNeedsProcessMarkerRef[] = [
      { sourceKind: 'free_space_pdf', sourceObjectId: 'a' },
    ];
    const plan = planHistoricalEnrollment({
      eligible: [pdfEligible('a'), pdfEligible('b')],
      rows: [],
      markers,
      cloudBackedPdfIds: new Set(['a', 'b']),
      nowMs,
      lastWaveAtMs: null,
      enabled: true,
    });
    expect(plan.sourceObjectIds).toEqual(['b']);
  });

  it('processing skipped', () => {
    const plan = planHistoricalEnrollment({
      eligible: [pdfEligible('a')],
      rows: [pdfRow({ source_object_id: 'a', status: 'processing', retrieval_source_version: null })],
      markers: [],
      cloudBackedPdfIds: new Set(['a']),
      nowMs,
      lastWaveAtMs: null,
      enabled: true,
    });
    expect(plan.sourceObjectIds).toEqual([]);
  });

  it('recovery_pending (pending/stale row) skipped', () => {
    const plan = planHistoricalEnrollment({
      eligible: [pdfEligible('a')],
      rows: [
        pdfRow({
          source_object_id: 'a',
          status: 'pending',
          retrieval_source_version: null,
          error_code: 'recovery_pending',
        }),
      ],
      markers: [],
      cloudBackedPdfIds: new Set(['a']),
      nowMs,
      lastWaveAtMs: null,
      enabled: true,
    });
    expect(plan.sourceObjectIds).toEqual([]);
  });

  it('terminal failure does not continuously remount', () => {
    const plan = planHistoricalEnrollment({
      eligible: [pdfEligible('a')],
      rows: [
        pdfRow({
          source_object_id: 'a',
          status: 'failed',
          retrieval_source_version: null,
          error_code: 'extract_failed',
        }),
      ],
      markers: [],
      cloudBackedPdfIds: new Set(['a']),
      nowMs,
      lastWaveAtMs: null,
      enabled: true,
    });
    expect(plan.sourceObjectIds).toEqual([]);
  });

  it('non-PDF / notebook historical excluded', () => {
    const plan = planHistoricalEnrollment({
      eligible: [nbEligible('nb1', 'pg1'), pdfEligible('a')],
      rows: [],
      markers: [],
      cloudBackedPdfIds: new Set(['a', 'nb1']),
      nowMs,
      lastWaveAtMs: null,
      enabled: true,
    });
    expect(plan.sourceObjectIds).toEqual(['a']);
  });

  it('pending-delete / excluded skipped', () => {
    const plan = planHistoricalEnrollment({
      eligible: [pdfEligible('a'), pdfEligible('b')],
      rows: [],
      markers: [],
      cloudBackedPdfIds: new Set(['a', 'b']),
      excludedPdfIds: new Set(['a']),
      nowMs,
      lastWaveAtMs: null,
      enabled: true,
    });
    expect(plan.sourceObjectIds).toEqual(['b']);
  });

  it('local-only (not cloud-backed) skipped', () => {
    const plan = planHistoricalEnrollment({
      eligible: [pdfEligible('a')],
      rows: [],
      markers: [],
      cloudBackedPdfIds: new Set(),
      nowMs,
      lastWaveAtMs: null,
      enabled: true,
    });
    expect(plan.sourceObjectIds).toEqual([]);
    expect(plan.skipReason).toBe('all_skipped');
  });
});

describe('enrollHistoricalFreeSpacePdfs', () => {
  beforeEach(() => {
    resetHistoricalEnrollmentCooldownForTests();
    markNeedsProcess.mockClear();
    scheduleKnowledgeProcessDrainSafe.mockClear();
    isStructuredFsoSafeForKnowledgeProcess.mockClear();
    storageDownload.mockClear();
    storageDownload.mockResolvedValue({ data: new Blob(['%PDF']), error: null });
    isStructuredFsoSafeForKnowledgeProcess.mockResolvedValue(true);
  });

  it('flag OFF → zero historical marks', async () => {
    const result = await enrollHistoricalFreeSpacePdfs({
      sectionId: 'sec-1',
      userId: 'user-1',
      eligible: [pdfEligible('a'), pdfEligible('b')],
      rows: [],
      markers: [],
      enabled: false,
    });
    expect(result.attempted).toBe(false);
    expect(result.skipReason).toBe('flag_off');
    expect(markNeedsProcess).not.toHaveBeenCalled();
    expect(scheduleKnowledgeProcessDrainSafe).not.toHaveBeenCalled();
  });

  it('flag ON → marks at most 2 via existing handoff', async () => {
    const result = await enrollHistoricalFreeSpacePdfs({
      sectionId: 'sec-1',
      userId: 'user-1',
      eligible: ['a', 'b', 'c'].map(pdfEligible),
      rows: [],
      markers: [],
      enabled: true,
      nowMs: 5_000,
    });
    expect(result.attempted).toBe(true);
    expect(result.markedIds).toEqual(['a', 'b']);
    expect(markNeedsProcess).toHaveBeenCalledTimes(2);
    expect(scheduleKnowledgeProcessDrainSafe).toHaveBeenCalledTimes(2);
    expect(markNeedsProcess).toHaveBeenCalledWith('sec-1', 'a');
    expect(markNeedsProcess).toHaveBeenCalledWith('sec-1', 'b');
  });

  it('repeated calls inside cooldown do not create repeated waves', async () => {
    const input = {
      sectionId: 'sec-1',
      userId: 'user-1',
      eligible: ['a', 'b', 'c'].map(pdfEligible),
      rows: [] as KnowledgeSourceReadinessRow[],
      markers: [] as KnowledgeNeedsProcessMarkerRef[],
      enabled: true,
      nowMs: 10_000,
    };
    const first = await enrollHistoricalFreeSpacePdfs(input);
    expect(first.markedIds).toHaveLength(2);

    const second = await enrollHistoricalFreeSpacePdfs({
      ...input,
      nowMs: 10_000 + HISTORICAL_ENROLL_COOLDOWN_MS - 1,
      // Simulate first wave markers still present for a/b; c still unenrolled.
      markers: first.markedIds.map(id => ({
        sourceKind: 'free_space_pdf' as const,
        sourceObjectId: id,
      })),
    });
    expect(second.attempted).toBe(false);
    expect(second.skipReason).toBe('cooldown');
    expect(markNeedsProcess).toHaveBeenCalledTimes(2);
  });

  it('after cooldown, remaining eligible PDF can enroll', async () => {
    const t0 = 20_000;
    const first = await enrollHistoricalFreeSpacePdfs({
      sectionId: 'sec-2',
      userId: 'user-1',
      eligible: ['a', 'b', 'c'].map(pdfEligible),
      rows: [],
      markers: [],
      enabled: true,
      nowMs: t0,
    });
    expect(first.markedIds).toEqual(['a', 'b']);

    const second = await enrollHistoricalFreeSpacePdfs({
      sectionId: 'sec-2',
      userId: 'user-1',
      eligible: ['a', 'b', 'c'].map(pdfEligible),
      rows: [],
      markers: first.markedIds.map(id => ({
        sourceKind: 'free_space_pdf' as const,
        sourceObjectId: id,
      })),
      enabled: true,
      nowMs: t0 + HISTORICAL_ENROLL_COOLDOWN_MS,
    });
    expect(second.markedIds).toEqual(['c']);
  });

  it('already-ready / processing / failed skipped (no remount)', async () => {
    const result = await enrollHistoricalFreeSpacePdfs({
      sectionId: 'sec-3',
      userId: 'user-1',
      eligible: ['ready1', 'proc1', 'fail1', 'new1'].map(pdfEligible),
      rows: [
        pdfRow({ source_object_id: 'ready1', status: 'ready' }),
        pdfRow({
          source_object_id: 'proc1',
          status: 'processing',
          retrieval_source_version: null,
        }),
        pdfRow({
          source_object_id: 'fail1',
          status: 'failed',
          retrieval_source_version: null,
        }),
      ],
      markers: [],
      enabled: true,
      nowMs: 30_000,
    });
    expect(result.markedIds).toEqual(['new1']);
  });

  it('local-only PDF (download miss) is not marked', async () => {
    storageDownload.mockResolvedValue({
      data: null,
      error: { message: 'not found' },
    } as never);
    const result = await enrollHistoricalFreeSpacePdfs({
      sectionId: 'sec-4',
      userId: 'user-1',
      eligible: [pdfEligible('local-only')],
      rows: [],
      markers: [],
      enabled: true,
      nowMs: 40_000,
    });
    expect(result.attempted).toBe(false);
    expect(markNeedsProcess).not.toHaveBeenCalled();
  });

  it('pending-delete skipped via FSO safety check', async () => {
    isStructuredFsoSafeForKnowledgeProcess.mockImplementation(
      (async (_u: string, _s: string, id: string) => id !== 'doomed') as never,
    );
    const result = await enrollHistoricalFreeSpacePdfs({
      sectionId: 'sec-5',
      userId: 'user-1',
      eligible: [pdfEligible('doomed'), pdfEligible('ok')],
      rows: [],
      markers: [],
      enabled: true,
      nowMs: 50_000,
    });
    expect(result.markedIds).toEqual(['ok']);
  });

  it('notebook historical never marked', async () => {
    const result = await enrollHistoricalFreeSpacePdfs({
      sectionId: 'sec-6',
      userId: 'user-1',
      eligible: [nbEligible('nb1', 'pg1')],
      rows: [],
      markers: [],
      enabled: true,
      nowMs: 60_000,
    });
    expect(result.attempted).toBe(false);
    expect(result.skipReason).toBe('none_eligible');
    expect(markNeedsProcess).not.toHaveBeenCalled();
  });
});

describe('readiness after historical mark', () => {
  it('unenrolled → preparing after marker appears', () => {
    const eligible = [pdfEligible('a')];
    const before = deriveCourseKnowledgeReadiness({
      rows: [],
      markers: [],
      eligible,
    });
    expect(before.unenrolledCount).toBe(1);
    expect(before.kind).toBe('empty');
    expect(before.emptyReason).toBe('not_indexed');

    const after = deriveCourseKnowledgeReadiness({
      rows: [],
      markers: [{ sourceKind: 'free_space_pdf', sourceObjectId: 'a' }],
      eligible,
    });
    expect(after.unenrolledCount).toBe(0);
    expect(after.kind).toBe('preparing');
    expect(after.preparingCount).toBe(1);
  });
});
