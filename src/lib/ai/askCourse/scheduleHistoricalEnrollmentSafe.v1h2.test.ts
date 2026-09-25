/**
 * V1-H2 — scheduleHistoricalEnrollmentSafe fail-closed gate (no React harness).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const enrollHistoricalFreeSpacePdfs = vi.hoisted(() => vi.fn(async () => ({
  attempted: true,
  markedIds: ['a'],
  skipReason: null,
})));
const isCourseKnowledgeHistoricalEnrollEnabled = vi.hoisted(() => vi.fn(() => true));

vi.mock('./enrollHistoricalFreeSpacePdfs', () => ({
  enrollHistoricalFreeSpacePdfs: (...args: unknown[]) =>
    enrollHistoricalFreeSpacePdfs(...args),
}));

vi.mock('./historicalEnrollmentFlag', () => ({
  isCourseKnowledgeHistoricalEnrollEnabled: () =>
    isCourseKnowledgeHistoricalEnrollEnabled(),
}));

vi.mock('../../supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'user-h2' } } },
      }),
    },
  },
}));

const { scheduleHistoricalEnrollmentSafe } = await import('./useCourseKnowledgeReadiness');
const { resolveCourseKnowledgeReadinessLoad } = await import(
  './resolveCourseKnowledgeReadinessLoad'
);

const eligible = [
  { kind: 'free_space_pdf' as const, sourceObjectId: 'a' },
  { kind: 'free_space_pdf' as const, sourceObjectId: 'b' },
];

beforeEach(() => {
  enrollHistoricalFreeSpacePdfs.mockClear();
  isCourseKnowledgeHistoricalEnrollEnabled.mockReset();
  isCourseKnowledgeHistoricalEnrollEnabled.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('scheduleHistoricalEnrollmentSafe (V1-H2)', () => {
  it('1. successful readiness + unenrolled → schedules enroll', async () => {
    const resolved = resolveCourseKnowledgeReadinessLoad({
      fetched: { ok: true, rows: [] },
      markers: [],
      eligible,
    });
    expect(resolved.allowHistoricalEnrollment).toBe(true);
    scheduleHistoricalEnrollmentSafe({
      sectionId: 'sec-1',
      eligible,
      rows: resolved.rows,
      markers: [],
      allowHistoricalEnrollment: resolved.allowHistoricalEnrollment,
    });
    await vi.waitFor(() => {
      expect(enrollHistoricalFreeSpacePdfs).toHaveBeenCalledTimes(1);
    });
  });

  it('2–4. fetch failure / timeout / unauthenticated → 0 historical marks', async () => {
    for (const code of ['query_failed', 'unauthenticated'] as const) {
      enrollHistoricalFreeSpacePdfs.mockClear();
      const resolved = resolveCourseKnowledgeReadinessLoad({
        fetched: { ok: false, code },
        markers: [],
        eligible,
      });
      expect(resolved.allowHistoricalEnrollment).toBe(false);
      scheduleHistoricalEnrollmentSafe({
        sectionId: 'sec-1',
        eligible,
        rows: resolved.rows,
        markers: [],
        allowHistoricalEnrollment: resolved.allowHistoricalEnrollment,
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(enrollHistoricalFreeSpacePdfs).not.toHaveBeenCalled();
    }
  });

  it('12. kill switch OFF → no enroll even when allowHistoricalEnrollment', async () => {
    isCourseKnowledgeHistoricalEnrollEnabled.mockReturnValue(false);
    scheduleHistoricalEnrollmentSafe({
      sectionId: 'sec-1',
      eligible,
      rows: [],
      markers: [],
      allowHistoricalEnrollment: true,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(enrollHistoricalFreeSpacePdfs).not.toHaveBeenCalled();
  });
});
