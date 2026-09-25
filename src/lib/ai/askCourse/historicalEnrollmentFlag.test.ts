/**
 * M1.1D — feature flag default-off + kill-switch semantics.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isCourseKnowledgeHistoricalEnrollEnabled,
  setCourseKnowledgeHistoricalEnrollLocalStorageForTests,
} from './historicalEnrollmentFlag';

describe('isCourseKnowledgeHistoricalEnrollEnabled', () => {
  afterEach(() => {
    setCourseKnowledgeHistoricalEnrollLocalStorageForTests(null);
    vi.unstubAllEnvs();
  });

  it('defaults OFF when env unset', () => {
    vi.stubEnv('VITE_COURSE_KNOWLEDGE_HISTORICAL_ENROLL', '');
    setCourseKnowledgeHistoricalEnrollLocalStorageForTests(null);
    expect(isCourseKnowledgeHistoricalEnrollEnabled()).toBe(false);
  });

  it('env true enables', () => {
    vi.stubEnv('VITE_COURSE_KNOWLEDGE_HISTORICAL_ENROLL', 'true');
    expect(isCourseKnowledgeHistoricalEnrollEnabled()).toBe(true);
  });

  it('env false disables even if localStorage on', () => {
    vi.stubEnv('VITE_COURSE_KNOWLEDGE_HISTORICAL_ENROLL', 'false');
    setCourseKnowledgeHistoricalEnrollLocalStorageForTests('1');
    expect(isCourseKnowledgeHistoricalEnrollEnabled()).toBe(false);
  });

  it('localStorage 1 enables when env unset', () => {
    vi.stubEnv('VITE_COURSE_KNOWLEDGE_HISTORICAL_ENROLL', '');
    setCourseKnowledgeHistoricalEnrollLocalStorageForTests('1');
    expect(isCourseKnowledgeHistoricalEnrollEnabled()).toBe(true);
  });
});
