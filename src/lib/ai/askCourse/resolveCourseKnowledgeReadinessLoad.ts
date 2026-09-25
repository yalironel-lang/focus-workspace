/**
 * M1.1C / V1-H2 — pure readiness load resolution (testable fail-closed gate).
 */

import {
  deriveCourseKnowledgeReadiness,
  unknownCourseKnowledgeReadiness,
  mayScheduleHistoricalEnrollment,
  type CourseKnowledgeReadiness,
  type EligibleKnowledgeMaterialRef,
  type KnowledgeNeedsProcessMarkerRef,
  type KnowledgeSourceReadinessRow,
} from './courseKnowledgeReadiness';
import type { FetchSectionKnowledgeSourceRowsResult } from './fetchSectionKnowledgeSourceRows';

export type ResolveCourseKnowledgeReadinessLoadInput = {
  fetched: FetchSectionKnowledgeSourceRowsResult;
  markers: readonly KnowledgeNeedsProcessMarkerRef[];
  eligible: readonly EligibleKnowledgeMaterialRef[];
};

export type ResolveCourseKnowledgeReadinessLoadResult = {
  readiness: CourseKnowledgeReadiness;
  rows: KnowledgeSourceReadinessRow[];
  /** When false, historical enrollment must not run. */
  allowHistoricalEnrollment: boolean;
};

/**
 * Map a readiness fetch (+ markers/eligible) to UI state and enrollment permission.
 * Fetch failure/timeout/unauthenticated ⇒ unknown; never empty/unenrolled.
 */
export function resolveCourseKnowledgeReadinessLoad(
  input: ResolveCourseKnowledgeReadinessLoadInput,
): ResolveCourseKnowledgeReadinessLoadResult {
  if (!input.fetched.ok) {
    return {
      readiness: unknownCourseKnowledgeReadiness(),
      rows: [],
      allowHistoricalEnrollment: false,
    };
  }

  const readiness = deriveCourseKnowledgeReadiness({
    rows: input.fetched.rows,
    markers: input.markers,
    eligible: input.eligible,
  });

  return {
    readiness,
    rows: input.fetched.rows,
    allowHistoricalEnrollment: mayScheduleHistoricalEnrollment(readiness),
  };
}
