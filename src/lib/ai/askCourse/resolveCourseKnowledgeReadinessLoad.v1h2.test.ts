/**
 * V1-H2 — fail-closed readiness load + historical enrollment gate.
 */

import { describe, expect, it } from 'vitest';
import {
  courseKnowledgeReadinessMessage,
  mayScheduleHistoricalEnrollment,
  unknownCourseKnowledgeReadiness,
  type EligibleKnowledgeMaterialRef,
  type KnowledgeSourceReadinessRow,
} from './courseKnowledgeReadiness';
import { resolveCourseKnowledgeReadinessLoad } from './resolveCourseKnowledgeReadinessLoad';

function pdfEligible(id: string): EligibleKnowledgeMaterialRef {
  return { kind: 'free_space_pdf', sourceObjectId: id };
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

describe('resolveCourseKnowledgeReadinessLoad (V1-H2)', () => {
  it('1. successful readiness + unenrolled eligible PDFs → allow historical enrollment', () => {
    const resolved = resolveCourseKnowledgeReadinessLoad({
      fetched: { ok: true, rows: [] },
      markers: [],
      eligible: [pdfEligible('a'), pdfEligible('b')],
    });
    expect(resolved.readiness.kind).toBe('empty');
    expect(resolved.readiness.emptyReason).toBe('not_indexed');
    expect(resolved.readiness.unenrolledCount).toBe(2);
    expect(resolved.allowHistoricalEnrollment).toBe(true);
    expect(mayScheduleHistoricalEnrollment(resolved.readiness)).toBe(true);
  });

  it('2. readiness query failure → unknown + no historical enrollment', () => {
    const resolved = resolveCourseKnowledgeReadinessLoad({
      fetched: { ok: false, code: 'query_failed' },
      markers: [],
      eligible: [pdfEligible('a'), pdfEligible('b')],
    });
    expect(resolved.readiness.kind).toBe('unknown');
    expect(resolved.readiness.askUsable).toBe(false);
    expect(resolved.readiness.unenrolledCount).toBe(0);
    expect(resolved.readiness.emptyReason).toBeNull();
    expect(resolved.allowHistoricalEnrollment).toBe(false);
    expect(resolved.rows).toEqual([]);
  });

  it('3. readiness timeout (budget fallback shape) → unknown + no enrollment', () => {
    // Hook maps timeout via withBudget to { ok: false, code: 'query_failed' }.
    const resolved = resolveCourseKnowledgeReadinessLoad({
      fetched: { ok: false, code: 'query_failed' },
      markers: [],
      eligible: [pdfEligible('hist-1')],
    });
    expect(resolved.allowHistoricalEnrollment).toBe(false);
    expect(resolved.readiness.kind).toBe('unknown');
  });

  it('4. malformed/error result (unauthenticated) → fail closed', () => {
    const resolved = resolveCourseKnowledgeReadinessLoad({
      fetched: { ok: false, code: 'unauthenticated' },
      markers: [],
      eligible: [pdfEligible('a')],
    });
    expect(resolved.readiness).toEqual(unknownCourseKnowledgeReadiness());
    expect(resolved.allowHistoricalEnrollment).toBe(false);
  });

  it('5. failure state is NOT empty / no_materials', () => {
    const resolved = resolveCourseKnowledgeReadinessLoad({
      fetched: { ok: false, code: 'query_failed' },
      markers: [],
      eligible: [],
    });
    expect(resolved.readiness.kind).not.toBe('empty');
    expect(resolved.readiness.emptyReason).toBeNull();
    const msg = courseKnowledgeReadinessMessage(resolved.readiness);
    expect(msg).toBeTruthy();
    expect(msg).not.toMatch(/not available|no materials|Preparing/i);
    expect(msg).toContain('couldn’t be checked');
  });

  it('6. retry success → normal readiness resumes (including enrollment gate)', () => {
    const fail = resolveCourseKnowledgeReadinessLoad({
      fetched: { ok: false, code: 'query_failed' },
      markers: [],
      eligible: [pdfEligible('a')],
    });
    expect(fail.allowHistoricalEnrollment).toBe(false);

    const ok = resolveCourseKnowledgeReadinessLoad({
      fetched: {
        ok: true,
        rows: [pdfRow({ source_object_id: 'a' })],
      },
      markers: [],
      eligible: [pdfEligible('a')],
    });
    expect(ok.readiness.kind).toBe('ready');
    expect(ok.readiness.askUsable).toBe(true);
    expect(ok.allowHistoricalEnrollment).toBe(false); // already enrolled
  });

  it('partialPreparing + askUsable remains allow-enroll only when unenrolled > 0', () => {
    const withUnenrolled = resolveCourseKnowledgeReadinessLoad({
      fetched: {
        ok: true,
        rows: [pdfRow({ source_object_id: 'ready-1' })],
      },
      markers: [],
      eligible: [pdfEligible('ready-1'), pdfEligible('hist-new')],
    });
    expect(withUnenrolled.readiness.askUsable).toBe(true);
    expect(withUnenrolled.readiness.partialPreparing).toBe(true);
    expect(withUnenrolled.allowHistoricalEnrollment).toBe(true);
  });

  it('successful empty no_materials → no historical enrollment', () => {
    const resolved = resolveCourseKnowledgeReadinessLoad({
      fetched: { ok: true, rows: [] },
      markers: [],
      eligible: [],
    });
    expect(resolved.readiness.kind).toBe('empty');
    expect(resolved.readiness.emptyReason).toBe('no_materials');
    expect(resolved.allowHistoricalEnrollment).toBe(false);
  });
});

describe('mayScheduleHistoricalEnrollment', () => {
  it('unknown never schedules', () => {
    expect(mayScheduleHistoricalEnrollment(unknownCourseKnowledgeReadiness())).toBe(false);
  });
});
